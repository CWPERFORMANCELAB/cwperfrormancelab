/**
 * SINGLE SOURCE OF TRUTH for client-specific business facts.
 * Nothing in src/ may hardcode any of these values.
 *
 * Placeholders are marked with `// PLACEHOLDER:` and listed in CLIENT_TODO.md.
 * `npm run check:placeholders` scans this file for that marker.
 */

export const business = {
  // Name, legal name and contact details confirmed by the client (2026-11-01).
  name: "CW Performance Lab",
  legalName: "CW Performance Lab",
  tagline: "Move better. Perform better. Return stronger.",
  description:
    "Sports rehabilitation, injury treatment, recovery and performance training in Manchester with Sport Rehabilitator Christopher Williams. Based at Made Running Hub, M8.",

  practitioner: {
    id: "christoph-williams", // stable ID, matches practitioners table
    name: "Christopher Williams",
    firstName: "Christopher",
    /** Protected-title safe. Never "physio" / "physiotherapist". */
    title: "Sport Rehabilitator",
    qualifications: ["BSc (Hons) Sport Rehabilitation, University of Salford"],
    /** Hidden everywhere while empty. */
    basratNumber: "", // PLACEHOLDER: BASRaT membership number
    pronouns: "he/him",
  },

  address: {
    venue: "Made Running Hub",
    line1: "34 Knowsley Street",
    locality: "Cheetham Hill",
    city: "Manchester",
    postcode: "M8 8HQ",
    country: "GB",
    lat: 53.4967,
    lng: -2.2395,
    parkingNote: "Free parking right outside the clinic.",
    directions:
      "Made Running Hub is on Knowsley Street, a few minutes from Manchester city centre and Cheetham Hill Road. Free parking is available directly outside.",
  },

  contact: {
    phone: "07476 243133",
    phoneE164: "+447476243133",
    email: "christophwilliams14@gmail.com",
    whatsapp: "https://wa.me/447476243133",
  },

  social: {
    instagram: "", // PLACEHOLDER: Instagram profile URL
    tiktok: "", // PLACEHOLDER: TikTok profile URL (optional)
    facebook: "", // PLACEHOLDER: Facebook page URL (optional)
  },

  googleReviewUrl: "", // PLACEHOLDER: Google Business Profile "write a review" link

  timezone: "Europe/London",
  currency: "GBP",
  locale: "en-GB",

  seo: {
    siteUrl: "https://cwperformancelab.co.uk", // PLACEHOLDER: live domain
    defaultTitle: "CW Performance Lab | Sport Rehabilitation, Massage & Recovery in Manchester",
    titleTemplate: "%s | CW Performance Lab",
    keywords: [
      "sports massage Manchester",
      "sports injury clinic Manchester",
      "sport rehabilitator Manchester",
      "compression boots recovery Manchester",
      "injury assessment Manchester M8",
      "dry cupping Manchester",
    ],
    /** schema.org LocalBusiness subtype — see DECISIONS.md #8 */
    schemaType: "MedicalBusiness",
    priceRange: "££",
  },

  legal: {
    /** Data retention for clinical/intake records, in years. */
    retentionYears: 8, // confirmed 2026-11-01 (under-18s: until age 25, see compliance setting)
    icoRegistration: "", // PLACEHOLDER: ICO registration number (likely required — see CLIENT_TODO.md)
  },
} as const;

export type Business = typeof business;

/** Full postal address on one line. */
export function fullAddress() {
  const a = business.address;
  return `${a.venue}, ${a.line1}, ${a.city} ${a.postcode}`;
}

export function hasBasrat() {
  return business.practitioner.basratNumber.trim().length > 0;
}
