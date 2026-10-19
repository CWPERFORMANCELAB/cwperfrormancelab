import { business, fullAddress } from "@config/business";

const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escIcs = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** RFC 5545 calendar invite. UTC times, so it is correct in every calendar app across BST/GMT. */
export function buildIcs(e: { uid: string; start: Date; end: Date; summary: string; description: string; url?: string; sequence?: number; cancel?: boolean }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${business.name}//Bookings//EN`,
    "CALSCALE:GREGORIAN",
    `METHOD:${e.cancel ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${e.uid}@${new URL(business.seo.siteUrl).hostname}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(e.start)}`,
    `DTEND:${fmt(e.end)}`,
    `SEQUENCE:${e.sequence ?? 0}`,
    `SUMMARY:${escIcs(e.summary)}`,
    `DESCRIPTION:${escIcs(e.description)}`,
    `LOCATION:${escIcs(fullAddress())}`,
    `GEO:${business.address.lat};${business.address.lng}`,
    ...(e.url ? [`URL:${e.url}`] : []),
    `STATUS:${e.cancel ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escIcs(e.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // Fold lines > 75 octets per spec.
  return lines.map((l) => (l.length > 75 ? l.match(/.{1,74}/g)!.join("\r\n ") : l)).join("\r\n") + "\r\n";
}
