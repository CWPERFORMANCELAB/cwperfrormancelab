import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bookings, clients, notifications, packagePurchases, packages } from "@/db/schema";
import { requestReturningCode, verifyReturningCode } from "@/lib/booking/returning";
import { beginCheckout, cancelBooking, createHold, submitDetails } from "@/lib/booking/service";
import { dispatchDue } from "@/lib/notifications/queue";
import { saveSetting, loadSettings } from "@/lib/settings";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function setFlag(flag: "packages" | "insuranceBookings", on: boolean) {
  const s = await loadSettings(db);
  await saveSetting(db, "features", { ...s.features, [flag]: on });
}

async function seedPackage() {
  const [c] = await db.insert(clients).values({ firstName: "Pat", lastName: "Pack", email: "pat@example.com" }).returning();
  await db.insert(packages).values({ id: "massage-5", name: "5 × Massage", serviceId: "sports-massage", credits: 5, pricePence: 27000 });
  const [pp] = await db
    .insert(packagePurchases)
    .values({ packageId: "massage-5", clientId: c.id, code: "PK-TEST-0001", creditsTotal: 5, creditsRemaining: 5, status: "active", expiresAt: new Date("2028-01-01") })
    .returning();
  return pp;
}

describe("packages (feature flag)", () => {
  it("package codes are rejected while the flag is off", async () => {
    await seedPackage();
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await expect(submitDetails(db, booking.id, holdToken, details("pat@example.com", { voucherCode: "PK-TEST-0001" }), NOW)).rejects.toThrow(/couldn't find/);
  });

  it("with the flag on, a code covers the session and uses one credit; free cancellation gives it back", async () => {
    await setFlag("packages", true);
    const pp = await seedPackage();
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const r = await submitDetails(db, booking.id, holdToken, details("pat@example.com", { voucherCode: "pk-test-0001" }), NOW);
    expect(r.quote).toMatchObject({ checkout: "none", packagePurchaseId: pp.id, chargeNowPence: 0 });
    expect((await beginCheckout(db, booking.id, holdToken, NOW)).kind).toBe("confirmed");
    const [after] = await db.select().from(packagePurchases).where(eq(packagePurchases.id, pp.id));
    expect(after.creditsRemaining).toBe(4);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.paymentModel).toBe("package");

    await cancelBooking(db, booking.id, { actor: "client", now: NOW });
    const [restored] = await db.select().from(packagePurchases).where(eq(packagePurchases.id, pp.id));
    expect(restored.creditsRemaining).toBe(5);
  });

  it("a package for one service can't be used for another", async () => {
    await setFlag("packages", true);
    await seedPackage();
    const { booking, holdToken } = await createHold(db, { serviceId: "full-body-mot", startsAt: at(MON, "10:00"), now: NOW });
    await expect(submitDetails(db, booking.id, holdToken, details("pat@example.com", { voucherCode: "PK-TEST-0001" }), NOW)).rejects.toThrow(/isn't valid/);
  });
});

describe("insurer bookings (feature flag)", () => {
  it("are ignored while the flag is off", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW });
    const r = await submitDetails(db, booking.id, holdToken, { ...details(), insurer: { name: "Bupa", authorisation: "AUTH123" } }, NOW);
    expect(r.quote.chargeNowPence).toBe(6500);
  });

  it("with the flag on: no upfront charge, insurer details and balance recorded", async () => {
    await setFlag("insuranceBookings", true);
    const { booking, holdToken } = await createHold(db, { serviceId: "injury-assessment", startsAt: at(MON, "10:00"), now: NOW });
    const r = await submitDetails(db, booking.id, holdToken, { ...details(), insurer: { name: "Bupa", authorisation: "AUTH123" } }, NOW);
    expect(r.quote).toMatchObject({ chargeNowPence: 0, checkout: "none" });
    expect((await beginCheckout(db, booking.id, holdToken, NOW)).kind).toBe("confirmed");
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "confirmed", paymentModel: "insurer", insurerName: "Bupa", insurerAuthorisation: "AUTH123", insurerBalancePence: 6500, paidPence: 0 });
  });
});

describe("notifications", () => {
  async function confirmedBooking() {
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details(), NOW);
    const { confirmBooking } = await import("@/lib/booking/service");
    await confirmBooking(db, booking.id, { paidPence: 6000, now: NOW });
    return booking;
  }

  it("schedules reminders 48h (email) and 2h (SMS) before", async () => {
    const b = await confirmedBooking();
    const rows = await db.select().from(notifications).where(eq(notifications.bookingId, b.id));
    const r48 = rows.find((r) => r.templateKey === "reminder_48h")!;
    const r2 = rows.find((r) => r.templateKey === "reminder_2h_sms")!;
    expect(r48.scheduledFor.toISOString()).toBe(addMinutes(at(MON, "10:00"), -48 * 60).toISOString());
    expect(r2.scheduledFor.toISOString()).toBe(addMinutes(at(MON, "10:00"), -120).toISOString());
    expect(r2.channel).toBe("sms");
  });

  it("dispatches the confirmation (console fallback, no keys) with the policy, parking and shorts reminder", async () => {
    const b = await confirmedBooking();
    await dispatchDue(db, NOW);
    const [conf] = await db.select().from(notifications).where(sql`${notifications.bookingId} = ${b.id} and ${notifications.templateKey} = 'booking_confirmed'`);
    expect(conf.status).toBe("logged");
    expect(conf.body).toContain("Free parking");
    expect(conf.body).toContain("bring shorts");
    expect(conf.body).toContain("Free cancellation up to 24 hours");
    expect(conf.body).toMatch(/\/manage\/[\w-]+/);
  });

  it("drops reminders for cancelled bookings", async () => {
    const b = await confirmedBooking();
    await cancelBooking(db, b.id, { actor: "client", now: NOW });
    await dispatchDue(db, addMinutes(at(MON, "10:00"), -60));
    const rows = await db.select().from(notifications).where(eq(notifications.bookingId, b.id));
    expect(rows.filter((r) => r.templateKey.startsWith("reminder")).every((r) => r.status === "cancelled")).toBe(true);
  });

  it("review request goes only after the first visit, and only when a review link is configured", async () => {
    const b = await confirmedBooking();
    await dispatchDue(db, addMinutes(at(MON, "11:00"), 25 * 60));
    const [rev] = await db.select().from(notifications).where(sql`${notifications.bookingId} = ${b.id} and ${notifications.templateKey} = 'review_request'`);
    // No Google review URL yet (placeholder) → cancelled rather than sending a broken link.
    expect(rev.status).toBe("cancelled");
    expect(rev.error).toMatch(/no review link/);
  });
});

describe("returning clients", () => {
  it("verify by emailed code, then get their details prefilled; wrong codes and unknown emails fail the same way", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details("back@example.com"), NOW);

    await requestReturningCode(db, "back@example.com", NOW);
    const [n] = await db.select().from(notifications).where(eq(notifications.templateKey, "returning_code"));
    const code = n.vars.code;
    expect(code).toMatch(/^\d{6}$/);

    expect((await verifyReturningCode(db, "back@example.com", "000000", NOW)).ok).toBe(false);
    const unknown = await verifyReturningCode(db, "nobody@example.com", code, NOW);
    expect(unknown.ok).toBe(false);

    const ok = await verifyReturningCode(db, "back@example.com", code, NOW);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.prefill.details).toMatchObject({ firstName: "Sam", phone: "07700 900123" });
      expect(ok.prefill.intake?.complaint).toContain("knee");
    }
    // single use
    expect((await verifyReturningCode(db, "back@example.com", code, NOW)).ok).toBe(false);
  });
});
