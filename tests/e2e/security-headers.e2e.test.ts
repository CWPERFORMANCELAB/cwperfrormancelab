/** PRE-DEPLOY-FIXES #10: the production server actually sends the headers (route ordering in next.config.ts). */
import { describe, expect, inject, it } from "vitest";

const base = inject("baseUrl");
const get = (p: string) => fetch(`${base}${p}`, { redirect: "manual" });

describe("security headers on the production build", () => {
  it("public pages: CSP with frame-ancestors 'self' and HSTS", async () => {
    const res = await get("/");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("https://checkout.stripe.com");
    expect(res.headers.get("strict-transport-security")).toContain("max-age=63072000");
  });

  it.each(["/admin/login", "/admin", "/api/admin/clients.csv"])("admin route %s: frame-ancestors 'none' and X-Frame-Options DENY", async (p) => {
    const res = await get(p);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
