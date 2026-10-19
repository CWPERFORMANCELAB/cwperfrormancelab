import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { business } from "@config/business";
import { getDb } from "@/db/client";
import { formatPence } from "@/lib/money";
import { formatLocal } from "@/lib/time";
import { findVoucher } from "@/lib/vouchers";
import { PrintButton } from "./print-button";

export const metadata = { title: "Your gift voucher", robots: { index: false, follow: false } };

/** Designed, printable e-voucher. The code is the bearer credential, so the page shows nothing else personal. */
async function Voucher({ params }: { params: PageProps<"/gift-vouchers/[code]">["params"] }) {
  await connection();
  const { code } = await params;
  const db = await getDb();
  const v = await findVoucher(db, decodeURIComponent(code));
  if (!v || v.status === "pending" || v.status === "void") notFound();
  return (
    <div className="mx-auto max-w-2xl">
      <div className="relative overflow-hidden rounded-[2rem] bg-ink p-8 text-bone shadow-2xl ring-1 ring-white/10 sm:p-12 print:shadow-none">
        <div aria-hidden className="absolute -top-24 -right-24 size-80 rounded-full bg-primary/40 blur-3xl" />
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.svg" alt={business.name} className="h-14 w-auto" />
          <p className="eyebrow mt-10 text-primary-light">Gift voucher</p>
          <p className="mt-3 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
            {v.minutes ? `${v.minutes} minute massage` : formatPence(v.initialPence)}
          </p>
          {v.recipientName && <p className="mt-3 text-lg text-bone/75">For {v.recipientName}</p>}
          {v.message && <p className="mt-6 max-w-md text-lg italic leading-relaxed text-bone/85">&ldquo;{v.message}&rdquo;</p>}
          <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t border-white/15 pt-6">
            <div>
              <p className="text-xs uppercase tracking-widest text-bone/65">Code</p>
              <p className="font-mono text-2xl tracking-[0.15em]">{v.code}</p>
            </div>
            <div className="text-right text-sm text-bone/65">
              <p>Balance {formatPence(v.balancePence)}</p>
              <p>Valid until {formatLocal(v.expiresAt, "d MMMM yyyy")}</p>
            </div>
          </div>
          <p className="mt-6 text-sm text-bone/65">
            Book online at {new URL(business.seo.siteUrl).hostname}/book and enter the code at checkout · {business.address.venue}, {business.address.postcode}
          </p>
        </div>
      </div>
      <div className="mt-6 flex justify-center print:hidden">
        <PrintButton />
      </div>
    </div>
  );
}

export default function VoucherPage({ params }: PageProps<"/gift-vouchers/[code]">) {
  return (
    <section className="pt-28 pb-24 sm:pt-36">
      <div className="container-x">
        <Suspense fallback={<div className="mx-auto h-96 max-w-2xl animate-pulse rounded-[2rem] bg-white/5" />}>
          <Voucher params={params} />
        </Suspense>
      </div>
    </section>
  );
}
