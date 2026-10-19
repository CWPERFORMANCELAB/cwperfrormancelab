import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bookings, vouchers } from "@/db/schema";
import { beginCheckout, cancelBooking, createHold, submitDetails } from "@/lib/booking/service";
import { quote } from "@/lib/pricing";
import { getService, loadSettings } from "@/lib/settings";
import { createVoucher, redeemVoucher } from "@/lib/vouchers";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const future = new Date("2028-01-01T00:00:00Z");

async function book(voucherCode: string, serviceId = "sports-massage", time = "10:00") {
  const { booking, holdToken } = await createHold(db, { serviceId, startsAt: at(MON, time), now: NOW });
  const r = await submitDetails(db, booking.id, holdToken, details(`v${time.replace(":", "")}@example.com`, { voucherCode }), NOW);
  const start = await beginCheckout(db, booking.id, holdToken, NOW);
  return { booking, quote: r.quote, start };
}

describe("voucher redemption", () => {
  it("a voucher covering the full price confirms without payment", async () => {
    const v = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "admin", status: "active" });
    const { booking, quote: q, start } = await book(v.code);
    expect(q).toMatchObject({ voucherPence: 6000, duePence: 0, checkout: "none" });
    expect(start.kind).toBe("confirmed");
    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after).toMatchObject({ balancePence: 0, status: "redeemed" });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
  });

  it("a partial voucher reduces the amount charged and keeps the remaining balance", async () => {
    const v = await createVoucher(db, { valuePence: 3500, expiresAt: future, source: "admin", status: "active" });
    const { quote: q } = await book(v.code, "injury-assessment");
    expect(q).toMatchObject({ pricePence: 6500, voucherPence: 3500, chargeNowPence: 3000, checkout: "payment" });
  });

  it("a bigger voucher keeps its leftover balance for next time", async () => {
    const v = await createVoucher(db, { valuePence: 8500, expiresAt: future, source: "admin", status: "active" });
    await book(v.code, "sports-massage");
    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after).toMatchObject({ balancePence: 2500, status: "active" });
  });

  it("rejects expired, unpaid and unknown codes", async () => {
    const expired = await createVoucher(db, { valuePence: 6000, expiresAt: new Date("2026-01-01"), source: "admin", status: "active" });
    const pending = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "online", status: "pending" });
    const service = (await getService(db, "sports-massage"))!;
    const settings = await loadSettings(db);
    for (const [code, msg] of [
      [expired.code, /expired/],
      [pending.code, /hasn't been paid/],
      ["CW-NOPE-NOPE", /couldn't find/],
    ] as const) {
      const q = await quote(db, { service, settings, voucherCode: code, now: NOW });
      expect(q.errors.voucher).toMatch(msg);
    }
  });

  it("codes are case- and space-insensitive", async () => {
    const v = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "admin", status: "active", code: "CALENDLY-ABC123" });
    const { quote: q } = await book(" calendly-abc123 ");
    expect(q.voucherId).toBe(v.id);
  });

  it("two bookings can't spend the same balance twice", async () => {
    const v = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "admin", status: "active" });
    const a = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const b = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "13:00"), now: NOW });
    const results = await Promise.allSettled([
      db.transaction((tx) => redeemVoucher(tx, { voucherId: v.id, bookingId: a.booking.id, amountPence: 6000, now: NOW })),
      db.transaction((tx) => redeemVoucher(tx, { voucherId: v.id, bookingId: b.booking.id, amountPence: 6000, now: NOW })),
    ]);
    const applied = results.map((r) => (r.status === "fulfilled" ? r.value : 0));
    expect(applied.reduce((x, y) => x + y, 0)).toBe(6000);
    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after.balancePence).toBe(0);
  });

  it("free cancellation restores the voucher balance", async () => {
    const v = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "admin", status: "active" });
    const { booking } = await book(v.code);
    await cancelBooking(db, booking.id, { actor: "client", now: NOW });
    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after).toMatchObject({ balancePence: 6000, status: "active" });
  });

  it("late cancellation keeps the fee from the voucher", async () => {
    const v = await createVoucher(db, { valuePence: 6000, expiresAt: future, source: "admin", status: "active" });
    const { booking } = await book(v.code);
    await cancelBooking(db, booking.id, { actor: "client", now: at(MON, "02:00") });
    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after.balancePence).toBe(3000); // 50% fee retained
  });

  it("discount codes apply before vouchers and count uses", async () => {
    await db.execute(sql`insert into discount_codes (code, kind, value, max_uses) values ('RUNCLUB10', 'percent', 10, 1)`);
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const r = await submitDetails(db, booking.id, holdToken, details("d@example.com", { discountCode: "runclub10" }), NOW);
    expect(r.quote).toMatchObject({ discountPence: 600, chargeNowPence: 5400 });
    const { confirmBooking } = await import("@/lib/booking/service");
    await confirmBooking(db, booking.id, { paidPence: 5400, now: NOW });
    const service = (await getService(db, "sports-massage"))!;
    const q2 = await quote(db, { service, settings: await loadSettings(db), discountCode: "RUNCLUB10", now: NOW });
    expect(q2.errors.discount).toMatch(/fully used/);
  });
});
