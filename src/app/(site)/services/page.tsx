import type { Metadata } from "next";
import { CtaBand, PageHero, ServiceCard } from "@/components/site/blocks";
import { TrustRow } from "@/components/site/trust";
import { copy, serviceMetas } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";

export const metadata: Metadata = {
  title: "Services: Sports Massage, Injury Assessment & Recovery in Manchester",
  description:
    "Sports injury assessment, sports massage, Full Body MOT, assisted stretching, dry cupping and compression boots recovery in Manchester (M8). Book online.",
  alternates: { canonical: "/services" },
};

export default async function ServicesPage() {
  const [{ services }, metas] = await Promise.all([getCatalog(), serviceMetas()]);
  const cats = Object.entries(copy.services.categories) as [keyof typeof copy.services.categories, { label: string; blurb: string }][];
  return (
    <>
      <PageHero eyebrow="Services" title={copy.services.title} lede={copy.services.lede}>
        <TrustRow />
      </PageHero>
      {cats.map(([id, c]) => {
        const items = services.filter((s) => s.category === id);
        if (!items.length) return null;
        return (
          <section key={id} className="pb-16" aria-labelledby={`cat-${id}`}>
            <div className="container-x">
              <h2 id={`cat-${id}`} className="font-display text-2xl font-semibold tracking-tight">
                {c.label}
              </h2>
              <p className="mt-1 text-bone/60">{c.blurb}</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s, i) => (
                  <ServiceCard key={s.id} s={s} summary={metas[s.id]?.summary} delay={i * 60} />
                ))}
              </div>
            </div>
          </section>
        );
      })}
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
    </>
  );
}
