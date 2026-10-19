/**
 * PRE-DEPLOY-FIXES #11: error reports carry no personal/health data; /api/health checks the database, Stripe and the
 * scheduler; the admin is emailed when a webhook keeps failing or reconciliation finds a payment we missed.
 */
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notifications, payments, webhookEvents } from "@/db/schema";
import { beginCheckout, createHold, submitDetails } from "@/lib/booking/service";
import { recordCronRun } from "@/lib/cron";
import { checkHealth, resetHealthCache } from "@/lib/health";
import { sentryOptions } from "@/lib/monitoring";
import { processStripeEvent, reconcilePendingPayments, WEBHOOK_ALERT_AFTER } from "@/lib/payments/handlers";
import { setPaymentProviderForTests, type PaymentProvider } from "@/lib/payments/provider";
import { scrubEvent, scrubString } from "@/lib/scrub";
import { contentSecurityPolicy } from "@/lib/security-headers";
import { addMinutes } from "@/lib/time";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

describe("Sentry scrubbing", () => {
  const uuid = "550e8400-e29b-41d4-a716-446655440000";
  const raw = {
    event_id: "0123456789abcdef0123456789abcdef",
    message: "Booking failed for jo.bloggs@example.com (07700 900123)",
    request: {
      url: "https://cwperformancelab.co.uk/book/details?email=jo.bloggs%40example.com",
      method: "POST",
      data: { medicalHistory: "ACL reconstruction 2024, on warfarin", email: "jo.bloggs@example.com" },
      cookies: { cw_admin: "secret-session" },
      query_string: "email=jo.bloggs@example.com",
      headers: { cookie: "cw_admin=secret", authorization: "Bearer x", "user-agent": "Mozilla/5.0", referer: "https://x/pay/tok?e=a@b.co" },
      env: { REMOTE_ADDR: "81.2.69.160" },
    },
    user: { id: "u_1", email: "jo.bloggs@example.com", ip_address: "81.2.69.160" },
    exception: { values: [{ type: "Error", value: `Client +44 7700 900123 not found (payment ${uuid}, pi_3Nabc1234567890)`, stacktrace: { frames: [{ filename: "app.js", lineno: 12, vars: { email: "x@y.com" } }] } }] },
    breadcrumbs: [{ message: "sent to jo@example.org", data: { phone: "+1-202-555-0143" } }],
    extra: { notes: "call on (020) 7946 0958" },
  };
  const out = scrubEvent(raw) as Record<string, unknown> & typeof raw;
  const json = JSON.stringify(out);

  it("drops request bodies, cookies, query strings and sensitive headers", () => {
    expect(json).not.toContain("warfarin");
    expect(json).not.toContain("secret");
    expect(json).not.toContain("Bearer");
    expect(json).not.toContain("81.2.69.160");
    expect(out.request).toEqual({ url: "https://cwperformancelab.co.uk/book/details", headers: { "user-agent": "Mozilla/5.0" } });
    expect(out.user).toEqual({ id: "u_1" });
  });

  it("replaces every email and phone number, everywhere in the event", () => {
    expect(json).not.toMatch(/@example\.(com|org)/);
    expect(json).not.toMatch(/7700|555-0143|7946/);
    expect(out.message).toBe("Booking failed for [email] ([phone])");
    expect(out.extra.notes).toBe("call on [phone]");
    expect(json).not.toContain('"vars"');
  });

  it("keeps ids needed for debugging", () => {
    expect(out.event_id).toBe(raw.event_id);
    expect(out.exception.values[0].value).toContain(uuid);
    expect(out.exception.values[0].value).toContain("pi_3Nabc1234567890");
    expect(scrubString("Paid £60.00 on 2026-10-19 at 13:00, 3 sessions")).toBe("Paid £60.00 on 2026-10-19 at 13:00, 3 sessions");
  });

  it("Sentry is configured without default PII and with the scrubber on every event", () => {
    const o = sentryOptions("https://key@o1.ingest.de.sentry.io/2", "server");
    expect(o.sendDefaultPii).toBe(false);
    expect(o.tracesSampleRate).toBe(0);
    expect(JSON.stringify(o.beforeSend(raw as never))).not.toContain("warfarin");
    expect(o.beforeBreadcrumb({ category: "ui.input", message: "typed" })).toBeNull();
  });

  it("the CSP allows exactly the ingest host from the DSN, and nothing when unset", () => {
    expect(contentSecurityPolicy({ sentryDsn: "https://key@o1.ingest.de.sentry.io/2" })).toContain("connect-src 'self' https://api.stripe.com https://challenges.cloudflare.com https://o1.ingest.de.sentry.io");
    expect(contentSecurityPolicy()).not.toContain("sentry");
  });
});

let db: Db;
let pingFails = false;
let pings = 0;
let checkoutState: "complete" | "open" | "throw" = "open";
const fake: PaymentProvider = {
  name: "stripe" as never,
  async createCheckout() {
    const id = `cs_test_${Math.random().toString(36).slice(2)}`;
    return { sessionId: id, url: `https://checkout.test/${id}`, customerId: null };
  },
  async refund() {
    return { refundId: "re_1" };
  },
  async listRefunds() {
    return [];
  },
  async chargeSavedCard() {
    return { paymentId: "pi_x", status: "succeeded" };
  },
  async retrieveCheckout(sessionId) {
    if (checkoutState === "throw") throw new Error("Stripe API unavailable");
    if (checkoutState === "open") return { status: "open" };
    return { status: "complete", sessionId, paymentIntentId: "pi_late", setupIntentId: null, paymentMethodId: null, customerId: null, amountTotalPence: 6000 };
  },
  async ping() {
    pings++;
    if (pingFails) throw new Error("401 invalid key sk_live_…");
  },
};

beforeEach(async () => {
  db = await freshDb();
  pingFails = false;
  pings = 0;
  checkoutState = "open";
  resetHealthCache();
  setPaymentProviderForTests(fake);
});
afterEach(() => setPaymentProviderForTests(null));

const opsAlerts = () => db.select().from(notifications).where(eq(notifications.templateKey, "admin_ops_alert"));
const health = (over: Partial<Parameters<typeof checkHealth>[0]> = {}) =>
  checkHealth({ getDb: async () => db, getProvider: async () => fake, now: addMinutes(NOW, 5), strict: true, ...over });

describe("/api/health", () => {
  it("healthy when the database answers, Stripe responds and cron ran recently", async () => {
    await recordCronRun(db, {}, NOW);
    const r = await health();
    expect(r.ok).toBe(true);
    expect(r.checks).toMatchObject({ database: { ok: true }, stripe: { ok: true }, cron: { ok: true, ageMinutes: 5 } });
  });

  it("unhealthy (and says which part) when Stripe fails, without leaking the error", async () => {
    await recordCronRun(db, {}, NOW);
    pingFails = true;
    const r = await health();
    expect(r).toMatchObject({ ok: false, checks: { database: { ok: true }, stripe: { ok: false }, cron: { ok: true } } });
    expect(JSON.stringify(r)).not.toContain("sk_live");
  });

  it("unhealthy when cron is stale or the database is unreachable", async () => {
    await recordCronRun(db, {}, NOW);
    expect((await health({ now: addMinutes(NOW, 16) })).checks.cron.ok).toBe(false);
    const down = await health({ getDb: async () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(down).toMatchObject({ ok: false, checks: { database: { ok: false }, cron: { ok: false } } });
  });

  it("the mock payment provider is never healthy in production/preview", async () => {
    await recordCronRun(db, {}, NOW);
    const mock = { ...fake, name: "mock" as const };
    expect((await health({ getProvider: async () => mock })).checks.stripe.ok).toBe(false);
    expect((await health({ getProvider: async () => mock, strict: false })).checks.stripe).toMatchObject({ ok: true, skipped: true });
  });

  it("reuses the Stripe result for a minute so the public endpoint can't burn the Stripe rate limit", async () => {
    await health();
    await health();
    await health();
    expect(pings).toBe(1);
  });
});

describe("admin alerts", () => {
  const failingEvent = { id: "evt_fail_1", type: "checkout.session.completed", data: { object: { id: "cs_missing", mode: "payment", payment_status: "paid" } } };

  it(`emails the admin once when a webhook has failed ${WEBHOOK_ALERT_AFTER} times`, async () => {
    checkoutState = "throw";
    for (let i = 1; i <= 5; i++) {
      await expect(processStripeEvent(db, failingEvent)).rejects.toThrow("Stripe API unavailable");
      expect(await opsAlerts()).toHaveLength(i < WEBHOOK_ALERT_AFTER ? 0 : 1);
    }
    const [ev] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, failingEvent.id));
    expect(ev.attempts).toBe(5);
    const [alert] = await opsAlerts();
    expect(alert.vars).toMatchObject({ alertTitle: "Stripe event failing (checkout.session.completed)" });
  });

  it("emails the admin when reconciliation finds a payment Stripe completed but we never processed", async () => {
    const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
    await submitDetails(db, booking.id, holdToken, details("late@example.com"), NOW);
    await beginCheckout(db, booking.id, holdToken, NOW);
    const later = new Date(Date.now() + 20 * 60_000);

    checkoutState = "open";
    expect(await reconcilePendingPayments(db, later)).toEqual({ checked: 1, mismatches: 0 });
    expect(await opsAlerts()).toHaveLength(0);

    checkoutState = "complete";
    expect(await reconcilePendingPayments(db, later)).toEqual({ checked: 1, mismatches: 1 });
    const [p] = await db.select().from(payments).where(eq(payments.bookingId, booking.id));
    expect(p.status).toBe("succeeded");
    const alerts = await opsAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].vars).toMatchObject({ alertTitle: "payment found by reconciliation" });
    expect(JSON.stringify(alerts[0].vars)).not.toContain("late@example.com");

    // Nothing left pending, so the next run is quiet.
    expect(await reconcilePendingPayments(db, later)).toEqual({ checked: 0, mismatches: 0 });
  });
});
