import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bookings, payments, vouchers, webhookEvents } from "@/db/schema";
import { beginCheckout, createHold, submitDetails } from "@/lib/booking/service";
import { handleCheckoutCompleted, processStripeEvent } from "@/lib/payments/handlers";
import { setPaymentProviderForTests, type PaymentProvider } from "@/lib/payments/provider";
import { purchaseVoucher } from "@/lib/voucher-sales";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

/** Fake Stripe: records refunds so we can assert on them. */
const refunds: { id: string; amount: number }[] = [];
const fake: PaymentProvider = {
  name: "mock",
  async createCheckout() {
    const id = `cs_test_${Math.random().toString(36).slice(2)}`;
    return { sessionId: id, url: `https://checkout.test/${id}`, customerId: "cus_test" };
  },
  async refund(id, amount) {
    refunds.push({ id, amount });
    return { refundId: `re_${refunds.length}` };
  },
  async chargeSavedCard() {
    return { paymentId: "pi_fee", status: "succeeded" };
  },
  async retrieveCheckout() {
    return { status: "open" };
  },
};

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  refunds.length = 0;
  setPaymentProviderForTests(fake);
});
afterEach(() => setPaymentProviderForTests(null));

async function pendingBooking(time = "10:00") {
  const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, time), now: NOW });
  await submitDetails(db, booking.id, holdToken, details(`w${time.replace(":", "")}@example.com`), NOW);
  await beginCheckout(db, booking.id, holdToken, NOW);
  const [p] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
  return { booking, sessionId: p.providerSessionId! };
}

const completedEvent = (id: string, sessionId: string, amount = 6000) => ({
  id,
  type: "checkout.session.completed",
  data: { object: { id: sessionId, mode: "payment", payment_status: "paid", amount_total: amount, payment_intent: "pi_123", customer: "cus_test" } },
});

describe("Stripe webhooks", () => {
  it("checkout.session.completed confirms the booking", async () => {
    const { booking, sessionId } = await pendingBooking();
    await processStripeEvent(db, completedEvent("evt_1", sessionId));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "confirmed", paidPence: 6000 });
    const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, sessionId));
    expect(p).toMatchObject({ status: "succeeded", providerPaymentId: "pi_123" });
    expect(p.receiptNumber).toMatch(/^CW-/);
  });

  it("is idempotent: duplicate deliveries don't double count", async () => {
    const { booking, sessionId } = await pendingBooking();
    await processStripeEvent(db, completedEvent("evt_dup", sessionId));
    const second = await processStripeEvent(db, completedEvent("evt_dup", sessionId));
    expect(second.duplicate).toBe(true);
    // Same session, different event id (Stripe can send both completed + async_succeeded)
    await processStripeEvent(db, { ...completedEvent("evt_other", sessionId), type: "checkout.session.async_payment_succeeded" });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.paidPence).toBe(6000);
    const n = (await db.execute(sql`select count(*)::int as n from notifications where template_key = 'booking_confirmed'`)) as unknown as { rows: { n: number }[] };
    expect(n.rows[0].n).toBe(1);
  });

  it("checkout.session.expired releases the slot", async () => {
    const { booking, sessionId } = await pendingBooking();
    await processStripeEvent(db, { id: "evt_exp", type: "checkout.session.expired", data: { object: { id: sessionId } } });
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: "checkout_expired" });
    await expect(createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW })).resolves.toBeTruthy();
  });

  it("late payment for a still-free slot re-confirms the booking", async () => {
    const { booking, sessionId } = await pendingBooking();
    await processStripeEvent(db, { id: "evt_exp2", type: "checkout.session.expired", data: { object: { id: sessionId } } });
    // Payment succeeds anyway (e.g. slow 3-D Secure) — we should honour it.
    await db.update(payments).set({ status: "pending" }).where(eq(payments.providerSessionId, sessionId));
    await processStripeEvent(db, completedEvent("evt_late", sessionId));
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b.status).toBe("confirmed");
    expect(refunds).toHaveLength(0);
  });

  it("payment succeeds but the slot was taken → automatic full refund + admin alert", async () => {
    const { booking, sessionId } = await pendingBooking();
    // Hold expires, someone else books the slot.
    await db.update(bookings).set({ holdExpiresAt: addMinutes(NOW, -1) }).where(eq(bookings.id, booking.id));
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    const r = await handleCheckoutCompleted(db, { status: "complete", sessionId, paymentIntentId: "pi_late", setupIntentId: null, paymentMethodId: null, customerId: null, amountTotalPence: 6000 });
    expect(r.outcome).toBe("refunded_slot_lost");
    expect(refunds).toEqual([{ id: "pi_late", amount: 6000 }]);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "cancelled", cancelReason: "slot_lost_refunded" });
    const alerts = (await db.execute(sql`select count(*)::int as n from notifications where template_key = 'admin_cancellation'`)) as unknown as { rows: { n: number }[] };
    expect(alerts.rows[0].n).toBe(1);
  });

  it("unknown sessions are recorded without error", async () => {
    await processStripeEvent(db, completedEvent("evt_unknown", "cs_nope"));
    const [e] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, "evt_unknown"));
    expect(e.processedAt).toBeTruthy();
  });

  it("voucher purchase: webhook activates the voucher and emails it", async () => {
    await purchaseVoucher(db, { productId: "voucher-60", purchaserName: "Jo", purchaserEmail: "jo@example.com", recipientName: "Kim", recipientEmail: "kim@example.com", now: NOW });
    const [p] = await db.select().from(payments).where(eq(payments.kind, "voucher"));
    await processStripeEvent(db, completedEvent("evt_v", p.providerSessionId!, 6000));
    const [v] = await db.select().from(vouchers);
    expect(v).toMatchObject({ status: "active", balancePence: 6000 });
    const n = (await db.execute(sql`select "to" from notifications where template_key = 'voucher_purchased' order by "to"`)) as unknown as { rows: { to: string }[] };
    expect(n.rows.map((r) => r.to)).toEqual(["jo@example.com", "kim@example.com"]);
  });

  it("charge.refunded from the Stripe dashboard syncs our ledger", async () => {
    const { sessionId } = await pendingBooking();
    await processStripeEvent(db, completedEvent("evt_pay", sessionId));
    await processStripeEvent(db, { id: "evt_ref", type: "charge.refunded", data: { object: { payment_intent: "pi_123", amount_refunded: 2000 } } });
    const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, sessionId));
    expect(p).toMatchObject({ refundedPence: 2000, status: "partially_refunded" });
  });
});
