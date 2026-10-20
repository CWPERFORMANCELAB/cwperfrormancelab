/**
 * Cached reads for the public site (Cache Components). Tagged "catalog"; admin edits call updateTag("catalog")
 * so changes appear immediately. Only non-personal data is ever cached here.
 */
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db/client";
import { listServices, loadSettings } from "@/lib/settings";
import type { Service } from "@/db/schema";

export type PublicService = Pick<
  Service,
  "id" | "name" | "shortName" | "slug" | "category" | "pricePence" | "durationMin" | "featured" | "availableAtHome" | "requiredConsents" | "sortOrder"
>;

export async function getCatalog() {
  "use cache";
  cacheTag("catalog");
  cacheLife("hours");
  const db = await getDb();
  const [services, settings] = await Promise.all([listServices(db), loadSettings(db)]);
  return {
    services: services.map(
      (s): PublicService => ({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        slug: s.slug,
        category: s.category,
        pricePence: s.pricePence,
        durationMin: s.durationMin,
        featured: s.featured,
        availableAtHome: s.availableAtHome,
        requiredConsents: s.requiredConsents,
        sortOrder: s.sortOrder,
      }),
    ),
    policy: settings.cancellationPolicy,
    vouchers: settings.vouchers,
    features: settings.features,
    bookingRules: { minNoticeHours: settings.bookingRules.minNoticeHours, holdMinutes: settings.bookingRules.holdMinutes },
    paymentModel: settings.paymentDefaults.model,
    retentionYears: settings.compliance.dataRetentionYears,
  };
}

export type Catalog = Awaited<ReturnType<typeof getCatalog>>;

export async function getServiceBySlug(slug: string) {
  const c = await getCatalog();
  return c.services.find((s) => s.slug === slug) ?? null;
}

export function fromPrice(services: PublicService[]) {
  return Math.min(...services.map((s) => s.pricePence));
}
