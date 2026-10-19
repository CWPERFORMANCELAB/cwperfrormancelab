/**
 * PRE-DEPLOY-FIXES #6: checkout completion is single-winner. The webhook, `async_payment_succeeded` and the
 * reconciliation job can all deliver the same completed session at once; exactly one may fulfil it.
 */
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bookings, payments, refunds } from "@/db/schema";
import { beginCheckout, createHold, submitDetails } from "@/lib/booking/service";
import { handleCheckoutCompleted } from "@/lib/payments/handlers";
import { setPaymentProviderForTests, type CompletedCheckout, type PaymentProvider } from "@/lib/payments/provider";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

let refundCalls = 0;
const fake: PaymentProvider = {
  name: "mock",
  async createCheckout() {
    const id = `cs_test_${Math.random().toString(36).slice(2)}`;
    return { sessionId: id, url: `https://checkout.test/${id}`, customerId: null };
  },
  async refund() {
    refundCalls++;
    await new Promise((r) => setTimeout(r, 10));
    return { refundId: `re_${refundCalls}` };
  },
  async listRefunds() {
    return [];
  },
  async chargeSavedCard() {
    return { paymentId: "pi_x", status: "succeeded" };
  },
  async retrieveCheckout() {
    return { status: "open" };
  },
};

let db: Db;
beforeEach(async () => {
  db = await freshDb();
  refundCalls = 0;
  setPaymentProviderForTests(fake);
});
afterEach(() => setPaymentProviderForTests(null));

async function pending(time = "10:00") {
  const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, time), now: NOW });
  await submitDetails(db, booking.id, holdToken, details(`race${time.replace(":", "")}@example.com`), NOW);
  await beginCheckout(db, booking.id, holdToken, NOW);
  const [p] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
  return { booking, sessionId: p.providerSessionId!, paymentId: p.id };
}

const completed = (sessionId: string): CompletedCheckout => ({
  status: "complete",
  sessionId,
  paymentIntentId: "pi_race",
  setupIntentId: null,
  paymentMethodId: "pm_1",
  customerId: null,
  amountTotalPence: 6000,
});

const count = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { n: number }[] }).rows[0].n;

describe("handleCheckoutCompleted", () => {
  it("three simultaneous deliveries: exactly one fulfils, the rest are no-ops", async () => {
    const { booking, sessionId } = await pending();
    const results = await Promise.all([1, 2, 3].map(() => handleCheckoutCompleted(db, completed(sessionId))));
    expect(results.map((r) => r.outcome).sort()).toEqual(["already_processed", "already_processed", "booking_confirmed"]);
    const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(b).toMatchObject({ status: "confirmed", paidPence: 6000 });
    expect(await count(sql`select count(*)::int as n from notifications where template_key = 'booking_confirmed'`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from notifications where template_key = 'receipt'`)).toBe(1);
  });

  it("slot lost after payment: simultaneous deliveries refund exactly once", async () => {
    const { booking, sessionId, paymentId } = await pending();
    await db.update(bookings).set({ holdExpiresAt: addMinutes(NOW, -1) }).where(eq(bookings.id, booking.id));
    await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW }); // someone else takes it
    const results = await Promise.all([1, 2, 3].map(() => handleCheckoutCompleted(db, completed(sessionId))));
    expect(results.filter((r) => r.outcome === "refunded_slot_lost")).toHaveLength(1);
    expect(refundCalls).toBe(1);
    expect(await db.select().from(refunds).where(eq(refunds.paymentId, paymentId))).toHaveLength(1);
  });

  it("a completion after the payment was already handled changes nothing", async () => {
    const { sessionId, paymentId } = await pending();
    await handleCheckoutCompleted(db, completed(sessionId));
    const [before] = await db.select().from(payments).where(eq(payments.id, paymentId));
    const again = await handleCheckoutCompleted(db, { ...completed(sessionId), paymentIntentId: "pi_other", amountTotalPence: 1 });
    expect(again.outcome).toBe("already_processed");
    const [after] = await db.select().from(payments).where(eq(payments.id, paymentId));
    expect(after).toEqual(before);
  });
});
