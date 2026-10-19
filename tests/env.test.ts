import { afterEach, describe, expect, it, vi } from "vitest";
import { shouldAutoMigrate } from "@/db/client";
import { assertProductionEnv, EnvError, runtimeMode } from "@/lib/env";

const full = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  DATABASE_URL: "postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  SESSION_SECRET: "x".repeat(40),
  CRON_SECRET: "cron-secret",
  STRIPE_SECRET_KEY: "sk_live_123",
  STRIPE_WEBHOOK_SECRET: "whsec_123",
  RESEND_API_KEY: "re_123",
  EMAIL_FROM: "CW <bookings@example.co.uk>",
  NEXT_PUBLIC_SITE_URL: "https://cwperformancelab.co.uk",
  TURNSTILE_SECRET_KEY: "ts",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "tk",
  TWILIO_ACCOUNT_SID: "AC1",
  TWILIO_AUTH_TOKEN: "t",
  TWILIO_FROM: "+441234",
} as unknown as NodeJS.ProcessEnv;

const without = (k: string) => ({ ...full, [k]: undefined }) as NodeJS.ProcessEnv;
const missingOf = (env: NodeJS.ProcessEnv, opts = {}) => {
  try {
    assertProductionEnv(env, opts);
    return [];
  } catch (e) {
    if (e instanceof EnvError) return e.missing;
    throw e;
  }
};

describe("runtime mode", () => {
  it("detects production, preview and local, failing closed", () => {
    expect(runtimeMode({ VERCEL_ENV: "production" } as never)).toBe("production");
    expect(runtimeMode({ VERCEL_ENV: "preview", NODE_ENV: "production" } as never)).toBe("preview");
    expect(runtimeMode({ NODE_ENV: "development" } as never)).toBe("local");
    expect(runtimeMode({ NODE_ENV: "test" } as never)).toBe("local");
    // A production build with no site URL is treated as production (fail closed).
    expect(runtimeMode({ NODE_ENV: "production" } as never)).toBe("production");
    expect(runtimeMode({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://cwperformancelab.co.uk" } as never)).toBe("production");
    expect(runtimeMode({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://localhost:3018" } as never)).toBe("local");
  });
});

describe("assertProductionEnv", () => {
  it("accepts a complete production environment", () => {
    expect(missingOf(full)).toEqual([]);
  });

  it.each([
    "DATABASE_URL",
    "DATA_ENCRYPTION_KEY",
    "SESSION_SECRET",
    "CRON_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "NEXT_PUBLIC_SITE_URL",
    "TURNSTILE_SECRET_KEY",
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM",
  ])("refuses to start without %s", (k) => {
    expect(missingOf(without(k)).join(" ")).toContain(k);
  });

  it("doesn't require Twilio when SMS reminders are off", () => {
    expect(missingOf(without("TWILIO_AUTH_TOKEN"), { smsReminders: false })).toEqual([]);
  });

  it("rejects Stripe test keys and localhost URLs in production", () => {
    expect(missingOf({ ...full, STRIPE_SECRET_KEY: "sk_test_1" } as never).join()).toMatch(/test key/);
    expect(missingOf({ ...full, NEXT_PUBLIC_SITE_URL: "http://localhost:3000" } as never).join()).toMatch(/localhost/);
  });

  it("preview allows Stripe test keys and console email, but still needs a real database", () => {
    const preview = { ...full, VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_1", RESEND_API_KEY: undefined, CRON_SECRET: undefined } as never;
    expect(missingOf(preview)).toEqual([]);
    expect(missingOf({ ...(preview as object), DATABASE_URL: undefined } as never)).toContain("DATABASE_URL");
  });

  it("does nothing locally", () => {
    expect(missingOf({ NODE_ENV: "development" } as never)).toEqual([]);
  });

  it.each(["production", "preview"])("refuses to start in %s with AUTO_MIGRATE=true", (mode) => {
    const env = { ...full, VERCEL_ENV: mode };
    for (const v of ["true", "TRUE", "1", "yes"]) expect(missingOf({ ...env, AUTO_MIGRATE: v } as never).join()).toMatch(/AUTO_MIGRATE/);
    expect(missingOf({ ...env, AUTO_MIGRATE: "false" } as never)).toEqual([]);
    expect(() => shouldAutoMigrate({ ...env, AUTO_MIGRATE: "true" } as never)).toThrow(/AUTO_MIGRATE/);
    expect(shouldAutoMigrate(env as never)).toBe(false);
  });

  it("AUTO_MIGRATE=true is still fine locally", () => {
    expect(missingOf({ NODE_ENV: "development", AUTO_MIGRATE: "true" } as never)).toEqual([]);
    expect(shouldAutoMigrate({ NODE_ENV: "development", AUTO_MIGRATE: "true" } as never)).toBe(true);
  });
});

describe("no silent fallbacks in strict mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function inProduction() {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();
  }

  it("getPaymentProvider throws instead of returning the mock", async () => {
    await inProduction();
    const { getPaymentProvider, mockCheckoutEnabled } = await import("@/lib/payments/provider");
    await expect(getPaymentProvider()).rejects.toThrow(/mock payment provider/);
    expect(mockCheckoutEnabled()).toBe(false);
  });

  it("the mock checkout page is disabled in preview even without Stripe keys", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.resetModules();
    const { mockCheckoutEnabled } = await import("@/lib/payments/provider");
    expect(mockCheckoutEnabled()).toBe(false);
  });

  it("the embedded database refuses to start", async () => {
    await inProduction();
    const { getDb, resetDbForTests } = await import("@/db/client");
    resetDbForTests();
    await expect(getDb()).rejects.toThrow(/PGlite/);
    resetDbForTests();
  });

  it("email without a key throws rather than being silently dropped", async () => {
    await inProduction();
    const { sendEmail } = await import("@/lib/notifications/transport");
    await expect(sendEmail({ to: "a@b.c", subject: "s", text: "t", html: "h" })).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("bot protection fails closed without a Turnstile secret", async () => {
    await inProduction();
    const { verifyTurnstile } = await import("@/lib/rate-limit");
    expect(await verifyTurnstile("token")).toBe(false);
  });

  it("locally the same calls still work (mock + console)", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.resetModules();
    const { getPaymentProvider } = await import("@/lib/payments/provider");
    expect((await getPaymentProvider()).name).toBe("mock");
    const { verifyTurnstile } = await import("@/lib/rate-limit");
    expect(await verifyTurnstile(null)).toBe(true);
  });
});
