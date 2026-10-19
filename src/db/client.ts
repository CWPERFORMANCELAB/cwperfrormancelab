import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { forbidInStrict, isStrict } from "@/lib/env";
import * as schema from "./schema";

/**
 * One Drizzle instance for the process.
 *  - DATABASE_URL set  → postgres.js against Supabase/Postgres.
 *  - DATABASE_URL unset → PGlite (embedded Postgres). Persisted in .data/pglite, or in-memory when PGLITE_MEMORY=1
 *    (tests). Same migrations either way.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Global = typeof globalThis & { __cwDb?: Promise<Db>; __cwDbKind?: "postgres" | "pglite" };
const g = globalThis as Global;

const migrationsFolder = path.join(process.cwd(), "src/db/migrations");

/**
 * Serverless-safe Postgres client (PRE-DEPLOY-FIXES #3).
 *  - Use Supabase's transaction pooler (port 6543) in DATABASE_URL; `prepare: false` is required by the pooler.
 *  - Tiny pool per instance (DB_POOL_MAX, default 2, max 3) so traffic spikes can't exhaust connections.
 *  - Migrations never run implicitly in production/preview: run `npm run db:migrate` as a deploy step instead.
 */
export function poolMax(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.DB_POOL_MAX ?? 2);
  return Math.min(3, Math.max(1, Number.isFinite(n) ? Math.round(n) : 2));
}

export function shouldAutoMigrate(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.AUTO_MIGRATE === "true") return true;
  if (env.AUTO_MIGRATE === "false") return false;
  return !isStrict(env); // local: convenient; production/preview: explicit `npm run db:migrate` only
}

async function createPostgres(url: string): Promise<Db> {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;
  warnIfNotPooler(url);
  const sqlClient = postgres(url, { prepare: false, max: poolMax(), idle_timeout: 20, connect_timeout: 10 });
  const db = drizzle(sqlClient, { schema });
  if (shouldAutoMigrate()) await migrate(db, { migrationsFolder });
  g.__cwDbKind = "postgres";
  return db as unknown as Db;
}

function warnIfNotPooler(url: string) {
  try {
    const u = new URL(url);
    if (isStrict() && u.hostname.includes("supabase") && u.port !== "6543") {
      console.warn(`[db] DATABASE_URL uses port ${u.port || 5432}. On serverless, use Supabase's transaction pooler (port 6543).`);
    }
  } catch {}
}

/**
 * Fails loudly if the database is missing the guarantees the booking system relies on (run at every connect, and
 * by `npm run db:migrate`). Without the exclusion constraint, double bookings would only be prevented by app code.
 */
export async function verifyDbInvariants(db: Db) {
  const rows = (r: unknown) => (Array.isArray(r) ? r : ((r as { rows?: unknown[] }).rows ?? [])) as Record<string, unknown>[];
  const { sql } = await import("drizzle-orm");
  const ext = rows(await db.execute(sql`select 1 as ok from pg_extension where extname = 'btree_gist'`));
  const con = rows(await db.execute(sql`select 1 as ok from pg_constraint where conname = 'bookings_no_overlap' and contype = 'x'`));
  const problems = [!ext.length && "extension btree_gist", !con.length && "exclusion constraint bookings_no_overlap"].filter(Boolean);
  if (problems.length) {
    throw new Error(`Database is missing ${problems.join(" and ")}. Run \`npm run db:migrate\` against this database before serving traffic.`);
  }
}

async function createPglite(): Promise<Db> {
  // On serverless hosts PGlite would write to a temporary disk and lose every booking on the next cold start.
  forbidInStrict("The embedded PGlite database (DATABASE_URL is not set)");
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import("@electric-sql/pglite/contrib/btree_gist");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const memory = process.env.PGLITE_MEMORY === "1";
  const dataDir = path.join(process.cwd(), process.env.PGLITE_DIR || ".data/pglite");
  if (!memory) fs.mkdirSync(dataDir, { recursive: true });
  const client = memory ? new PGlite({ extensions: { btree_gist } }) : new PGlite(dataDir, { extensions: { btree_gist } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  g.__cwDbKind = "pglite";
  return db as unknown as Db;
}

/** First run on an empty database: apply config/seed-settings.ts and create the admin user. */
async function bootstrap(db: Db): Promise<Db> {
  if (process.env.VITEST) return db; // tests seed explicitly
  const { applyClientDetails } = await import("@/lib/seed/apply");
  const { ensureAdminUser } = await import("@/lib/auth/bootstrap");
  await applyClientDetails(db, { onlyIfEmpty: true });
  await ensureAdminUser(db);
  return db;
}

export function getDb(): Promise<Db> {
  if (!g.__cwDb) {
    const url = process.env.DATABASE_URL;
    g.__cwDb = (url ? createPostgres(url) : createPglite())
      .then(async (db) => {
        await verifyDbInvariants(db);
        return db;
      })
      .then(bootstrap)
      .catch((err) => {
        g.__cwDb = undefined;
        throw err;
      });
  }
  return g.__cwDb;
}

export function dbKind() {
  return g.__cwDbKind ?? (process.env.DATABASE_URL ? "postgres" : "pglite");
}

/** Tests: drop the cached instance so each suite gets a fresh in-memory DB. */
export function resetDbForTests() {
  g.__cwDb = undefined;
}

export { schema };
