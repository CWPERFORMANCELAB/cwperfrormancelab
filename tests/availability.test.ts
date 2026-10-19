import { describe, expect, it } from "vitest";
import { seedSettings } from "@config/seed-settings";
import { slotsForDay, type DayInput } from "@/lib/availability/engine";
import type { Settings } from "@/lib/settings-schema";
import { formatTime, localToUtc } from "@/lib/time";
import { MON, SAT, SUN } from "./helpers";

const s = Object.fromEntries(seedSettings.map((x) => [x.key, x.value])) as unknown as Settings;
const service = { durationMin: 60, bufferMin: 10, runsConcurrently: false };
const NOW = new Date("2027-01-01T09:00:00Z");

function day(over: Partial<DayInput> = {}): DayInput {
  return {
    dateIso: MON,
    service,
    workingHours: s.workingHours,
    dailyCaps: s.dailyCaps,
    rules: s.bookingRules,
    busy: [],
    bookingsOnDay: 0,
    now: NOW,
    ...over,
  };
}
const times = (r: { slots: Date[] }) => r.slots.map(formatTime);

describe("working hours", () => {
  it("offers 15-minute slots inside Mon–Fri 08:00–19:00, ending by close", () => {
    const r = slotsForDay(day());
    expect(times(r)[0]).toBe("08:00");
    expect(times(r).at(-1)).toBe("18:00"); // 60-min session must end by 19:00
    expect(r.slots).toHaveLength(41); // 08:00 → 18:00 every 15 min
  });

  it("uses Saturday hours 09:00–15:00", () => {
    const r = slotsForDay(day({ dateIso: SAT }));
    expect(times(r)[0]).toBe("09:00");
    expect(times(r).at(-1)).toBe("14:00");
  });

  it("is closed on Sunday", () => {
    expect(slotsForDay(day({ dateIso: SUN }))).toMatchObject({ slots: [], reason: "closed" });
  });
});

describe("buffers", () => {
  // Existing booking 10:00–11:00 with a 10-min buffer occupies 10:00–11:10.
  const busy = [{ start: localToUtc(MON, "10:00"), end: localToUtc(MON, "11:10") }];

  it("blocks slots whose session + own buffer would run into an existing booking", () => {
    const t = times(slotsForDay(day({ busy })));
    expect(t).toContain("08:45"); // 08:45–09:45 + 10 buffer = 09:55, clear of 10:00
    expect(t).not.toContain("09:00"); // 09:00–10:00 + 10 = 10:10 overlaps
    expect(t).not.toContain("10:30");
  });

  it("allows the next slot only after the existing booking's buffer", () => {
    const t = times(slotsForDay(day({ busy })));
    expect(t).not.toContain("11:00");
    expect(t).toContain("11:15"); // first 15-min grid point after 11:10
  });

  it("respects a 5-minute buffer service", () => {
    const t = times(slotsForDay(day({ busy, service: { ...service, durationMin: 30, bufferMin: 5 } })));
    expect(t).toContain("09:15"); // 09:15–09:45 +5 = 09:50
    expect(t).toContain("09:15");
    expect(t).not.toContain("09:30"); // 09:30–10:00 +5 overlaps 10:00
  });

  it("ignores busy time for services that run concurrently", () => {
    const t = times(slotsForDay(day({ busy, service: { ...service, runsConcurrently: true } })));
    expect(t).toContain("10:00");
  });
});

describe("daily caps", () => {
  it("closes a weekday after 5 appointments", () => {
    expect(slotsForDay(day({ bookingsOnDay: 4 })).slots.length).toBeGreaterThan(0);
    expect(slotsForDay(day({ bookingsOnDay: 5 }))).toMatchObject({ slots: [], reason: "full" });
  });

  it("allows 7 on Saturdays", () => {
    expect(slotsForDay(day({ dateIso: SAT, bookingsOnDay: 6 })).slots.length).toBeGreaterThan(0);
    expect(slotsForDay(day({ dateIso: SAT, bookingsOnDay: 7 }))).toMatchObject({ slots: [], reason: "full" });
  });
});

describe("minimum notice (3 hours)", () => {
  it("hides slots starting less than 3 hours from now", () => {
    const now = localToUtc(MON, "09:10");
    const t = times(slotsForDay(day({ now })));
    expect(t).not.toContain("12:00");
    expect(t[0]).toBe("12:15");
  });

  it("returns nothing for past days", () => {
    expect(slotsForDay(day({ now: new Date("2027-02-01T09:00:00Z") }))).toMatchObject({ reason: "past" });
  });
});

describe("booking window", () => {
  it("has no limit when maxAdvanceDays is null (confirmed rule)", () => {
    expect(slotsForDay(day({ dateIso: "2029-01-15" })).slots.length).toBeGreaterThan(0);
  });
  it("enforces a limit when configured", () => {
    const rules = { ...s.bookingRules, maxAdvanceDays: 30 };
    expect(slotsForDay(day({ dateIso: "2027-03-01", rules }))).toMatchObject({ reason: "beyond_window" });
  });
});

describe("BST / GMT changeover (Europe/London)", () => {
  // Clocks go back 02:00 BST → 01:00 GMT on Sunday 25 Oct 2026; forward on Sunday 28 Mar 2027.
  // Use Monday 26 Oct (first GMT weekday) and Friday 23 Oct (last BST weekday).
  const now = new Date("2026-10-01T00:00:00Z");

  it("08:00 local is 07:00 UTC in BST", () => {
    const r = slotsForDay(day({ dateIso: "2026-10-23", now }));
    expect(r.slots[0].toISOString()).toBe("2026-10-23T07:00:00.000Z");
  });

  it("08:00 local is 08:00 UTC in GMT, the day after the clocks go back", () => {
    const r = slotsForDay(day({ dateIso: "2026-10-26", now }));
    expect(r.slots[0].toISOString()).toBe("2026-10-26T08:00:00.000Z");
    expect(times(r)[0]).toBe("08:00");
  });

  it("Saturday before spring-forward and Monday after both start at 09:00/08:00 local", () => {
    const n = new Date("2027-03-01T00:00:00Z");
    expect(slotsForDay(day({ dateIso: "2027-03-27", now: n })).slots[0].toISOString()).toBe("2027-03-27T09:00:00.000Z");
    expect(slotsForDay(day({ dateIso: "2027-03-29", now: n })).slots[0].toISOString()).toBe("2027-03-29T07:00:00.000Z");
  });

  it("3-hour notice is measured in real elapsed time across the change", () => {
    // 23:30 UTC Sat 24 Oct (00:30 BST Sun). +3h real = 02:30 UTC Sunday. Monday unaffected.
    const r = slotsForDay(day({ dateIso: "2026-10-26", now: new Date("2026-10-26T05:30:00Z") }));
    expect(r.slots[0].toISOString()).toBe("2026-10-26T08:30:00.000Z");
  });
});
