/**
 * npm run db:migrate — the ONLY way migrations run in production/preview (PRE-DEPLOY-FIXES #3).
 *
 * Uses MIGRATION_DATABASE_URL (Supabase *direct* connection, port 5432) when set, because DDL and the migration lock
 * don't belong on the transaction pooler; falls back to DATABASE_URL. Single connection. Afterwards it verifies the
 * btree_gist extension and the bookings_no_overlap exclusion constraint exist, then seeds an empty database.
 * Without either URL it migrates the local PGlite database.
 */
import "./env";
import path from "node:path";
import { dbKind, getDb, verifyDbInvariants, type Db } from "../src/db/client";
import { applyClientDetails } from "../src/lib/seed/apply";
import { ensureAdminUser } from "../src/lib/auth/bootstrap";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  let db: Db;
  let close = async () => {};
  if (url) {
    const postgres = (await import("postgres")).default;
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { max: 1, prepare: false, connect_timeout: 15 });
    db = drizzle(client, { schema }) as unknown as Db;
    close = () => client.end();
    console.log(`→ Migrating ${new URL(url).hostname} (${process.env.MIGRATION_DATABASE_URL ? "direct" : "DATABASE_URL"})…`);
    await migrate(db as never, { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
  } else {
    db = await getDb(); // PGlite migrates on connect
    console.log(`→ Migrating local ${dbKind()} database…`);
  }
  await verifyDbInvariants(db);
  console.log("✓ btree_gist extension and bookings_no_overlap constraint present");
  await applyClientDetails(db, { onlyIfEmpty: true });
  await ensureAdminUser(db);
  console.log("✓ Database ready");
  await close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("✗ Migration failed:", e.message ?? e);
    process.exit(1);
  });
