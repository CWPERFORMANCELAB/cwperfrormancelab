import { business, hasBasrat } from "@config/business";
import type { PublicService } from "@/lib/data/public";
import { siteUrl } from "@/lib/url";
import type { Settings } from "@/lib/settings-schema";

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * LocalBusiness structured data generated from config/business.ts + live settings.
 * Type: MedicalBusiness (DECISIONS.md #8) — the LocalBusiness subtype for health-service providers that doesn't
 * imply a protected title (Physiotherapy) or a multi-practitioner facility (MedicalClinic).
 */
export function businessJsonLd(services: PublicService[], hours: Settings["workingHours"]) {
  const a = business.address;
  const sameAs = Object.values(business.social).filter(Boolean);
  const opening = Object.entries(hours).flatMap(([d, ranges]) =>
    ranges.map((r) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${dayNames[Number(d)]}`, opens: r.open, closes: r.close })),
  );
  return {
    "@context": "https://schema.org",
    "@type": business.seo.schemaType,
    "@id": `${siteUrl()}/#business`,
    name: business.name,
    description: business.description,
    url: siteUrl(),
    image: siteUrl("/brand/og-image.png"),
    logo: siteUrl("/brand/logo.svg"),
    telephone: business.contact.phoneE164,
    email: business.contact.email,
    priceRange: business.seo.priceRange,
    currenciesAccepted: business.currency,
    paymentAccepted: "Credit Card, Debit Card, Apple Pay, Google Pay",
    address: {
      "@type": "PostalAddress",
      streetAddress: a.line1,
      addressLocality: a.city,
      addressRegion: "Greater Manchester",
      postalCode: a.postcode,
      addressCountry: a.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lng },
    areaServed: [{ "@type": "City", name: "Manchester" }, "Salford", "Cheetham Hill", "M8"],
    openingHoursSpecification: opening,
    ...(sameAs.length ? { sameAs } : {}),
    founder: {
      "@type": "Person",
      name: business.practitioner.name,
      jobTitle: business.practitioner.title,
      hasCredential: business.practitioner.qualifications.map((q) => ({ "@type": "EducationalOccupationalCredential", name: q })),
      ...(hasBasrat() ? { memberOf: { "@type": "Organization", name: "British Association of Sport Rehabilitators and Trainers (BASRaT)" } } : {}),
    },
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Services",
      itemListElement: services.map((s) => ({
        "@type": "Offer",
        url: siteUrl(`/services/${s.slug}`),
        price: (s.pricePence / 100).toFixed(2),
        priceCurrency: business.currency,
        itemOffered: { "@type": "Service", name: s.name, serviceType: s.name, areaServed: "Manchester" },
      })),
    },
    amenityFeature: [{ "@type": "LocationFeatureSpecification", name: "Free parking", value: true }],
  };
}

export function JsonLd({ data }: { data: unknown }) {
  // JSON.stringify output with < escaped is safe to inline.
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
