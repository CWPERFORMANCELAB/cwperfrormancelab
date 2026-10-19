/**
 * `/api/health` (PRE-DEPLOY-FIXES #11): is the database answering, is Stripe reachable with our key, and has the
 * scheduler succeeded recently? Point an uptime monitor at it; any failure returns 503. The response holds only
 * check names, booleans and timings, never client data or error details.
 */
import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cronHealth } from "@/lib/cron";
import { isStrict } from "@/lib/env";
import type { PaymentProvider } from "@/lib/payments/provider";

type Check = { ok: boolean; skipped?: true; ms?: number; [k: string]: unknown };
export type HealthReport = { ok: boolean; checks: { database: Check; stripe: Check; cron: Check } };

async function timed(fn: () => Promise<Record<string, unknown> | void>): Promise<Check> {
  const start = Date.now();
  try {
    const extra = (await fn()) ?? {};
    return { ok: true, ms: Date.now() - start, ...extra };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

// The endpoint is public, so a Stripe result is reused for a minute: hammering /api/health can't use up our Stripe
// API rate limit (which checkout shares).
const STRIPE_CACHE_MS = 60_000;
let stripeCache: { at: number; check: Check } | null = null;
export function resetHealthCache() {
  stripeCache = null;
}

export async function checkHealth(opts: { getDb: () => Promise<Db>; getProvider: () => Promise<PaymentProvider>; now?: Date; strict?: boolean }): Promise<HealthReport> {
  const strict = opts.strict ?? isStrict();
  const now = opts.now ?? new Date();
  const db = await opts.getDb().catch(() => null);
  const database: Check = db ? await timed(async () => void (await db.execute(sql`select 1`))) : { ok: false };

  const stripe = await (async (): Promise<Check> => {
    const provider = await opts.getProvider().catch(() => null);
    // Locally the mock provider is fine; in production/preview getPaymentProvider() refuses to return it.
    if (!provider) return { ok: false };
    if (provider.name !== "stripe" || !provider.ping) return strict ? { ok: false } : { ok: true, skipped: true };
    if (stripeCache && Date.now() - stripeCache.at < STRIPE_CACHE_MS) return { ...stripeCache.check, cached: true };
    const check = await timed(() => provider.ping!());
    stripeCache = { at: Date.now(), check };
    return check;
  })();

  const cron: Check = db
    ? await (async () => {
        try {
          const h = await cronHealth(db, now, strict);
          return { ok: !h.stale, lastSuccessAt: h.lastSuccessAt?.toISOString() ?? null, ageMinutes: h.ageMinutes };
        } catch {
          return { ok: false };
        }
      })()
    : { ok: false };

  return { ok: database.ok && stripe.ok && cron.ok, checks: { database, stripe, cron } };
}
