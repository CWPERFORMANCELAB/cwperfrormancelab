/**
 * Payment orchestration shared by Stripe webhooks, the mock checkout and reconciliation.
 * Every handler is idempotent: Stripe retries webhooks, users double-click, and reconciliation re-runs.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { business, hasBasrat } from "@config/business";
import type { Db, DbOrTx } from "@/db/client";
import { bookings, clients, paymentLinks, payments, refunds, vouchers, webhookEvents, type Payment } from "@/db/schema";
import { audit } from "@/lib/audit";
import { confirmBooking } from "@/lib/booking/service";
import { formatLong } from "@/lib/time";
import { formatPence, taxFromInclusive } from "@/lib/money";
import { alertAdmin, enqueue } from "@/lib/notifications/queue";
import { siteUrl } from "@/lib/url";
import { BookingError } from "@/lib/booking/errors";
import { getPaymentProvider, type CheckoutMode, type CompletedCheckout } from "./provider";

export type PaymentPurpose = "booking" | "voucher" | "payment_link" | "package";

export async function startPayment(
  db: Db,
  args: {
    purpose: PaymentPurpose;
    mode: CheckoutMode;
    kind: Payment["kind"];
    amountPence: number;
    saveCard: boolean;
    description: string;
    customerEmail?: string;
    customerName?: string;
    stripeCustomerId?: string | null;
    clientId?: string | null;
    bookingId?: string | null;
    voucherId?: string | null;
    paymentLinkId?: string | null;
    packagePurchaseId?: string | null;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
    taxRateBp?: number;
  },
): Promise<string> {
  const provider = await getPaymentProvider();
  const [payment] = await db
    .insert(payments)
    .values({
      bookingId: args.bookingId ?? null,
      voucherId: args.voucherId ?? null,
      packagePurchaseId: args.packagePurchaseId ?? null,
      clientId: args.clientId ?? null,
      provider: provider.name,
      kind: args.kind,
      amountPence: args.mode === "setup" ? 0 : args.amountPence,
      taxPence: taxFromInclusive(args.amountPence, args.taxRateBp ?? 0),
      status: "pending",
      description: args.description,
      metadata: {
        purpose: args.purpose,
        paymentLinkId: args.paymentLinkId ?? null,
        // Stripe keeps these itself; the local mock checkout needs them to redirect the same way.
        ...(provider.name === "mock" ? { successUrl: args.successUrl, cancelUrl: args.cancelUrl } : {}),
      },
    })
    .returning();

  const metadata: Record<string, string> = { paymentId: payment.id, purpose: args.purpose };
  if (args.bookingId) metadata.bookingId = args.bookingId;
  if (args.voucherId) metadata.voucherId = args.voucherId;
  if (args.paymentLinkId) metadata.paymentLinkId = args.paymentLinkId;

  const session = await provider.createCheckout({
    mode: args.mode,
    amountPence: args.amountPence,
    description: args.description,
    customerEmail: args.customerEmail,
    customerName: args.customerName,
    stripeCustomerId: args.stripeCustomerId,
    saveCard: args.saveCard,
    metadata,
    successUrl: args.successUrl,
    cancelUrl: args.cancelUrl,
    expiresAt: args.expiresAt,
  });
  await db.update(payments).set({ providerSessionId: session.sessionId, updatedAt: new Date() }).where(eq(payments.id, payment.id));
  if (session.customerId && args.clientId) {
    await db.update(clients).set({ stripeCustomerId: session.customerId }).where(and(eq(clients.id, args.clientId), sql`${clients.stripeCustomerId} is null`));
  }
  return session.url;
}

/**
 * Checkout completed (webhook `checkout.session.completed`, mock page, or reconciliation).
 * Order matters: mark the payment succeeded first (money is real), then fulfil. If fulfilment fails because the slot
 * was lost, refund automatically and alert the admin.
 */
export async function handleCheckoutCompleted(db: Db, c: CompletedCheckout): Promise<{ ok: boolean; outcome: string }> {
  const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, c.sessionId));
  if (!p) return { ok: false, outcome: "unknown_session" };
  if (p.status === "succeeded" || p.status === "refunded" || p.status === "partially_refunded") return { ok: true, outcome: "already_processed" };

  const receiptNumber = `CW-${new Date().getFullYear()}-${p.id.slice(0, 8).toUpperCase()}`;
  await db
    .update(payments)
    .set({
      status: "succeeded",
      providerPaymentId: c.paymentIntentId ?? c.setupIntentId,
      providerPaymentMethodId: c.paymentMethodId,
      amountPence: p.kind === "setup" ? 0 : c.amountTotalPence || p.amountPence,
      receiptNumber: p.kind === "setup" ? null : receiptNumber,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, p.id));
  if (c.customerId && p.clientId) {
    await db.update(clients).set({ stripeCustomerId: c.customerId }).where(eq(clients.id, p.clientId));
  }
  const purpose = (p.metadata as { purpose?: string }).purpose;
  const paid = p.kind === "setup" ? 0 : c.amountTotalPence || p.amountPence;

  if ((purpose === "booking" || purpose === "payment_link") && p.bookingId) {
    try {
      await confirmBooking(db, p.bookingId, { paidPence: paid });
      const linkId = (p.metadata as { paymentLinkId?: string }).paymentLinkId;
      if (linkId) await db.update(paymentLinks).set({ status: "paid", bookingId: p.bookingId }).where(eq(paymentLinks.id, linkId));
      if (paid > 0) await sendReceipt(db, p.id);
      return { ok: true, outcome: "booking_confirmed" };
    } catch (err) {
      // Payment succeeded but the booking can't be honoured (slot lost after the hold expired) → refund in full.
      if (paid > 0) await refundPayment(db, p.id, paid, { reason: "slot_unavailable_after_payment", automatic: true, actor: "system" });
      await db
        .update(bookings)
        .set({ status: "cancelled", cancelReason: "slot_lost_refunded", updatedAt: new Date() })
        .where(eq(bookings.id, p.bookingId));
      await alertAdmin(db, "admin_cancellation", {
        bookingId: p.bookingId,
        vars: { refundLine: `Payment arrived after the slot was taken: ${formatPence(paid)} refunded automatically. Please contact the client.` },
        dedupeKey: `slot_lost:${p.bookingId}`,
      });
      await audit(db, { actor: "system", action: "payment.reconciled_refund", entityType: "payment", entityId: p.id, meta: { error: String(err) } });
      return { ok: false, outcome: "refunded_slot_lost" };
    }
  }

  if (purpose === "payment_link") {
    const linkId = (p.metadata as { paymentLinkId?: string }).paymentLinkId;
    if (linkId) await db.update(paymentLinks).set({ status: "paid" }).where(eq(paymentLinks.id, linkId));
    if (paid > 0) await sendReceipt(db, p.id);
    return { ok: true, outcome: "payment_link_paid" };
  }

  if (purpose === "voucher" && p.voucherId) {
    const { activateVoucher } = await import("@/lib/voucher-sales");
    await activateVoucher(db, p.voucherId);
    return { ok: true, outcome: "voucher_activated" };
  }

  if (purpose === "package" && p.packagePurchaseId) {
    const { activatePackage } = await import("@/lib/packages");
    await activatePackage(db, p.packagePurchaseId);
    return { ok: true, outcome: "package_activated" };
  }
  return { ok: true, outcome: "recorded" };
}

/** Checkout abandoned/expired: release the slot hold, void a pending voucher. */
export async function handleCheckoutExpired(db: Db, sessionId: string) {
  const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, sessionId));
  if (!p || p.status !== "pending") return;
  await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, p.id));
  if (p.bookingId) {
    await db
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "checkout_expired", updatedAt: new Date() })
      .where(and(eq(bookings.id, p.bookingId), eq(bookings.status, "pending_payment")));
  }
  if (p.voucherId) await db.update(vouchers).set({ status: "void" }).where(and(eq(vouchers.id, p.voucherId), eq(vouchers.status, "pending")));
}

/* ------------------------------------------------------------------- refunds */

export async function refundPayment(
  db: DbOrTx,
  paymentId: string,
  amountPence: number,
  args: { reason: string; automatic: boolean; actor: string },
): Promise<number> {
  const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!p) throw new BookingError("not_found", "Payment not found");
  const refundable = p.amountPence - p.refundedPence;
  const amount = Math.min(refundable, amountPence);
  if (amount <= 0) return 0;
  let providerRefundId: string | null = null;
  if (p.provider !== "manual" && p.providerPaymentId) {
    const provider = await getPaymentProvider();
    ({ refundId: providerRefundId } = await provider.refund(p.providerPaymentId, amount, args.reason));
  }
  const refunded = p.refundedPence + amount;
  await db
    .update(payments)
    .set({ refundedPence: refunded, status: refunded >= p.amountPence ? "refunded" : "partially_refunded", updatedAt: new Date() })
    .where(eq(payments.id, p.id));
  await db.insert(refunds).values({ paymentId: p.id, amountPence: amount, reason: args.reason, providerRefundId, automatic: args.automatic });
  if (p.bookingId) await db.update(bookings).set({ paidPence: sql`greatest(0, ${bookings.paidPence} - ${amount})` }).where(eq(bookings.id, p.bookingId));
  await audit(db, { actor: args.actor, action: "payment.refund", entityType: "payment", entityId: p.id, meta: { amount, reason: args.reason, automatic: args.automatic } });
  return amount;
}

/** Refund up to `amountPence` across a booking's successful payments, newest first. */
export async function refundBooking(db: DbOrTx, bookingId: string, amountPence: number, args: { reason: string; automatic: boolean; actor: string }) {
  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.bookingId, bookingId), sql`${payments.status} in ('succeeded','partially_refunded')`, sql`${payments.amountPence} > ${payments.refundedPence}`));
  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  let remaining = amountPence;
  let total = 0;
  for (const p of rows) {
    if (remaining <= 0) break;
    const r = await refundPayment(db, p.id, remaining, args);
    remaining -= r;
    total += r;
  }
  return total;
}

/** Charge a fee (or a manual booking) to the card saved at checkout. Returns the amount charged (0 if it failed). */
export async function chargeFeeToSavedCard(db: Db, bookingId: string, amountPence: number, description: string, kind: Payment["kind"] = "fee"): Promise<number> {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b?.clientId) return 0;
  const [c] = await db.select().from(clients).where(eq(clients.id, b.clientId));
  const [card] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.clientId, b.clientId), sql`${payments.providerPaymentMethodId} is not null`, eq(payments.status, "succeeded")))
    .orderBy(sql`${payments.createdAt} desc`)
    .limit(1);
  if (!c?.stripeCustomerId || !card?.providerPaymentMethodId) return 0;
  const provider = await getPaymentProvider();
  const r = await provider.chargeSavedCard({
    customerId: c.stripeCustomerId,
    paymentMethodId: card.providerPaymentMethodId,
    amountPence,
    description: `${description} · ${business.name}`,
    metadata: { bookingId },
  });
  await db.insert(payments).values({
    bookingId,
    clientId: c.id,
    provider: provider.name,
    providerPaymentId: r.paymentId || null,
    kind,
    amountPence: r.status === "succeeded" ? amountPence : 0,
    status: r.status === "succeeded" ? "succeeded" : "failed",
    description,
    metadata: r.error ? { error: r.error } : {},
  });
  if (r.status === "succeeded" && kind === "payment") {
    await db.update(bookings).set({ paidPence: sql`${bookings.paidPence} + ${amountPence}` }).where(eq(bookings.id, bookingId));
  }
  await audit(db, { actor: "system", action: `payment.charge_${kind}`, entityType: "booking", entityId: bookingId, meta: { amountPence, status: r.status } });
  return r.status === "succeeded" ? amountPence : 0;
}

/* -------------------------------------------------------------------- receipt */

export async function sendReceipt(db: DbOrTx, paymentId: string) {
  const [row] = await db
    .select({ p: payments, c: clients, b: bookings })
    .from(payments)
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .leftJoin(bookings, eq(bookings.id, payments.bookingId))
    .where(eq(payments.id, paymentId));
  if (!row?.c || !row.p.receiptNumber) return;
  const { p, c, b } = row;
  // Receipts are part of the confirmation email body for bookings; this is the standalone record for the client's files.
  await enqueue(db, {
    templateKey: "receipt",
    to: c.email,
    clientId: c.id,
    bookingId: b?.id,
    vars: receiptVars(p, b?.startsAt ?? null),
    dedupeKey: `receipt:${p.id}`,
  });
}

export function receiptVars(p: Payment, startsAt: Date | null): Record<string, string> {
  return {
    receiptNumber: p.receiptNumber ?? "",
    receiptDate: formatLong(p.createdAt),
    receiptDescription: p.description ?? "",
    receiptAmount: formatPence(p.amountPence),
    receiptVat: p.taxPence > 0 ? `Includes VAT ${formatPence(p.taxPence)}` : "",
    receiptAppointment: startsAt ? formatLong(startsAt) : "",
    regulatorLine: hasBasrat() ? `BASRaT registration: ${business.practitioner.basratNumber}` : "",
    legalName: business.legalName,
  };
}

/* ------------------------------------------------------------- webhooks */

/**
 * Idempotent Stripe event processing. The event id is recorded first; a duplicate delivery returns early.
 * Failures are recorded and re-thrown so Stripe retries.
 */
export async function processStripeEvent(db: Db, event: { id: string; type: string; data: { object: unknown } }) {
  const inserted = await db.insert(webhookEvents).values({ id: event.id, provider: "stripe", type: event.type }).onConflictDoNothing().returning();
  if (!inserted.length) {
    const [existing] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, event.id));
    if (existing?.processedAt) return { duplicate: true };
  }
  try {
    const obj = event.data.object as Record<string, unknown>;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const { toCompleted } = await import("./stripe");
        // Expand the setup/payment intent so we get the saved payment method.
        const provider = await getPaymentProvider();
        const full = provider.name === "stripe" ? await provider.retrieveCheckout(obj.id as string) : null;
        const completed = full && full.status === "complete" ? full : toCompleted(obj as never);
        if ((obj.payment_status as string) === "unpaid" && obj.mode === "payment") break; // async methods: wait
        await handleCheckoutCompleted(db, completed);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleCheckoutExpired(db, obj.id as string);
        break;
      case "charge.refunded": {
        // Refunds made directly in the Stripe dashboard: keep our ledger in sync.
        const pi = obj.payment_intent as string | undefined;
        const refunded = obj.amount_refunded as number | undefined;
        if (pi && typeof refunded === "number") {
          const [p] = await db.select().from(payments).where(eq(payments.providerPaymentId, pi));
          if (p && refunded > p.refundedPence) {
            const delta = refunded - p.refundedPence;
            await db
              .update(payments)
              .set({ refundedPence: refunded, status: refunded >= p.amountPence ? "refunded" : "partially_refunded", updatedAt: new Date() })
              .where(eq(payments.id, p.id));
            await db.insert(refunds).values({ paymentId: p.id, amountPence: delta, reason: "stripe_dashboard", automatic: false });
          }
        }
        break;
      }
      default:
        break;
    }
    await db.update(webhookEvents).set({ processedAt: new Date(), error: null }).where(eq(webhookEvents.id, event.id));
    return { duplicate: false };
  } catch (err) {
    await db.update(webhookEvents).set({ error: String(err).slice(0, 500) }).where(eq(webhookEvents.id, event.id));
    throw err;
  }
}

/**
 * Safety net for missed webhooks: ask Stripe about checkouts still pending after 10 minutes.
 * Also covers "booking created but payment never completed" — those holds are released by the sweeper.
 */
export async function reconcilePendingPayments(db: Db, now = new Date()) {
  const provider = await getPaymentProvider();
  if (provider.name !== "stripe") return { checked: 0 };
  const stale = await db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "pending"), lt(payments.createdAt, new Date(now.getTime() - 10 * 60_000)), sql`${payments.providerSessionId} is not null`))
    .limit(25);
  for (const p of stale) {
    const s = await provider.retrieveCheckout(p.providerSessionId!);
    if (s.status === "complete") await handleCheckoutCompleted(db, s);
    else if (s.status === "expired") await handleCheckoutExpired(db, p.providerSessionId!);
  }
  return { checked: stale.length };
}

export function paymentLinkUrl(token: string) {
  return siteUrl(`/pay/${token}`);
}
