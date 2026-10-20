import { sql } from "drizzle-orm";
import { business } from "@config/business";
import { getDb, type Db } from "@/db/client";
import { availabilityDays } from "@/db/schema";
import type { DayAvailability } from "@/lib/availability/engine";
import { addDaysIso, localWeekday } from "@/lib/time";
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
  await openTestHours(db);
  return db;
}

/**
 * There are no default weekly hours: only entered dates are bookable. Tests get a fixed pattern entered for the
 * whole test window (Dec 2026 – Apr 2027): Mon–Fri 08:00–19:00, Sat 09:00–15:00, Sunday not available.
 */
export function testHours(dateIso: string): DayAvailability | null {
  const wd = localWeekday(dateIso);
  if (wd === 0) return null;
  return { ranges: [wd === 6 ? { open: "09:00", close: "15:00" } : { open: "08:00", close: "19:00" }], cap: null };
}
export async function openTestHours(db: Db, from = "2026-12-01", to = "2027-04-30") {
  const rows = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const h = testHours(d);
    if (h) rows.push({ practitionerId: business.practitioner.id, date: d, ranges: h.ranges, cap: h.cap });
  }
  await db.insert(availabilityDays).values(rows).onConflictDoNothing();
}

/** A Monday well in the future, in GMT (no DST surprises unless a test wants them). */
export const MON = "2027-01-11";
export const SAT = "2027-01-16";
export const SUN = "2027-01-17";
