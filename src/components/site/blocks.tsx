import Link from "next/link";
import type { ReactNode } from "react";
import { copy } from "@/lib/content";
import type { PublicService } from "@/lib/data/public";
import { formatPence } from "@/lib/money";
import { ArrowRight, Clock } from "@/components/icons";

export function PageHero({ eyebrow, title, lede, children }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden pt-28 pb-12 sm:pt-36 sm:pb-16">
      <div aria-hidden className="pointer-events-none absolute -top-40 right-[-10rem] size-[36rem] rounded-full bg-primary/20 blur-3xl" />
      <div className="container-x relative">
        {eyebrow && <p className="eyebrow text-primary-light">{eyebrow}</p>}
        <h1 className="mt-4 max-w-3xl font-display text-[clamp(2.25rem,6vw,4rem)] font-semibold leading-[1.02] tracking-[-0.03em]">
          {title}
        </h1>
        {lede && (
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-bone/70">
            {lede}
          </p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

export function SectionHeading({ eyebrow, title, lede, tone = "dark" }: { eyebrow?: string; title: ReactNode; lede?: ReactNode; tone?: "dark" | "light" }) {
  return (
    <div className="max-w-2xl" data-reveal>
      {eyebrow && <p className={`eyebrow ${tone === "dark" ? "text-primary-light" : "text-primary-strong"}`}>{eyebrow}</p>}
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-[2.6rem] sm:leading-[1.08]">{title}</h2>
      {lede && <p className={`mt-4 text-lg ${tone === "dark" ? "text-bone/65" : "text-ink/65"}`}>{lede}</p>}
    </div>
  );
}

export function ServiceCard({ s, summary, delay = 0 }: { s: PublicService; summary?: string; delay?: number }) {
  return (
    <article
      className={`group relative flex flex-col rounded-card border p-6 transition duration-300 hover:-translate-y-0.5 sm:p-7 ${
        s.featured ? "border-primary/40 bg-graphite" : "border-white/[0.08] bg-coal hover:border-white/20"
      }`}
      data-reveal
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-bone/65">{copy.services.categories[s.category].label}</span>
        {s.featured && <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-on-primary">Popular</span>}
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold tracking-tight sm:text-2xl">
        <Link href={`/services/${s.slug}`} className="after:absolute after:inset-0 after:content-['']">
          {s.shortName}
        </Link>
      </h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="font-display text-3xl font-semibold tabular-nums">{formatPence(s.pricePence)}</span>
        <span className="flex items-center gap-1.5 text-sm text-bone/65">
          <Clock className="size-4" /> {s.durationMin} min
        </span>
      </div>
      {summary && <p className="mt-4 text-[15px] leading-relaxed text-bone/65">{summary}</p>}
      <div className="relative z-10 mt-auto flex gap-2 pt-6">
        <Link href={`/book?service=${s.id}`} className={`${s.featured ? "btn-primary" : "btn-ghost"} flex-1`}>
          Book <ArrowRight className="size-4" />
        </Link>
        <Link href={`/services/${s.slug}`} className="btn-ghost px-4" aria-label={`More about ${s.shortName}`}>
          Details
        </Link>
      </div>
    </article>
  );
}

export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="py-20 sm:py-28">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-14 text-center text-on-primary sm:px-16 sm:py-20" data-reveal>
          <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-white/40 blur-3xl" />
          <h2 className="relative mx-auto max-w-2xl font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">{title}</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg text-on-primary/75">{body}</p>
          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/book" className="btn-dark">
              {copy.cta.bookSession} <ArrowRight className="size-4" />
            </Link>
            <Link href="/book?picker=1" className="btn border border-on-primary/30 text-on-primary hover:bg-on-primary/5">
              {copy.cta.picker}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export function SampleBadge() {
  return <span className="ml-2 rounded-full border border-warning/50 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wider text-warning">Draft</span>;
}
