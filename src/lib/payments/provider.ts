import { forbidInStrict, isStrict } from "@/lib/env";

/**
 * Payment provider abstraction (DECISIONS.md #6).
 * Stripe when STRIPE_SECRET_KEY is set, otherwise the local mock provider. Both call the same handlers.
 */
export type CheckoutMode = "payment" | "setup";

export type CreateCheckoutArgs = {
  mode: CheckoutMode;
  amountPence: number; // ignored for setup mode
  description: string;
  customerEmail?: string;
  customerName?: string;
  stripeCustomerId?: string | null;
  /** Save the card for later off-session charges (deposit / card on file models). */
  saveCard: boolean;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type CheckoutResult = { sessionId: string; url: string; customerId?: string | null };

export type ChargeSavedCardArgs = {
  customerId: string;
  paymentMethodId: string;
  amountPence: number;
  description: string;
  metadata: Record<string, string>;
};

export interface PaymentProvider {
  name: "stripe" | "mock";
  createCheckout(args: CreateCheckoutArgs): Promise<CheckoutResult>;
  /** `idempotencyKey` makes a retried request return the original refund instead of creating a second one. */
  refund(providerPaymentId: string, amountPence: number, reason?: string, idempotencyKey?: string): Promise<{ refundId: string }>;
  /** All refunds the provider holds for a payment (used to reconcile charge.refunded webhooks). */
  listRefunds(providerPaymentId: string): Promise<{ id: string; amount: number }[]>;
  /** `requires_action`: the bank wants the cardholder to authenticate (SCA) — can't be completed off-session. */
  chargeSavedCard(args: ChargeSavedCardArgs): Promise<{ paymentId: string; status: "succeeded" | "failed" | "requires_action"; error?: string }>;
  /** Pull the current state of a checkout (used by reconciliation when a webhook was missed). */
  retrieveCheckout(sessionId: string): Promise<CompletedCheckout | { status: "open" | "expired" }>;
  /** Cheap authenticated call proving the provider is reachable and the key works (used by /api/health). */
  ping?(): Promise<void>;
}

export type CompletedCheckout = {
  status: "complete";
  sessionId: string;
  paymentIntentId: string | null;
  setupIntentId: string | null;
  paymentMethodId: string | null;
  customerId: string | null;
  amountTotalPence: number;
};

let cached: PaymentProvider | null = null;

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (cached) return cached;
  if (process.env.STRIPE_SECRET_KEY) {
    const { StripeProvider } = await import("./stripe");
    cached = new StripeProvider(process.env.STRIPE_SECRET_KEY);
  } else {
    // Never fall back to the mock outside local development: it would let anyone confirm a booking without paying.
    forbidInStrict("The mock payment provider");
    const { MockProvider } = await import("./mock");
    cached = new MockProvider();
  }
  return cached;
}

export function paymentsMode(): "stripe" | "mock" {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  return isStrict() ? "stripe" : "mock"; // strict mode never reports mock (getPaymentProvider would throw)
}

/** The /pay/mock checkout page exists only in local development — never in production or preview. */
export function mockCheckoutEnabled(): boolean {
  return !isStrict() && !process.env.STRIPE_SECRET_KEY;
}

/** Tests can inject a fake. */
export function setPaymentProviderForTests(p: PaymentProvider | null) {
  cached = p;
}
