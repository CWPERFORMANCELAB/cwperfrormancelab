/**
 * Strip personal and health data from error reports before they leave the server or browser (PRE-DEPLOY-FIXES #11).
 * Dependency-free so it can be unit-tested and shared by the server and client Sentry configs.
 *
 * - Request bodies, cookies, query strings and all headers except a few harmless ones are dropped. Bodies are where
 *   intake forms and clinical notes would appear.
 * - `user` is reduced to its id (an opaque UUID, never an email or IP address).
 * - Local variables captured on stack frames are dropped.
 * - Every remaining string has email addresses and phone numbers replaced.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// UK and international numbers: +44 7700 900123, 07700 900123, (020) 7946 0958, +1-202-555-0143 …
// The lookbehind skips digits inside ids (UUID segments, Stripe ids) so they stay readable.
const PHONE = /(?<![\w-])(?:\+\d{1,3}[\s.-]?)?(?:\(0?\d{2,5}\)|0?\d{2,5})[\s.-]?\d{3,4}[\s.-]?\d{3,4}\b/g;
const SAFE_HEADERS = new Set(["user-agent", "accept", "accept-language", "content-type", "host"]);
// Identifier fields: not personal, and redacting them would break Sentry's grouping and tracing.
const SKIP_KEYS = new Set(["event_id", "trace_id", "span_id", "parent_span_id", "timestamp", "start_timestamp", "release", "dist", "sdk", "debug_meta"]);

export function scrubString(s: string): string {
  return s.replace(EMAIL, "[email]").replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[phone]" : m));
}

function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[truncated]";
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "vars") continue; // stack-frame local variables
      out[k] = SKIP_KEYS.has(k) ? v : scrubDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

type ScrubbableEvent = {
  request?: { data?: unknown; cookies?: unknown; query_string?: unknown; headers?: Record<string, string>; url?: string; env?: unknown };
  user?: { id?: string | number; [k: string]: unknown };
};

export function scrubEvent<T extends object>(event: T): T {
  const e: ScrubbableEvent = { ...event };
  if (e.request) {
    const { headers, url } = e.request;
    e.request = {
      url: url ? url.split("?")[0] : undefined,
      headers: headers ? Object.fromEntries(Object.entries(headers).filter(([k]) => SAFE_HEADERS.has(k.toLowerCase()))) : undefined,
    };
  }
  if (e.user) e.user = e.user.id !== undefined ? { id: e.user.id } : undefined;
  return scrubDeep(e) as T;
}
