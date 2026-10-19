import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";
import { business } from "@config/business";

/**
 * All business-time maths goes through here so BST/GMT changes are handled in one place.
 * "Local" always means Europe/London (business.timezone).
 */
export const TZ = business.timezone;

/** "2026-10-25" + "09:30" in London → UTC Date (handles BST/GMT automatically). */
export function localToUtc(dateIso: string, hhmm: string, tz = TZ): Date {
  return fromZonedTime(`${dateIso}T${hhmm}:00`, tz);
}

/** UTC Date → "YYYY-MM-DD" of the London calendar day it falls on. */
export function localDateOf(d: Date, tz = TZ): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

/** Day of week (0 = Sunday) of the London calendar day. */
export function localWeekday(dateIso: string): number {
  // Noon UTC on that calendar date is always the same calendar day in London.
  return new Date(`${dateIso}T12:00:00Z`).getUTCDay();
}

/** Start and end (exclusive) of a London calendar day, as UTC instants. 23h or 25h on clock-change days. */
export function localDayBounds(dateIso: string, tz = TZ): { start: Date; end: Date } {
  return { start: localToUtc(dateIso, "00:00", tz), end: localToUtc(addDaysIso(dateIso, 1), "00:00", tz) };
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function todayLocal(now = new Date()): string {
  return localDateOf(now);
}

export function formatLocal(d: Date, fmt: string): string {
  return formatInTimeZone(d, TZ, fmt);
}

/** e.g. "Tue 4 Nov, 10:30" */
export function formatSlot(d: Date): string {
  return formatInTimeZone(d, TZ, "EEE d MMM, HH:mm");
}

/** e.g. "Tuesday 4 November 2026 at 10:30" */
export function formatLong(d: Date): string {
  return formatInTimeZone(d, TZ, "EEEE d MMMM yyyy 'at' HH:mm");
}

export function formatTime(d: Date): string {
  return formatInTimeZone(d, TZ, "HH:mm");
}

export { toZonedTime };

export function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 3_600_000;
}
