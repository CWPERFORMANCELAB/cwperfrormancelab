import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHero } from "@/components/site/blocks";
import { VoucherForm } from "@/components/site/forms";
import { TrustRow } from "@/components/site/trust";
import { Gift } from "@/components/icons";
import { copy, fill } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";

export const metadata: Metadata = {
  title: "Massage Gift Vouchers in Manchester",
  description: "Buy a sports or relaxing massage e-gift voucher online, emailed instantly with a unique code. The perfect gift for runners and athletes.",
  alternates: { canonical: "/gift-vouchers" },
};

async function Form({ searchParams }: { searchParams: PageProps<"/gift-vouchers">["searchParams"] }) {
  const [{ vouchers }, sp] = await Promise.all([getCatalog(), searchParams]);
  const products = vouchers.products.filter((p) => p.active).map((p) => ({ id: p.id, label: `${p.minutes} min · ${formatPence(p.pricePence)}` }));
  return <VoucherForm products={products} defaultProduct={typeof sp.product === "string" ? sp.product : undefined} />;
}

export default async function VouchersPage({ searchParams }: PageProps<"/gift-vouchers">) {
  const { vouchers } = await getCatalog();
  const v = copy.vouchers;
  return (
    <>
      <PageHero eyebrow="Gift vouchers" title={v.title} lede={v.lede} />
      <section className="pb-24">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {vouchers.products
                .filter((p) => p.active)
                .map((p, i) => (
                  <div key={p.id} className={`rounded-xl p-6 ${i === 1 ? "bg-primary text-on-primary" : "card"}`}>
                    <Gift className="size-6 opacity-80" />
                    <p className="mt-4 font-display text-4xl font-semibold">{p.minutes} min</p>
                    <p className="text-sm opacity-75">Massage e-voucher</p>
                    <p className="mt-4 font-display text-2xl font-semibold tabular-nums">{formatPence(p.pricePence)}</p>
                  </div>
                ))}
            </div>
            <ol className="mt-8 space-y-3 text-bone/75">
              {v.how.map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="font-display text-primary-light">0{i + 1}</span> {s}
                </li>
              ))}
            </ol>
            <p className="mt-6 text-sm text-bone/65">{fill(v.terms, { expiryMonths: vouchers.expiryMonths })}</p>
          </div>
          <div className="surface-light rounded-card bg-bone p-6 text-ink sm:p-8 lg:col-span-7">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Buy a gift voucher</h2>
            <div className="mt-6">
              <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-ink/5" />}>
                <Form searchParams={searchParams} />
              </Suspense>
            </div>
            <TrustRow tone="light" className="mt-6" />
          </div>
        </div>
      </section>
    </>
  );
}
