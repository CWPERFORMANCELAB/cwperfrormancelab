/**
 * Pure availability engine. No DB, no clock — everything is passed in, so it is exhaustively testable.
 *
 * Model (DECISIONS.md #3): a booking occupies [start, end + buffer). Two time-blocking bookings may not have
 * overlapping occupied ranges. Blocked time (holidays, Google Calendar events) is busy time.
 */
import type { Settings } from "@/lib/settings-schema";
import { addDaysIso, addMinutes, localDayBounds, localToUtc, localWeekday, todayLocal } from "@/lib/time";

export type Interval = { start: Date; end: Date };

export type EngineService = {
  durationMin: number;
  bufferMin: number;
  runsConcurrently: boolean;
};

export type DayInput = {
  dateIso: string; // London calendar date
  service: EngineService;
  workingHours: Settings["workingHours"];
  dailyCaps: Settings["dailyCaps"];
  rules: Settings["bookingRules"];
  /** Occupied ranges of existing time-blocking bookings + blocked times overlapping this day. */
  busy: Interval[];
  /** Active bookings already on this London day (all services — every appointment counts towards the cap). */
  bookingsOnDay: number;
  now: Date;
};

export type DayResult = {
  dateIso: string;
  slots: Date[];
  /** Why the day has no slots — used for helpful empty states. */
  reason?: "closed" | "full" | "past" | "beyond_window" | "no_space";
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function minutesToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function slotsForDay(input: DayInput): DayResult {
  const { dateIso, service, workingHours, dailyCaps, rules, busy, bookingsOnDay, now } = input;
  const weekday = localWeekday(dateIso) as keyof Settings["workingHours"];
  const ranges = workingHours[weekday] ?? [];
  const cap = dailyCaps[weekday] ?? 0;

  if (dateIso < todayLocal(now)) return { dateIso, slots: [], reason: "past" };
  if (rules.maxAdvanceDays !== null && dateIso > addDaysIso(todayLocal(now), rules.maxAdvanceDays)) {
    return { dateIso, slots: [], reason: "beyond_window" };
  }
  if (ranges.length === 0 || cap === 0) return { dateIso, slots: [], reason: "closed" };
  if (bookingsOnDay >= cap) return { dateIso, slots: [], reason: "full" };

  const earliest = addMinutes(now, rules.minNoticeHours * 60);
  const slots: Date[] = [];

  for (const range of ranges) {
    const open = hhmmToMinutes(range.open);
    const close = hhmmToMinutes(range.close);
    // Walk the local wall clock so 09:00 is always 09:00 London time, BST or GMT.
    for (let m = open; m + service.durationMin <= close; m += rules.slotIntervalMin) {
      const start = localToUtc(dateIso, minutesToHhmm(m));
      const end = addMinutes(start, service.durationMin);
      if (start < earliest) continue;
      if (!service.runsConcurrently) {
        const occupied: Interval = { start, end: addMinutes(end, service.bufferMin) };
        if (busy.some((b) => overlaps(occupied, b))) continue;
      }
      slots.push(start);
    }
  }

  return { dateIso, slots, reason: slots.length ? undefined : "no_space" };
}

/** Is a specific start time bookable? Used server-side when creating a hold (never trust the client). */
export function isSlotAvailable(input: Omit<DayInput, "dateIso"> & { start: Date; dateIso: string }): boolean {
  const day = slotsForDay(input);
  return day.slots.some((s) => s.getTime() === input.start.getTime());
}

/** Busy intervals of a London day, used to pre-filter DB rows. */
export function dayWindow(dateIso: string): Interval {
  return localDayBounds(dateIso);
}
