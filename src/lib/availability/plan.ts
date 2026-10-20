/**
 * Availability (Bookings → Availability): the practitioner types their hours once, picks any number of dates, and
 * those hours are saved for each date. There are no default weekly hours; a date with no hours isn't bookable.
 * Rows live in availability_days, which the availability engine reads for every slot shown or booked on the website.
 */
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { availabilityDays, blockedTimes, bookings, clients, services } from "@/db/schema";
import { addDaysIso, formatTime, localDateOf, localDayBounds } from "@/lib/time";
import type { DayAvailability, HoursRange } from "./engine";
import { loadDayHours } from "./index";

const MAX_DATES = 200;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times must be HH:MM.");
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const invalid = (message: string) => new z.ZodError([{ code: "custom", path: [], message, input: undefined }]);

/** Validate and normalise hours: at least one range, each starts before it ends, sorted, no overlaps. */
export function parseRanges(input: unknown): HoursRange[] {
  const ranges = z.array(z.object({ open: hhmm, close: hhmm })).min(1, "Enter at least one start and finish time.").max(6, "At most 6 time blocks per day.").parse(input);
  const sorted = [...ranges].sort((a, b) => toMin(a.open) - toMin(b.open));
  sorted.forEach((r, i) => {
    if (toMin(r.close) <= toMin(r.open)) throw invalid(`${r.open}–${r.close}: the finish must be after the start.`);
    const prev = sorted[i - 1];
    if (prev && toMin(r.open) < toMin(prev.close)) throw invalid(`${prev.open}–${prev.close} and ${r.open}–${r.close} overlap.`);
  });
  return sorted;
}

export function parseDates(input: unknown): string[] {
  const dates = z.array(isoDate).min(1, "Pick at least one day.").max(MAX_DATES, `Pick at most ${MAX_DATES} days at a time.`).parse(input);
  return [...new Set(dates)].sort();
}

export const parseCap = (input: unknown) => z.number().int().min(1).max(30).nullable().parse(input ?? null);

/** Save the same hours on every given date (replacing whatever was there). */
export async function setDays(db: DbOrTx, practitionerId: string, dates: string[], hours: DayAvailability, now = new Date()) {
  for (const date of dates) {
    await db
      .insert(availabilityDays)
      .values({ practitionerId, date, ranges: hours.ranges, cap: hours.cap })
      .onConflictDoUpdate({ target: [availabilityDays.practitionerId, availabilityDays.date], set: { ranges: hours.ranges, cap: hours.cap, updatedAt: now } });
  }
}

/** Remove the hours from these dates: they stop being bookable. */
export async function clearDays(db: DbOrTx, practitionerId: string, dates: string[]) {
  await db.delete(availabilityDays).where(and(eq(availabilityDays.practitionerId, practitionerId), inArray(availabilityDays.date, dates)));
}

/** Upcoming bookings on these dates that fall outside `ranges` ([] = all of them). Kept, never cancelled; the admin is warned. */
export async function bookingsOutside(db: DbOrTx, practitionerId: string, dates: string[], ranges: HoursRange[]) {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const rows = await db
    .select({ id: bookings.id, startsAt: bookings.startsAt, endsAt: bookings.endsAt, firstName: clients.firstName, service: services.shortName })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(
      and(
        eq(bookings.practitionerId, practitionerId),
        inArray(bookings.status, ["confirmed", "pending_payment"]),
        gte(bookings.startsAt, localDayBounds(sorted[0]).start),
        lt(bookings.startsAt, localDayBounds(addDaysIso(sorted[sorted.length - 1], 1)).start),
      ),
    )
    .orderBy(asc(bookings.startsAt));
  const wanted = new Set(dates);
  return rows.filter((b) => {
    if (!wanted.has(localDateOf(b.startsAt))) return false;
    const s = toMin(formatTime(b.startsAt));
    const e = s + Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
    return !ranges.some((r) => s >= toMin(r.open) && e <= toMin(r.close));
  });
}

export type CalendarDay = {
  dateIso: string;
  /** Hours entered for this date; [] = not available. */
  ranges: HoursRange[];
  cap: number | null;
  booked: number;
  /** Time off / Google Calendar events on this date. */
  blocked: number;
};

/** What the availability calendar shows for `days` days from `fromIso`. */
export async function calendarRange(db: DbOrTx, practitionerId: string, fromIso: string, days: number): Promise<CalendarDay[]> {
  const toIso = addDaysIso(fromIso, days);
  const range = { start: localDayBounds(fromIso).start, end: localDayBounds(toIso).start };
  const [entered, booked, blocks] = await Promise.all([
    loadDayHours(db, practitionerId, fromIso, toIso),
    db
      .select({ startsAt: bookings.startsAt })
      .from(bookings)
      .where(and(eq(bookings.practitionerId, practitionerId), inArray(bookings.status, ["confirmed", "pending_payment", "attended"]), gte(bookings.startsAt, range.start), lt(bookings.startsAt, range.end))),
    db
      .select({ startsAt: blockedTimes.startsAt, endsAt: blockedTimes.endsAt })
      .from(blockedTimes)
      .where(and(eq(blockedTimes.practitionerId, practitionerId), lt(blockedTimes.startsAt, range.end), gte(blockedTimes.endsAt, range.start))),
  ]);
  const count = (m: Map<string, number>, d: string) => m.set(d, (m.get(d) ?? 0) + 1);
  const bookedBy = new Map<string, number>();
  for (const b of booked) count(bookedBy, localDateOf(b.startsAt));
  const blockedBy = new Map<string, number>();
  for (const b of blocks) for (let d = localDateOf(b.startsAt); d <= localDateOf(new Date(b.endsAt.getTime() - 1)); d = addDaysIso(d, 1)) count(blockedBy, d);

  return Array.from({ length: days }, (_, i) => {
    const dateIso = addDaysIso(fromIso, i);
    const e = entered.get(dateIso);
    return { dateIso, ranges: e?.ranges ?? [], cap: e?.cap ?? null, booked: bookedBy.get(dateIso) ?? 0, blocked: blockedBy.get(dateIso) ?? 0 };
  });
}
