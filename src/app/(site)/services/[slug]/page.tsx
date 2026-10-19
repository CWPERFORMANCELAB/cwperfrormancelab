import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { business } from "@config/business";
import { seedServices } from "@config/seed-settings";
import { loadServiceContent } from "@content/services";
import { CtaBand, ServiceCard } from "@/components/site/blocks";
import { FaqList } from "@/components/site/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { MediaImage } from "@/components/site/media";
import { TrustRow } from "@/components/site/trust";
import { ArrowRight, Check, Clock } from "@/components/icons";
import { copy, serviceMetas, serviceSlot } from "@/lib/content";
import { getCatalog, getServiceBySlug } from "@/lib/data/public";
import { formatPence } from "@/lib/money";
import { siteUrl } from "@/lib/url";

export function generateStaticParams() {
  return seedServices.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/services/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const s = await getServiceBySlug(slug);
  const mod = s ? await loadServiceContent(s.id) : null;
  if (!s || !mod) return {};
  return {
    title: mod.meta.seoTitle,
    description: mod.meta.seoDescription,
    keywords: mod.meta.keywords,
    alternates: { canonical: `/services/${s.slug}` },
    openGraph: { title: `${mod.meta.seoTitle} | ${business.name}`, description: mod.meta.seoDescription, url: `/services/${s.slug}` },
  };
}

export default async function ServicePage({ params }: PageProps<"/services/[slug]">) {
  const { slug } = await params;
  const s = await getServiceBySlug(slug);
  const mod = s ? await loadServiceContent(s.id) : null;
  if (!s || !mod) notFound();
  const { meta, default: Body } = mod;
  const [{ services }, metas] = await Promise.all([getCatalog(), serviceMetas()]);
  const related = services.filter((x) => x.id !== s.id && x.category === s.category).slice(0, 3);
  const img = serviceSlot(s.id);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: s.name,
    serviceType: s.name,
    description: meta.summary,
    url: siteUrl(`/services/${s.slug}`),
    areaServed: { "@type": "City", name: "Manchester" },
    provider: { "@id": `${siteUrl()}/#business` },
    offers: { "@type": "Offer", price: (s.pricePence / 100).toFixed(2), priceCurrency: business.currency, url: siteUrl(`/book?service=${s.id}`) },
  };

  return (
    <>
      <section className="relative overflow-hidden pt-28 pb-14 sm:pt-36">
        <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10rem] size-[36rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="container-x relative grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <nav aria-label="Breadcrumb" className="text-sm text-bone/65">
              <Link href="/services" className="hover:text-bone">
                Services
              </Link>{" "}
              / <span className="text-bone/70">{s.shortName}</span>
            </nav>
            <h1 className="mt-5 font-display text-[clamp(2.25rem,6vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.03em]">{meta.headline}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-bone/70">{meta.tagline}</p>
            <div className="mt-7 flex items-center gap-5">
              <span className="font-display text-4xl font-semibold tabular-nums">{formatPence(s.pricePence)}</span>
              <span className="flex items-center gap-1.5 text-bone/60">
                <Clock className="size-4" /> {s.durationMin} minutes
              </span>
            </div>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link href={`/book?service=${s.id}`} className="btn-primary">
                Book {s.shortName} <ArrowRight className="size-4" />
              </Link>
              {s.availableAtHome && (
                <Link href={`/home-visits?service=${s.id}`} className="btn-ghost">
                  Request a home visit
                </Link>
              )}
            </div>
            <TrustRow className="mt-8" />
          </div>
          <div className="lg:col-span-5">
            <MediaImage slot={img} priority sizes="(min-width:1024px) 38vw, 92vw" className="aspect-[4/5]" rounded="rounded-[2rem]" />
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="prose-cw text-bone/80 lg:col-span-7">
            <Body />
          </div>
          <aside className="space-y-4 lg:col-span-5">
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">What you get</h2>
              <ul className="mt-4 space-y-2.5">
                {meta.outcomes.map((o) => (
                  <li key={o} className="flex gap-3 text-bone/80">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-light" /> {o}
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-white/[0.08] pt-4 text-sm text-bone/65">
                <span className="text-bone/80">Best for:</span> {meta.bestFor}
              </p>
            </div>
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">What to expect</h2>
              <ol className="mt-4 space-y-3">
                {meta.expect.map((e, i) => (
                  <li key={e} className="flex gap-3 text-bone/75">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary-light">{i + 1}</span>
                    {e}
                  </li>
                ))}
              </ol>
              {meta.followUp && <p className="mt-5 border-t border-white/[0.08] pt-4 text-sm text-bone/65">{meta.followUp}</p>}
            </div>
          </aside>
        </div>
      </section>

      <section className="pb-16">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <h2 className="font-display text-2xl font-semibold tracking-tight lg:col-span-4">{copy.faq.title}</h2>
          <div className="lg:col-span-8">
            <FaqList featuredOnly />
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="pb-8">
          <div className="container-x">
            <h2 className="font-display text-2xl font-semibold tracking-tight">You might also like</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <ServiceCard key={r.id} s={r} summary={metas[r.id]?.summary} />
              ))}
            </div>
          </div>
        </section>
      )}
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
      <JsonLd data={jsonLd} />
    </>
  );
}
