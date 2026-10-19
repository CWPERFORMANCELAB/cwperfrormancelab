import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { PolicyText } from "@/components/site/policy-text";
import { TrustRow } from "@/components/site/trust";
import { ArrowRight } from "@/components/icons";
import { copy } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";

export const metadata: Metadata = {
  title: "Prices: Sports Massage & Injury Treatment in Manchester",
  description: "Transparent prices for sports massage, injury assessment, Full Body MOT, assisted stretching, dry cupping and compression boots in Manchester. Pay securely online.",
  alternates: { canonical: "/pricing" },
};

export default async function PricingPage() {
  const { services, vouchers } = await getCatalog();
  const cats = Object.entries(copy.services.categories) as [keyof typeof copy.services.categories, { label: string }][];
  return (
    <>
      <PageHero eyebrow="Pricing" title={copy.pricing.title} lede={copy.pricing.lede}>
        <TrustRow />
      </PageHero>
      <section className="pb-12">
        <div className="container-x grid gap-8 lg:grid-cols-12">
          <div className="space-y-8 lg:col-span-8">
            {cats.map(([id, c]) => {
              const items = services.filter((s) => s.category === id);
              if (!items.length) return null;
              return (
                <div key={id}>
                  <h2 className="eyebrow text-primary-light">{c.label}</h2>
                  <ul className="mt-3 divide-y divide-white/[0.08] overflow-hidden rounded-xl border border-white/[0.08] bg-coal">
                    {items.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                        <div className="min-w-0 flex-1">
                          <Link href={`/services/${s.slug}`} className="font-medium hover:text-primary-light">
                            {s.name}
                          </Link>
                          <p className="text-sm text-bone/65">{s.durationMin} minutes</p>
                        </div>
                        <span className="font-display text-xl font-semibold tabular-nums">{formatPence(s.pricePence)}</span>
                        <Link href={`/book?service=${s.id}`} className="btn-primary btn-sm">
                          Book
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <div>
              <h2 className="eyebrow text-primary-light">Gift vouchers</h2>
              <ul className="mt-3 divide-y divide-white/[0.08] overflow-hidden rounded-xl border border-white/[0.08] bg-coal">
                {vouchers.products
                  .filter((p) => p.active)
                  .map((p) => (
                    <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                      <span className="flex-1 font-medium">{p.name}</span>
                      <span className="font-display text-xl font-semibold tabular-nums">{formatPence(p.pricePence)}</span>
                      <Link href={`/gift-vouchers?product=${p.id}`} className="btn-ghost btn-sm">
                        Buy
                      </Link>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
          <aside className="space-y-4 lg:col-span-4">
            <div className="card p-6">
              <h2 className="font-display text-lg font-semibold">Cancellation policy</h2>
              <p className="mt-3 text-sm leading-relaxed text-bone/70">
                <PolicyText />
              </p>
              <Link href="/terms" className="mt-3 inline-flex items-center gap-1 text-sm text-primary-light">
                Full terms <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="card p-6 text-sm leading-relaxed text-bone/70">
              <p>{copy.pricing.homeVisitNote}</p>
              <Link href="/home-visits" className="mt-3 inline-flex items-center gap-1 text-primary-light">
                Request a quote <ArrowRight className="size-3.5" />
              </Link>
              <p className="mt-4 border-t border-white/[0.08] pt-4">{copy.pricing.vouchersNote}</p>
            </div>
          </aside>
        </div>
      </section>
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
    </>
  );
}
