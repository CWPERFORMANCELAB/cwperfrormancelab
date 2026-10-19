import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/blocks";
import { HomeVisitForm } from "@/components/site/forms";
import { MediaImage } from "@/components/site/media";
import { copy, slot } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "Home Visits: Sports Massage & Rehab at Home in Manchester",
  description: "Mobile sport rehabilitation and sports massage at home across Manchester. Request a personalised quote online.",
  alternates: { canonical: "/home-visits" },
};

async function FormWithDefault({ searchParams }: { searchParams: PageProps<"/home-visits">["searchParams"] }) {
  const [{ services }, sp] = await Promise.all([getCatalog(), searchParams]);
  const homeServices = services.filter((s) => s.availableAtHome).map((s) => ({ id: s.id, name: s.name }));
  const def = typeof sp.service === "string" ? sp.service : undefined;
  return <HomeVisitForm services={homeServices} defaultService={def} success={copy.homeVisits.success} />;
}

export default function HomeVisitsPage({ searchParams }: PageProps<"/home-visits">) {
  const h = copy.homeVisits;
  return (
    <>
      <PageHero eyebrow="Home visits" title={h.title} lede={h.lede} />
      <section className="pb-24">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="text-lg leading-relaxed text-bone/75">{h.body}</p>
            <ol className="mt-8 space-y-4">
              {h.steps.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-on-primary">{i + 1}</span>
                  <span className="pt-1 text-bone/80">{s}</span>
                </li>
              ))}
            </ol>
            <MediaImage slot={slot("treatment")} sizes="(min-width:1024px) 36vw, 92vw" className="mt-10 aspect-[3/2]" />
          </div>
          <div className="surface-light rounded-card bg-bone p-6 text-ink sm:p-8 lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{h.formTitle}</h2>
            <div className="mt-6">
              <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-ink/5" />}>
                <FormWithDefault searchParams={searchParams} />
              </Suspense>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
