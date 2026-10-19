/** PRE-DEPLOY-FIXES #10: HSTS + CSP allowlist; admin can never be framed. */
import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
const header = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value ?? "";

describe("Content-Security-Policy", () => {
  const csp = contentSecurityPolicy();

  it("only allows the app, Stripe, Turnstile and the map embed", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "script-src")).toContain("https://js.stripe.com");
    expect(directive(csp, "script-src")).toContain("https://challenges.cloudflare.com");
    expect(directive(csp, "connect-src")).toContain("https://api.stripe.com");
    expect(directive(csp, "frame-src")).toContain("https://checkout.stripe.com");
    expect(directive(csp, "frame-src")).toContain("https://www.google.com");
    expect(directive(csp, "form-action")).toBe("form-action 'self' https://checkout.stripe.com");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(csp).not.toMatch(/\*(?!\.stripe\.com)/); // no wildcard sources except Stripe's image CDN
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("plausible.io");
  });

  it("adds Plausible only when enabled, and unsafe-eval only in dev", () => {
    expect(contentSecurityPolicy({ plausible: true })).toContain("https://plausible.io");
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });

  it("public pages can only be framed by the site itself; admin can't be framed at all", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive(contentSecurityPolicy({ admin: true }), "frame-ancestors")).toBe("frame-ancestors 'none'");
  });
});

describe("other headers", () => {
  it("sends a long-lived HSTS policy and DENY framing on admin", () => {
    const h = securityHeaders({ admin: true });
    expect(header(h, "Strict-Transport-Security")).toMatch(/max-age=63072000; includeSubDomains/);
    expect(header(h, "X-Frame-Options")).toBe("DENY");
    expect(header(securityHeaders(), "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(header(h, "Permissions-Policy")).toContain("payment=(self");
  });
});
