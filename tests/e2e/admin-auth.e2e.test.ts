/**
 * PRE-DEPLOY-FIXES #2: every admin route must refuse a forged session, including RSC and prefetch requests,
 * without streaming any client data first.
 */
import { describe, expect, inject, it } from "vitest";
import { CANARY } from "./setup";

const base = inject("baseUrl");
const ids = inject("ids");
const forged = "cw_admin=anything";

const routes = [
  "/admin",
  "/admin?period=month",
  "/admin/bookings",
  "/admin/bookings?view=week",
  "/admin/bookings?view=day",
  `/admin/bookings/${ids.bookingId}`,
  "/admin/bookings/new",
  "/admin/bookings/time-off",
  "/admin/clients",
  `/admin/clients/${ids.clientId}`,
  "/admin/enquiries",
  `/admin/enquiries/${ids.enquiryId}`,
  "/admin/payments",
  "/admin/vouchers",
  "/admin/insights",
  "/admin/settings",
  "/admin/settings/services",
  "/admin/settings/templates",
  "/admin/settings/discounts",
  "/admin/settings/calendar",
  "/admin/settings/packages",
  "/admin/settings/account",
  "/admin/settings/placeholders",
  "/admin/settings/audit",
  "/api/admin/clients.csv",
  `/api/admin/clients/${ids.clientId}/export`,
];

const variants: Record<string, Record<string, string>> = {
  html: {},
  rsc: { RSC: "1" },
  prefetch: { RSC: "1", "Next-Router-Prefetch": "1" },
};

// Anything that would identify the canary client or their money.
const secrets = [CANARY.firstName, CANARY.lastName, CANARY.email, CANARY.phone, CANARY.enquiryName, "enquiry-canary@example.com", "07700 900888", "123.45"];

async function fetchBody(path: string, cookie: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, { headers: { cookie, ...headers }, redirect: "manual" });
  return { status: res.status, body: await res.text() };
}

describe("control: the probe can see canary data with a real session", () => {
  it("valid session sees the canary client, enquiry and payment", async () => {
    const cookie = inject("validCookie");
    expect((await fetchBody("/admin/clients", cookie)).body).toContain(CANARY.email);
    expect((await fetchBody(`/admin/enquiries/${ids.enquiryId}`, cookie)).body).toContain(CANARY.enquiryName);
    expect((await fetchBody("/admin/payments", cookie)).body).toContain("123.45");
  });
});

describe("forged cw_admin cookie never reveals client data", () => {
  for (const route of routes) {
    for (const [name, headers] of Object.entries(variants)) {
      it(`${name} ${route}`, async () => {
        const { status, body } = await fetchBody(route, forged, headers);
        for (const s of secrets) expect(body, `${route} (${name}) leaked "${s}" with status ${status}`).not.toContain(s);
      });
    }
  }

  it("no cookie at all is redirected to login by the proxy", async () => {
    const res = await fetch(`${base}/admin/clients`, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin/login");
  });
});
