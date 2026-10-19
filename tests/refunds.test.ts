/**
 * PRE-DEPLOY-FIXES #5: refunds must be race-safe and idempotent, and the charge.refunded webhook must not
 * double-record refunds the app made itself.
 */
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { bookings, payments, refunds } from "@/db/schema";
import { processStripeEvent, refundPayment } from "@/lib/payments/handlers";
import { setPaymentProviderForTests, type PaymentProvider } from "@/lib/payments/provider";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at } from "./fixtures";

type Call = { pi: string; amount: number; key?: string };
let calls: Call[] = [];
let stripeRefunds: { id: string; amount: number }[] = [];

const fake: PaymentProvider = {
  name: "stripe" as never,
  async createCheckout() {
    throw new Error("unused");
  },
  async refund(pi, amount, _reason, idempotencyKey) {
    // Simulate network latency so concurrent callers really interleave.
    await new Promise((r) => setTimeout(r, 20));
    calls.push({ pi, amount, key: idempotencyKey });
    const id = `re_${calls.length}`;
    stripeRefunds.push({ id, amount });
    return { refundId: id };
  },
  async listRefunds() {
    return stripeRefunds;
  },
  async chargeSavedCard() {
    return { paymentId: "pi_x", status: "succeeded" };
  },
  async retrieveCheckout() {
    return { status: "open" };
  },
};

let db: Db;
let paymentId: string;
let bookingId: string;

beforeEach(async () => {
  db = await freshDb();
  calls = [];
  stripeRefunds = [];
  setPaymentProviderForTests(fake);
  const start = at(MON, "10:00");
  const [b] = await db
    .insert(bookings)
    .values({ practitionerId: business.practitioner.id, serviceId: "injury-assessment", status: "confirmed", startsAt: start, endsAt: addMinutes(start, 60), occupiedUntil: addMinutes(start, 70), pricePence: 6500, paidPence: 6500 })
    .returning();
  bookingId = b.id;
  const [p] = await db.insert(payments).values({ bookingId: b.id, provider: "stripe", providerPaymentId: "pi_123", amountPence: 6500, status: "succeeded" }).returning();
  paymentId = p.id;
});
afterEach(() => setPaymentProviderForTests(null));

const ledger = async () => {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  const rows = await db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  return { p, rows, b };
};

describe("refundPayment", () => {
  it("two concurrent full refunds (double click / admin vs automatic) refund only once", async () => {
    const results = await Promise.all([
      refundPayment(db, paymentId, 6500, { reason: "admin", automatic: false, actor: "a@b.c" }),
      refundPayment(db, paymentId, 6500, { reason: "cancellation", automatic: true, actor: "system" }),
    ]);
    expect(results.sort()).toEqual([0, 6500]);
    expect(calls).toHaveLength(1);
    const { p, rows, b } = await ledger();
    expect(p).toMatchObject({ refundedPence: 6500, status: "refunded" });
    expect(rows).toHaveLength(1);
    expect(b.paidPence).toBe(0);
  });

  it("concurrent partial refunds never exceed what was paid", async () => {
    await Promise.all([1, 2, 3].map(() => refundPayment(db, paymentId, 3000, { reason: "partial", automatic: false, actor: "a@b.c" })));
    const { p, rows } = await ledger();
    expect(p.refundedPence).toBe(6500);
    expect(rows.reduce((s, r) => s + r.amountPence, 0)).toBe(6500);
    expect(calls.map((c) => c.amount)).toEqual([3000, 3000, 500]);
  });

  it("sends a Stripe idempotency key and stores the Stripe refund id", async () => {
    await refundPayment(db, paymentId, 2000, { reason: "partial", automatic: false, actor: "a@b.c" });
    expect(calls[0].key).toMatch(/^refund:/);
    const { rows } = await ledger();
    expect(rows[0].providerRefundId).toBe("re_1");
  });
});

describe("charge.refunded webhook", () => {
  const event = (id: string) => ({ id, type: "charge.refunded", data: { object: { payment_intent: "pi_123", amount_refunded: 0 } } });

  it("does not add a second ledger row for a refund the app made", async () => {
    await refundPayment(db, paymentId, 6500, { reason: "admin", automatic: false, actor: "a@b.c" });
    await processStripeEvent(db, event("evt_r1"));
    const { p, rows } = await ledger();
    expect(rows).toHaveLength(1);
    expect(p.refundedPence).toBe(6500);
  });

  it("records refunds made in the Stripe dashboard exactly once, even across replays", async () => {
    stripeRefunds.push({ id: "re_dash", amount: 1500 });
    await processStripeEvent(db, event("evt_d1"));
    await processStripeEvent(db, event("evt_d2")); // a different event for the same refund
    const { p, rows, b } = await ledger();
    expect(rows.map((r) => r.providerRefundId)).toEqual(["re_dash"]);
    expect(p).toMatchObject({ refundedPence: 1500, status: "partially_refunded" });
    expect(b.paidPence).toBe(5000);
  });

  it("the database rejects two ledger rows for the same Stripe refund id", async () => {
    await db.insert(refunds).values({ paymentId, amountPence: 100, providerRefundId: "re_same" });
    await expect(db.insert(refunds).values({ paymentId, amountPence: 100, providerRefundId: "re_same" })).rejects.toThrow();
    void sql;
  });
});
