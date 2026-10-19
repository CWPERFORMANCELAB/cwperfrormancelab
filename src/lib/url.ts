import { business } from "@config/business";

/** Absolute base URL for links in emails, Stripe redirects, .ics files and the sitemap. */
export function siteUrl(path = ""): string {
  const base = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NODE_ENV === "production" ? business.seo.siteUrl : `http://localhost:${process.env.PORT || 3000}`)
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") || !path ? path : `/${path}`}`;
}

export function mapsUrl(): string {
  const a = business.address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${a.venue}, ${a.line1}, ${a.city} ${a.postcode}`)}`;
}
