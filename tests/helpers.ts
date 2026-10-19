import { sql } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { applyClientDetails } from "@/lib/seed/apply";

/**
 * In-memory Postgres (PGlite), migrated once per test file. Each test gets a clean slate via TRUNCATE + re-applying
 * client details — much faster than booting a new database per test.
 */
export async function freshDb(): Promise<Db> {
  const db = await getDb();
  const r = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { rows: { tablename: string }[] };
  const tables = r.rows.map((t) => `"${t.tablename}"`).filter((t) => !t.includes("drizzle"));
  if (tables.length) await db.execute(sql.raw(`truncate ${tables.join(", ")} restart identity cascade`));
  await applyClientDetails(db);
  return db;
}

/** A Monday well in the future, in GMT (no DST surprises unless a test wants them). */
export const MON = "2027-01-11";
export const SAT = "2027-01-16";
export const SUN = "2027-01-17";
