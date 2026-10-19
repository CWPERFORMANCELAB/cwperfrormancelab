import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingFlowClient as BookingFlow } from "@/components/booking/flow-client";
import { TrustRow } from "@/components/site/trust";
import { copy } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";
import { policySummary } from "@/lib/policy";

export const metadata: Metadata = {
  title: "Book a Session",
  description: "Book sports massage, injury assessment, recovery and rehab sessions online in Manchester. Choose a time and pay securely in under a minute.",
  alternates: { canonical: "/book" },
};

async function Flow({ searchParams }: { searchParams: PageProps<"/book">["searchParams"] }) {
  const [{ services, policy, features }, sp] = await Promise.all([getCatalog(), searchParams]);
  const initial = typeof sp.service === "string" && services.some((s) => s.id === sp.service) ? sp.service : undefined;
  return (
    <BookingFlow
      services={services.map((s) => ({
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        slug: s.slug,
        category: s.category,
        price: formatPence(s.pricePence),
        durationMin: s.durationMin,
        requiredConsents: s.requiredConsents,
        featured: s.featured,
      }))}
      categories={copy.services.categories}
      initialServiceId={initial}
      showPicker={sp.picker === "1"}
      picker={copy.picker as never}
      policy={policySummary(policy)}
      steps={copy.book.steps}
      redFlagNotice={copy.book.redFlagNotice}
      holdNotice={copy.book.holdNotice}
      features={{ insuranceBookings: features.insuranceBookings, packages: features.packages }}
    />
  );
}

export default function BookPage({ searchParams }: PageProps<"/book">) {
  return (
    <section className="pt-24 pb-24 sm:pt-32">
      <div className="container-x max-w-5xl">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">{copy.book.title}</h1>
        <Suspense fallback={null}>
          <TrustRow className="mt-4" />
        </Suspense>
        <div className="mt-8">
          <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-white/5" />}>
            <Flow searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </section>
  );
}
