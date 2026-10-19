/** PRE-DEPLOY-FIXES #11: the production build serves /api/health, uncached and without client data. */
import { describe, expect, inject, it } from "vitest";

const base = inject("baseUrl");

describe("/api/health on the production build", () => {
  it("reports each check and is never cached", async () => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200); // local mode: mock payments are allowed, cron not required
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({ ok: true, checks: { database: { ok: true }, stripe: { ok: true, skipped: true }, cron: { ok: true } } });
    expect(JSON.stringify(body)).not.toMatch(/canary|@/i);
  });
});
