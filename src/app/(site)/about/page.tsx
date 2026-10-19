import type { Metadata } from "next";
import { business, hasBasrat } from "@config/business";
import About from "@content/about.mdx";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { MediaImage } from "@/components/site/media";
import { TrustRow } from "@/components/site/trust";
import { copy, slot } from "@/lib/content";

export const metadata: Metadata = {
  title: `About ${business.practitioner.name}, Sport Rehabilitator in Manchester`,
  description: `Meet ${business.practitioner.name}, a Sport Rehabilitator (${business.practitioner.qualifications[0]}) based at Made Running Hub, Manchester. Evidence-based rehab, performance training and education.`,
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow={copy.about.eyebrow} title={copy.about.title} />
      <section className="pb-16">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="space-y-4 lg:sticky lg:top-28">
              <MediaImage slot={slot("headshot")} priority sizes="(min-width:1024px) 38vw, 92vw" className="aspect-[4/5]" rounded="rounded-[2rem]" />
              <dl className="card grid gap-4 p-6 text-sm">
                <div>
                  <dt className="eyebrow text-bone/65">Title</dt>
                  <dd className="mt-1 text-bone/85">{business.practitioner.title}</dd>
                </div>
                <div>
                  <dt className="eyebrow text-bone/65">Qualifications</dt>
                  {business.practitioner.qualifications.map((q) => (
                    <dd key={q} className="mt-1 text-bone/85">
                      {q}
                    </dd>
                  ))}
                </div>
                {hasBasrat() && (
                  <div>
                    <dt className="eyebrow text-bone/65">Registration</dt>
                    <dd className="mt-1 text-bone/85">BASRaT {business.practitioner.basratNumber}</dd>
                  </div>
                )}
                <div>
                  <dt className="eyebrow text-bone/65">Based at</dt>
                  <dd className="mt-1 text-bone/85">
                    {business.address.venue}, {business.address.city}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="lg:col-span-7">
            <div className="prose-cw text-bone/80">
              <About />
            </div>
            <TrustRow className="mt-10" />
          </div>
        </div>
      </section>
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
    </>
  );
}
