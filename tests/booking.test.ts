import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { blockedTimes, bookings } from "@/db/schema";
import { BookingError } from "@/lib/booking/errors";
import { beginCheckout, cancelBooking, confirmBooking, createHold, rescheduleBooking, submitDetails } from "@/lib/booking/service";
import { availabilityForRange } from "@/lib/availability";
import { getService, loadSettings } from "@/lib/settings";
import { addMinutes } from "@/lib/time";
import { freshDb, MON, withFees, withSms } from "./helpers";
import { at, details, NOW } from "./fixtures";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("double-booking prevention", () => {
  it("rejects a second hold on the same slot", async () => {
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("rejects an overlapping slot (inside the buffer)", async () => {
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW }); // occupies to 11:10
    await expect(createHold(db, { serviceId: "dry-cupping", startsAt: at(MON, "11:00"), now: NOW })).rejects.toBeInstanceOf(BookingError);
    await expect(createHold(db, { serviceId: "dry-cupping", startsAt: at(MON, "11:15"), now: NOW })).resolves.toBeTruthy();
  });

  it("allows exactly one winner when 10 clients race for the same slot", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, () => createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "14:00"), now: NOW })),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
  });

  it("the database itself rejects an overlap even if app checks are bypassed", async () => {
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const start = at(MON, "10:30");
    await expect(
      db.insert(bookings).values({
        practitionerId: business.practitioner.id,
        serviceId: "sports-massage",
        status: "confirmed",
        startsAt: start,
        endsAt: addMinutes(start, 60),
        occupiedUntil: addMinutes(start, 70),
        pricePence: 6000,
      }),
    ).rejects.toThrow();
  });

  it("admin overrides still can't double book", async () => {
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await expect(
      createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:30"), now: NOW, skipAvailabilityCheck: true }),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("frees the slot once a hold expires", async () => {
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const later = addMinutes(NOW, 11);
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: later })).resolves.toBeTruthy();
  });

  it("respects blocked time (holidays / Google events)", async () => {
    await db.insert(blockedTimes).values({ practitionerId: business.practitioner.id, startsAt: at(MON, "12:00"), endsAt: at(MON, "17:00"), reason: "Holiday" });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "13:00"), now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("enforces the weekday cap of 5 at booking time, not just in the UI", async () => {
    for (const t of ["08:00", "09:30", "11:00", "12:30", "14:00"]) {
      await createHold(db, { serviceId: "compression-boots", startsAt: at(MON, t), now: NOW });
    }
    await expect(createHold(db, { serviceId: "compression-boots", startsAt: at(MON, "16:00"), now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    const service = (await getService(db, "compression-boots"))!;
    const [day] = await availabilityForRange(db, { service, settings: await loadSettings(db), fromIso: MON, days: 1, now: NOW });
    expect(day.reason).toBe("full");
  });

  it("enforces 3-hour minimum notice server-side", async () => {
    const now = at(MON, "08:00");
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:45"), now })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "11:00"), now })).resolves.toBeTruthy();
  });
});

describe("booking flow", () => {
  it("hold → details → mock checkout → confirm, with notifications queued", async () => {
    await withSms(db);
    const { booking, holdToken } = await createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW });
    const r = await submitDetails(db, booking.id, holdToken, details(), NOW);
    expect(r.quote).toMatchObject({ pricePence: 6500, chargeNowPence: 6500, checkout: "payment" });
    const start = await beginCheckout(db, booking.id, holdToken, NOW);
    expect(start.kind).toBe("redirect");

    const token = await confirmBooking(db, booking.id, { paidPence: 6500, now: NOW });
    expect(token).toBeTruthy();
    expect(await confirmBooking(db, booking.id, { paidPence: 6500, now: NOW })).toBeNull(); // idempotent

    const [b] = await db.select().from(bookings).where(sql`${bookings.id} = ${booking.id}`);
    expect(b).toMatchObject({ status: "confirmed", paidPence: 6500, holdExpiresAt: null });
    const n = (await db.execute(sql`select template_key from notifications where booking_id = ${booking.id}`)) as unknown as { rows: { template_key: string }[] };
    const keys = n.rows.map((r) => r.template_key);
    expect(keys).toEqual(expect.arrayContaining(["booking_confirmed", "booking_confirmed_sms", "reminder_48h", "reminder_2h_sms", "after_session_thanks", "review_request", "rebook_nudge", "admin_new_booking"]));
  });

  it("encrypts intake health data at rest", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details(), NOW);
    const r = (await db.execute(sql`select data_enc from intake_forms`)) as unknown as { rows: { data_enc: string }[] };
    expect(r.rows[0].data_enc).toMatch(/^v1\./);
    expect(r.rows[0].data_enc).not.toContain("knee");
  });

  it("blocks dry cupping online when a contraindication is ticked", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "dry-cupping", startsAt: at(MON, "10:00"), now: NOW });
    const d = details();
    d.consent = {
      ...d.consent,
      dryCupping: { bleeding: "yes", skin: "no", pregnant: "no", dvt: "no", fever: "no", surgery: "no" },
      dryCuppingConsent: true,
    };
    await expect(submitDetails(db, booking.id, holdToken, d, NOW)).rejects.toThrow(/may not be suitable/);
  });

  it("requires guardian consent for under-18s", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const d = details("teen@example.com");
    d.details.dob = "2012-05-01";
    await expect(submitDetails(db, booking.id, holdToken, d, NOW)).rejects.toThrow(/under 18/);
    d.consent = { ...d.consent, guardianName: "Pat Parent", guardianRelationship: "Mother", guardianConsent: true };
    await expect(submitDetails(db, booking.id, holdToken, d, NOW)).resolves.toBeTruthy();
  });

  it("never overwrites an existing client's details from the public form", async () => {
    const a = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await submitDetails(db, a.booking.id, a.holdToken, details(), NOW);
    const b = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "13:00"), now: NOW });
    const d = details();
    d.details.phone = "07999 999999";
    await submitDetails(db, b.booking.id, b.holdToken, d, NOW);
    const r = (await db.execute(sql`select phone from clients`)) as unknown as { rows: { phone: string }[] };
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].phone).toBe("07700 900123");
  });

  it("rejects a forged hold token", async () => {
    const { booking } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await expect(submitDetails(db, booking.id, "not-the-token", details(), NOW)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("cancel & reschedule", () => {
  async function confirmed(time = "10:00") {
    const { booking, holdToken } = await createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, time), now: NOW });
    await submitDetails(db, booking.id, holdToken, details(), NOW);
    await beginCheckout(db, booking.id, holdToken, NOW);
    await confirmBooking(db, booking.id, { paidPence: 6500, now: NOW });
    // Simulate the succeeded payment row a real checkout produces.
    await db.execute(sql`update payments set status = 'succeeded', amount_pence = 6500, provider_payment_id = 'mock_pi_1' where booking_id = ${booking.id}`);
    return booking;
  }

  it("free cancellation refunds in full and frees the slot", async () => {
    const b = await confirmed();
    const r = await cancelBooking(db, b.id, { actor: "client", now: NOW });
    expect(r).toMatchObject({ late: false, refundedPence: 6500, feePence: 0 });
    await expect(createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW })).resolves.toBeTruthy();
  });

  it("late cancellation keeps 50% and refunds the rest", async () => {
    await withFees(db, 50);
    const b = await confirmed();
    const r = await cancelBooking(db, b.id, { actor: "client", now: at(MON, "00:00") });
    expect(r).toMatchObject({ late: true, feePence: 3250, refundedPence: 3250 });
  });

  it("client reschedule respects the 24h deadline and moves the booking", async () => {
    const b = await confirmed();
    await expect(rescheduleBooking(db, b.id, at(MON, "15:00"), { actor: "client", now: at(MON, "00:00") })).rejects.toMatchObject({ code: "policy" });
    const moved = await rescheduleBooking(db, b.id, at(MON, "15:00"), { actor: "client", now: NOW });
    expect(moved.startsAt.toISOString()).toBe(at(MON, "15:00").toISOString());
    // old slot is free again
    await expect(createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW })).resolves.toBeTruthy();
  });

  it("can't reschedule onto someone else's booking", async () => {
    const b = await confirmed("10:00");
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "15:00"), now: NOW });
    await expect(rescheduleBooking(db, b.id, at(MON, "15:00"), { actor: "client", now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(rescheduleBooking(db, b.id, at(MON, "15:00"), { actor: "admin", adminEmail: "a@b.c", now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
  });
});
