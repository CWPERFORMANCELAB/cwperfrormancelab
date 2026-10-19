import Stripe from "stripe";
import type { ChargeSavedCardArgs, CheckoutResult, CompletedCheckout, CreateCheckoutArgs, PaymentProvider } from "./provider";

/**
 * Stripe Checkout. Cards, Apple Pay and Google Pay are enabled automatically by Checkout (dynamic payment methods —
 * turn wallets on in the Stripe dashboard and register the domain for Apple Pay).
 */
export class StripeProvider implements PaymentProvider {
  name = "stripe" as const;
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, { appInfo: { name: "cw-performance-lab" } });
  }

  async createCheckout(args: CreateCheckoutArgs): Promise<CheckoutResult> {
    let customer = args.stripeCustomerId ?? undefined;
    if (!customer && (args.saveCard || args.mode === "setup") && args.customerEmail) {
      const c = await this.stripe.customers.create({ email: args.customerEmail, name: args.customerName });
      customer = c.id;
    }
    // Stripe requires checkout expiry between 30 minutes and 24 hours from now.
    const minExpiry = Math.floor(Date.now() / 1000) + 31 * 60;
    const expires_at = Math.max(minExpiry, Math.floor(args.expiresAt.getTime() / 1000));

    const params: Stripe.Checkout.SessionCreateParams =
      args.mode === "setup"
        ? {
            mode: "setup",
            currency: "gbp",
            customer,
            metadata: args.metadata,
            setup_intent_data: { metadata: args.metadata, description: args.description },
            success_url: `${args.successUrl}${args.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: args.cancelUrl,
            expires_at,
          }
        : {
            mode: "payment",
            customer,
            customer_email: customer ? undefined : args.customerEmail,
            line_items: [
              {
                quantity: 1,
                price_data: { currency: "gbp", unit_amount: args.amountPence, product_data: { name: args.description } },
              },
            ],
            payment_intent_data: {
              metadata: args.metadata,
              description: args.description,
              ...(args.saveCard ? { setup_future_usage: "off_session" as const } : {}),
            },
            metadata: args.metadata,
            success_url: `${args.successUrl}${args.successUrl.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: args.cancelUrl,
            expires_at,
          };

    const session = await this.stripe.checkout.sessions.create(params, {
      idempotencyKey: args.metadata.paymentId ? `checkout:${args.metadata.paymentId}` : undefined,
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { sessionId: session.id, url: session.url, customerId: customer ?? null };
  }

  async refund(providerPaymentId: string, amountPence: number, reason?: string, idempotencyKey?: string) {
    const r = await this.stripe.refunds.create(
      { payment_intent: providerPaymentId, amount: amountPence, metadata: reason ? { reason } : undefined },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    return { refundId: r.id };
  }

  async listRefunds(providerPaymentId: string) {
    const out: { id: string; amount: number }[] = [];
    for await (const r of this.stripe.refunds.list({ payment_intent: providerPaymentId, limit: 100 })) {
      if (r.status !== "failed" && r.status !== "canceled") out.push({ id: r.id, amount: r.amount });
    }
    return out;
  }

  async chargeSavedCard(args: ChargeSavedCardArgs) {
    try {
      const pi = await this.stripe.paymentIntents.create({
        amount: args.amountPence,
        currency: "gbp",
        customer: args.customerId,
        payment_method: args.paymentMethodId,
        off_session: true,
        confirm: true,
        description: args.description,
        metadata: args.metadata,
      });
      if (pi.status === "succeeded") return { paymentId: pi.id, status: "succeeded" as const };
      if (pi.status === "requires_action") return { paymentId: pi.id, status: "requires_action" as const, error: "authentication_required" };
      return { paymentId: pi.id, status: "failed" as const };
    } catch (err) {
      // Under SCA (common with UK cards) an off-session charge fails with code authentication_required.
      const e = err as { message?: string; code?: string; raw?: { code?: string; payment_intent?: { id?: string; status?: string } } };
      const code = e.code ?? e.raw?.code;
      const piStatus = e.raw?.payment_intent?.status;
      const needsAuth = code === "authentication_required" || piStatus === "requires_action";
      return { paymentId: e.raw?.payment_intent?.id ?? "", status: needsAuth ? ("requires_action" as const) : ("failed" as const), error: code ?? e.message };
    }
  }

  async retrieveCheckout(sessionId: string): Promise<CompletedCheckout | { status: "open" | "expired" }> {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId, { expand: ["setup_intent", "payment_intent"] });
    if (s.status !== "complete") return { status: s.status === "expired" ? "expired" : "open" };
    return toCompleted(s);
  }

  constructWebhookEvent(payload: string, signature: string, secret: string) {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  async expandSession(sessionId: string) {
    return this.retrieveCheckout(sessionId);
  }
}

export function toCompleted(s: Stripe.Checkout.Session): CompletedCheckout {
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const si = s.setup_intent;
  const setupIntentId = typeof si === "string" ? si : si?.id ?? null;
  let paymentMethodId: string | null = null;
  if (si && typeof si !== "string") paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;
  const piObj = s.payment_intent && typeof s.payment_intent !== "string" ? s.payment_intent : null;
  if (!paymentMethodId && piObj) paymentMethodId = typeof piObj.payment_method === "string" ? piObj.payment_method : piObj.payment_method?.id ?? null;
  return {
    status: "complete",
    sessionId: s.id,
    paymentIntentId: pi,
    setupIntentId,
    paymentMethodId,
    customerId: typeof s.customer === "string" ? s.customer : s.customer?.id ?? null,
    amountTotalPence: s.amount_total ?? 0,
  };
}
