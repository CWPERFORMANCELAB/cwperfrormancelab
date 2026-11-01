import type { MetadataRoute } from "next";
import { seedServices } from "@config/seed-settings";
import { siteUrl } from "@/lib/url";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = ["", "/services", "/pricing", "/about", "/book", "/home-visits", "/gift-vouchers", "/faq", "/contact", "/privacy", "/terms", "/cookies"];
  return [
    ...pages.map((p) => ({ url: siteUrl(p), changeFrequency: "weekly" as const, priority: p === "" ? 1 : p === "/book" || p === "/services" ? 0.9 : 0.6 })),
    ...seedServices.filter((s) => s.active).map((s) => ({ url: siteUrl(`/services/${s.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
  ];
}
