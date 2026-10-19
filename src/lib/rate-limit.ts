import { sql } from "drizzle-orm";
import { isStrict } from "@/lib/env";
import type { DbOrTx } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window rate limiter stored in Postgres (works across serverless instances without Redis).
 * Keys are hashed-ish identifiers like `book:<ip>` — never emails or names.
 */
export async function checkRateLimit(db: DbOrTx, key: string, opts: { limit: number; windowSec: number }) {
  const windowMs = opts.windowSec * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({ target: [rateLimits.key, rateLimits.windowStart], set: { count: sql`${rateLimits.count} + 1` } })
    .returning({ count: rateLimits.count });
  // Opportunistic cleanup of old windows.
  if (Math.random() < 0.02) await db.execute(sql`delete from rate_limits where window_start < now() - interval '1 day'`);
  return { ok: row.count <= opts.limit, remaining: Math.max(0, opts.limit - row.count) };
}

/** Cloudflare Turnstile verification. Passes when not configured only in local dev; fails closed elsewhere. */
export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return !isStrict();
  if (!token) return false;
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
  });
  const json = (await res.json()) as { success?: boolean };
  return Boolean(json.success);
}
