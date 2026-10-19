import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { getPaymentProvider } from "@/lib/payments/provider";
import { processStripeEvent } from "@/lib/payments/handlers";

/**
 * Stripe webhook. Signature verified with STRIPE_WEBHOOK_SECRET against the RAW body; processing is idempotent
 * (webhook_events table). Non-2xx makes Stripe retry, which is what we want on transient failure.
 *
 * Events to enable in the Stripe dashboard: checkout.session.completed, checkout.session.async_payment_succeeded,
 * checkout.session.async_payment_failed, checkout.session.expired, charge.refunded,
 * charge.dispute.created, charge.dispute.updated, charge.dispute.closed.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const provider = await getPaymentProvider();
  if (!secret || provider.name !== "stripe") return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = (provider as import("@/lib/payments/stripe").StripeProvider).constructWebhookEvent(raw, sig, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const r = await processStripeEvent(db, event as never);
    return NextResponse.json({ received: true, duplicate: r.duplicate });
  } catch (err) {
    console.error("[stripe webhook] processing failed", (event as { type: string }).type, err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
