/** The go-live gate blocks only launch-critical placeholders; everything else is a warning (client decision 2026-11-01). */
import { describe, expect, it } from "vitest";
import { seedServices, seedSettings } from "@config/seed-settings";
import { isBlocking, scanFiles, type PlaceholderItem } from "@/lib/placeholders";

const item = (over: Partial<Omit<PlaceholderItem, "blocking">>): Omit<PlaceholderItem, "blocking"> => ({ id: "x", area: "Media", file: "f", what: "w", current: "", needed: "", ...over });

describe("which placeholders block a production build", () => {
  it("blocks on unconfirmed services, terms, payment, vouchers, retention and contact details", () => {
    expect(isBlocking(item({ area: "Services" }))).toBe(true);
    for (const key of ["cancellationPolicy", "paymentDefaults", "vouchers", "compliance"]) {
      expect(isBlocking(item({ area: "Settings", id: `setting:${key}`, what: key }))).toBe(true);
    }
    for (const key of ["name", "legalName", "phone", "email", "retentionYears"]) {
      expect(isBlocking(item({ area: "Business details", what: key }))).toBe(true);
    }
  });

  it("lets media, FAQs, socials, legal review, brand files and inline settings markers wait", () => {
    expect(isBlocking(item({ area: "Media" }))).toBe(false);
    expect(isBlocking(item({ area: "Content" }))).toBe(false);
    expect(isBlocking(item({ area: "Legal" }))).toBe(false);
    expect(isBlocking(item({ area: "Brand" }))).toBe(false);
    for (const key of ["instagram", "googleReviewUrl", "basratNumber", "icoRegistration", "siteUrl"]) {
      expect(isBlocking(item({ area: "Business details", what: key }))).toBe(false);
    }
    expect(isBlocking(item({ area: "Settings", id: "config/seed-settings.ts:53", what: "expiryMonths" }))).toBe(false);
    expect(isBlocking(item({ area: "Settings", id: "setting:notifications", what: "notifications" }))).toBe(false);
  });

  it("services, prices, contact details, cancellation and vouchers are confirmed in the current config", () => {
    const blocking = scanFiles({ settings: [...seedSettings] as never, services: seedServices }).filter((i) => i.blocking);
    expect(blocking.filter((i) => i.area === "Services")).toEqual([]);
    expect(blocking.map((i) => i.what)).not.toContain("cancellationPolicy");
    expect(blocking.map((i) => i.what)).not.toContain("vouchers");
    expect(blocking.map((i) => i.what)).not.toContain("email");
  });
});
