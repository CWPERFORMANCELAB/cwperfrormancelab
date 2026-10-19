/**
 * Security headers (PRE-DEPLOY-FIXES #10). Dependency-free so next.config.ts can import it.
 *
 * CSP without nonces (Next.js "Without Nonces" pattern): nonces would force every page to render dynamically and lose
 * static prerendering / PPR. `'unsafe-inline'` is therefore allowed for scripts and styles, but every *source* is
 * pinned to an allowlist: the app itself, Stripe, Cloudflare Turnstile, the Google Maps embed and (if enabled)
 * Plausible. Stripe Checkout and Apple/Google Pay run on checkout.stripe.com, so our CSP only needs to allow
 * navigating/posting there. If Sentry is configured, only the exact ingest host from its DSN is added to connect-src.
 */
export type HeaderPair = { key: string; value: string };

type CspOptions = { admin?: boolean; dev?: boolean; plausible?: boolean; sentryDsn?: string };

/** The origin events are posted to, e.g. https://o123.ingest.de.sentry.io (never a wildcard). */
export function sentryOrigin(dsn?: string): string {
  if (!dsn) return "";
  try {
    return ` ${new URL(dsn).origin}`;
  } catch {
    return "";
  }
}

export function contentSecurityPolicy(opts: CspOptions = {}): string {
  const plausible = opts.plausible ? " https://plausible.io" : "";
  const directives: Record<string, string> = {
    "default-src": "'self'",
    "script-src": `'self' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://challenges.cloudflare.com${plausible}`,
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data: blob: https://*.stripe.com",
    "font-src": "'self' data:",
    "connect-src": `'self' https://api.stripe.com https://challenges.cloudflare.com${plausible}${sentryOrigin(opts.sentryDsn)}${opts.dev ? " ws: wss:" : ""}`,
    "frame-src": "https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
    "worker-src": "'self' blob:",
    "form-action": "'self' https://checkout.stripe.com",
    "frame-ancestors": opts.admin ? "'none'" : "'self'",
    "base-uri": "'self'",
    "object-src": "'none'",
    "manifest-src": "'self'",
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  if (!opts.dev) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

export function securityHeaders(opts: CspOptions = {}): HeaderPair[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(opts) },
    // 2 years, all subdomains; browsers ignore HSTS on http://localhost, so it's safe to send everywhere.
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: opts.admin ? "DENY" : "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // payment=(self "https://checkout.stripe.com") keeps Apple Pay / Payment Request available to Stripe.
    { key: "Permissions-Policy", value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.stripe.com" "https://js.stripe.com")' },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}
