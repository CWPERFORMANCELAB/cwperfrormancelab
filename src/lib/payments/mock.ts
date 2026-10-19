import { randomToken } from "@/lib/crypto";
import { siteUrl } from "@/lib/url";
import type { ChargeSavedCardArgs, CheckoutResult, CreateCheckoutArgs, PaymentProvider } from "./provider";

/**
 * Local stand-in for Stripe Checkout. The "checkout page" is /pay/mock/[sessionId], which calls the same
 * completion handler a Stripe webhook would. Lets the whole flow run (and be tested) with no keys.
 */
export class MockProvider implements PaymentProvider {
  name = "mock" as const;

  async createCheckout(args: CreateCheckoutArgs): Promise<CheckoutResult> {
    const sessionId = `mock_cs_${randomToken(12)}`;
    const customerId = args.stripeCustomerId ?? (args.saveCard ? `mock_cus_${randomToken(8)}` : null);
    return { sessionId, url: siteUrl(`/pay/mock/${sessionId}`), customerId };
  }

  async refund(providerPaymentId: string, amountPence: number) {
    console.info(`[payments:mock] refund £${(amountPence / 100).toFixed(2)} on ${providerPaymentId}`);
    return { refundId: `mock_re_${randomToken(8)}` };
  }

  async listRefunds() {
    return [];
  }

  async chargeSavedCard(args: ChargeSavedCardArgs) {
    console.info(`[payments:mock] off-session charge £${(args.amountPence / 100).toFixed(2)} to ${args.customerId}`);
    return { paymentId: `mock_pi_${randomToken(10)}`, status: "succeeded" as const };
  }

  async retrieveCheckout() {
    return { status: "open" as const };
  }
}
