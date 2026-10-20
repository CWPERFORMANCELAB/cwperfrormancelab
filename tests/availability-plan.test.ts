/**
 * Availability: there are no default weekly hours. The practitioner enters hours and picks the days they apply to;
 * only those days are bookable, everywhere a client can book (slot list, hold re-check).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { availabilityDays, blockedTimes } from "@/db/schema";
import { availabilityForRange } from "@/lib/availability";
import { dayHours, slotsForDay } from "@/lib/availability/engine";
import { bookingsOutside, calendarRange, clearDays, parseDates, parseRanges, setDays } from "@/lib/availability/plan";
import { beginCheckout, createHold, submitDetails } from "@/lib/booking/service";
import { getService, loadSettings } from "@/lib/settings";
import type { Settings } from "@/lib/settings-schema";
import { addDaysIso, formatTime } from "@/lib/time";
import { freshDb, MON, SUN } from "./helpers";
import { at, details, NOW } from "./fixtures";

const P = business.practitioner.id;
const caps = { 0: 0, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 7 } as Settings["dailyCaps"];
const rules = { minNoticeHours: 3, maxAdvanceDays: null, slotIntervalMin: 15, holdMinutes: 10, defaultBufferMin: 10 };
const FAR = "2027-06-07"; // a Monday outside the shared test window: no hours entered

let db: Db;
let settings: Settings;
beforeEach(async () => {
  db = await freshDb();
  settings = await loadSettings(db);
});

const slots = async (dateIso: string) => {
  const service = (await getService(db, "sports-massage"))!;
  const [day] = await availabilityForRange(db, { service, settings, fromIso: dateIso, days: 1, now: NOW });
  return day;
};
const times = (d: { slots: Date[] }) => d.slots.map(formatTime);

describe("engine: only entered hours are bookable", () => {
  const base = { service: { durationMin: 60, bufferMin: 0, runsConcurrently: false }, dailyCaps: caps, rules, busy: [], bookingsOnDay: 0, now: NOW };

  it("a day with no hours entered offers nothing, whatever the weekday", () => {
    expect(slotsForDay({ ...base, dateIso: MON })).toMatchObject({ slots: [], reason: "closed" });
    expect(dayHours(MON, caps)).toEqual({ ranges: [], cap: 0 });
  });

  it("hours with a break offer nothing in the break; the cap defaults to that weekday's limit", () => {
    const hours = { ranges: [{ open: "08:00", close: "10:00" }, { open: "15:00", close: "16:00" }], cap: null };
    expect(dayHours(MON, caps, hours).cap).toBe(5);
    expect(slotsForDay({ ...base, dateIso: MON, hours }).slots.map(formatTime)).toEqual(["08:00", "08:15", "08:30", "08:45", "09:00", "15:00"]);
  });

  it("a Sunday (limit 0 in settings) uses the highest limit; an entered cap wins", () => {
    expect(dayHours(SUN, caps, { ranges: [{ open: "10:00", close: "12:00" }], cap: null }).cap).toBe(7);
    const hours = { ranges: [{ open: "10:00", close: "12:00" }], cap: 2 };
    expect(slotsForDay({ ...base, bookingsOnDay: 2, dateIso: SUN, hours }).reason).toBe("full");
  });
});

describe("what clients can book follows what's entered", () => {
  it("entering hours on several days at once makes exactly those days bookable", async () => {
    const days = [FAR, addDaysIso(FAR, 2), addDaysIso(FAR, 6)]; // Mon, Wed, Sun
    expect((await slots(FAR)).slots).toHaveLength(0);
    await setDays(db, P, days, { ranges: [{ open: "09:00", close: "11:00" }], cap: null });
    for (const d of days) expect(times(await slots(d))).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00"]);
    expect((await slots(addDaysIso(FAR, 1))).slots).toHaveLength(0); // Tuesday wasn't picked
  });

  it("making days unavailable removes them from the booking page", async () => {
    expect((await slots(MON)).slots.length).toBeGreaterThan(0);
    await clearDays(db, P, [MON, addDaysIso(MON, 1)]);
    expect(await slots(MON)).toMatchObject({ slots: [], reason: "closed" });
    expect((await slots(addDaysIso(MON, 1))).slots).toHaveLength(0);
    expect((await slots(addDaysIso(MON, 2))).slots.length).toBeGreaterThan(0);
  });

  it("re-entering hours replaces the old ones", async () => {
    await setDays(db, P, [MON], { ranges: [{ open: "14:00", close: "16:00" }], cap: null });
    expect(times(await slots(MON))).toEqual(["14:00", "14:15", "14:30", "14:45", "15:00"]);
  });

  it("a client can't hold a time outside the entered hours (server re-check), but can inside them", async () => {
    await setDays(db, P, [MON], { ranges: [{ open: "14:00", close: "16:00" }], cap: null });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "09:00"), now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "14:00"), now: NOW })).resolves.toBeTruthy();

    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(SUN, "10:00"), now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await setDays(db, P, [SUN], { ranges: [{ open: "10:00", close: "13:00" }], cap: 1 });
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(SUN, "10:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details("sunday@example.com"), NOW);
    await beginCheckout(db, booking.id, holdToken, NOW);
    expect((await slots(SUN)).reason).toBe("full"); // entered cap of 1 reached
  });

  it("time off is still taken out of entered hours", async () => {
    await db.insert(blockedTimes).values({ practitionerId: P, startsAt: at(MON, "12:00"), endsAt: at(MON, "13:00"), reason: "Physio course" });
    const t = times(await slots(MON));
    expect(t).not.toContain("11:30");
    expect(t).not.toContain("12:00");
    expect(t).toContain("13:00");
  });
});

describe("dashboard helpers", () => {
  it("warns about existing bookings outside new hours or on days made unavailable (they're never cancelled)", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "09:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details("early@example.com"), NOW);
    expect(await bookingsOutside(db, P, [MON], [{ open: "08:00", close: "12:00" }])).toHaveLength(0);
    expect((await bookingsOutside(db, P, [MON], [{ open: "14:00", close: "19:00" }])).map((c) => c.id)).toEqual([booking.id]);
    expect(await bookingsOutside(db, P, [MON], [])).toHaveLength(1);
  });

  it("the calendar shows entered hours, bookings and time off per day", async () => {
    await db.delete(availabilityDays);
    await setDays(db, P, [MON], { ranges: [{ open: "10:00", close: "14:00" }], cap: 3 });
    await db.insert(blockedTimes).values({ practitionerId: P, startsAt: at(addDaysIso(MON, 1), "12:00"), endsAt: at(addDaysIso(MON, 1), "13:00") });
    const [mon, tue] = await calendarRange(db, P, MON, 7);
    expect(mon).toMatchObject({ ranges: [{ open: "10:00", close: "14:00" }], cap: 3, blocked: 0 });
    expect(tue).toMatchObject({ ranges: [], blocked: 1 });
  });

  it("clear:demo-data removes sample hours but never hours Christopher entered", async () => {
    const { clearDemoData } = await import("../scripts/clear-demo-data");
    await db.delete(availabilityDays);
    await db.insert(availabilityDays).values({ practitionerId: P, date: FAR, ranges: [{ open: "08:00", close: "19:00" }], isDemo: true });
    await setDays(db, P, [addDaysIso(FAR, 1)], { ranges: [{ open: "09:00", close: "17:00" }], cap: null });
    await clearDemoData(db, { quiet: true });
    expect((await db.select().from(availabilityDays)).map((r) => r.date)).toEqual([addDaysIso(FAR, 1)]);
  });

  it("validates hours and dates", () => {
    expect(() => parseRanges([])).toThrow(/at least one/);
    expect(() => parseRanges([{ open: "12:00", close: "09:00" }])).toThrow(/after the start/);
    expect(() => parseRanges([{ open: "08:00", close: "12:00" }, { open: "11:00", close: "13:00" }])).toThrow(/overlap/);
    expect(() => parseRanges([{ open: "8am", close: "12:00" }])).toThrow();
    expect(parseRanges([{ open: "15:00", close: "19:00" }, { open: "08:00", close: "12:00" }]).map((r) => r.open)).toEqual(["08:00", "15:00"]);
    expect(parseDates([MON, MON, SUN])).toEqual([MON, SUN]);
    expect(() => parseDates([])).toThrow(/at least one/);
  });
});
