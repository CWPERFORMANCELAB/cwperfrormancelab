/**
 * PRE-DEPLOY-FIXES #7: chargebacks are recorded and alerted; saved-card fees that need SCA become a payment link.
 */
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { bookings, clients, disputes, notifications, paymentLinks, payments } from "@/db/schema";
import { chargeFeeToSavedCard, processStripeEvent } from "@/lib/payments/handlers";
import { setPaymentProviderForTests, type PaymentProvider } from "@/lib/payments/provider";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at } from "./fixtures";

let chargeResult: Awaited<ReturnType<PaymentProvider["chargeSavedCard"]>> = { paymentId: "pi_fee", status: "succeeded" };
const fake: PaymentProvider = {
  name: "stripe" as never,
  async createCheckout() {
    throw new Error("unused");
  },
  async refund() {
    return { refundId: "re_1" };
  },
  async listRefunds() {
    return [];
  },
  async chargeSavedCard() {
    return chargeResult;
  },
  async retrieveCheckout() {
    return { status: "open" };
  },
};

let db: Db;
let bookingId: string;
let clientId: string;

beforeEach(async () => {
  db = await freshDb();
  setPaymentProviderForTests(fake);
  const [c] = await db.insert(clients).values({ firstName: "Dee", lastName: "Sputer", email: "dee@example.com", stripeCustomerId: "cus_1" }).returning();
  clientId = c.id;
  const start = at(MON, "10:00");
  const [b] = await db
    .insert(bookings)
    .values({ practitionerId: business.practitioner.id, serviceId: "sports-massage", clientId, status: "no_show", paymentModel: "card_on_file", startsAt: start, endsAt: addMinutes(start, 60), occupiedUntil: addMinutes(start, 70), pricePence: 6000 })
    .returning();
  bookingId = b.id;
  // The card saved at checkout (SetupIntent)
  await db.insert(payments).values({ bookingId, clientId, provider: "stripe", kind: "setup", amountPence: 0, status: "succeeded", providerPaymentId: "seti_1", providerPaymentMethodId: "pm_1" });
});
afterEach(() => setPaymentProviderForTests(null));

const templates = async (key: string) => db.select().from(notifications).where(eq(notifications.templateKey, key));

describe("off-session fee needing authentication (SCA)", () => {
  it("emails the client a payment link for the fee and alerts the admin instead of just failing", async () => {
    chargeResult = { paymentId: "pi_sca", status: "requires_action", error: "authentication_required" };
    const charged = await chargeFeeToSavedCard(db, bookingId, 3000, "No-show fee");
    expect(charged).toBe(0);

    const links = await db.select().from(paymentLinks).where(eq(paymentLinks.clientId, clientId));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ amountPence: 3000, status: "open", recipientEmail: "dee@example.com" });

    const toClient = await templates("payment_link");
    expect(toClient.map((n) => n.to)).toEqual(["dee@example.com"]);
    expect(await templates("admin_sca_fee")).toHaveLength(1);

    const [failed] = await db.select().from(payments).where(sql`${payments.metadata}->>'authenticationRequired' = 'true'`);
    expect(failed.metadata).toMatchObject({ paymentLinkId: links[0].id, requestedPence: 3000 });
  });

  it("a plain decline is recorded as failed without a payment link", async () => {
    chargeResult = { paymentId: "pi_dec", status: "failed", error: "card_declined" };
    expect(await chargeFeeToSavedCard(db, bookingId, 3000, "No-show fee")).toBe(0);
    expect(await db.select().from(paymentLinks)).toHaveLength(0);
  });

  it("a successful charge still records the fee", async () => {
    chargeResult = { paymentId: "pi_ok", status: "succeeded" };
    expect(await chargeFeeToSavedCard(db, bookingId, 3000, "No-show fee")).toBe(3000);
  });
});

describe("disputes (chargebacks)", () => {
  const dispute = (id: string, type: string, status: string) => ({
    id,
    type,
    data: { object: { id: "dp_1", amount: 6000, reason: "fraudulent", status, payment_intent: "pi_paid", evidence_details: { due_by: 1_900_000_000 } } },
  });

  beforeEach(async () => {
    await db.insert(payments).values({ bookingId, clientId, provider: "stripe", providerPaymentId: "pi_paid", amountPence: 6000, status: "succeeded" });
  });

  it("charge.dispute.created records the dispute against the payment and alerts the admin", async () => {
    await processStripeEvent(db, dispute("evt_dc", "charge.dispute.created", "needs_response"));
    const [d] = await db.select().from(disputes);
    const [p] = await db.select().from(payments).where(eq(payments.providerPaymentId, "pi_paid"));
    expect(d).toMatchObject({ providerDisputeId: "dp_1", paymentId: p.id, amountPence: 6000, reason: "fraudulent", status: "needs_response", closedAt: null });
    const alerts = await templates("admin_dispute");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].vars).toMatchObject({ clientFullName: "Dee Sputer", disputeAmount: "£60" });
  });

  it("charge.dispute.closed updates the same record (no duplicate) and sends a closing alert", async () => {
    await processStripeEvent(db, dispute("evt_dc", "charge.dispute.created", "needs_response"));
    await processStripeEvent(db, dispute("evt_dx", "charge.dispute.closed", "won"));
    const rows = await db.select().from(disputes);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("won");
    expect(rows[0].closedAt).toBeTruthy();
    expect(await templates("admin_dispute_closed")).toHaveLength(1);
  });
});
