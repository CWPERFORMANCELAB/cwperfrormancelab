import Link from "next/link";
import { CtaBand, SectionHeading, ServiceCard } from "@/components/site/blocks";
import { FaqList } from "@/components/site/faq-list";
import { MediaImage, MediaVideo } from "@/components/site/media";
import { SessionPicker } from "@/components/site/picker";
import { TrustRow } from "@/components/site/trust";
import { ArrowRight } from "@/components/icons";
import { copy, serviceMetas, slot } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";

export default async function HomePage() {
  const [{ services }, metas] = await Promise.all([getCatalog(), serviceMetas()]);
  const h = copy.home;
  const assessment = services.find((s) => s.id === "injury-assessment") ?? services[0];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-14 sm:pt-32 lg:min-h-[92dvh] lg:pb-20">
        <div aria-hidden className="pointer-events-none absolute -top-48 -right-40 size-[44rem] rounded-full bg-primary/25 blur-3xl" />
        <div className="container-x relative grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <p className="eyebrow text-primary-light">{h.eyebrow}</p>
            <h1 className="mt-5 font-display text-[clamp(2.6rem,7.2vw,5.6rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
              {h.headline[0]}
              <br />
              <span className="text-bone/65">{h.headline[1]}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-bone/70">
              {h.lede}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href={`/book?service=${assessment.id}`} className="btn-primary">
                {h.primaryCta} · {formatPence(assessment.pricePence)} <ArrowRight className="size-4" />
              </Link>
              <Link href="/services" className="btn-ghost">
                {h.secondaryCta}
              </Link>
            </div>
            <div className="mt-10">
              <TrustRow />
            </div>
          </div>
          <div className="relative lg:col-span-5">
            <MediaImage slot={slot("hero")} priority sizes="(min-width:1024px) 40vw, 92vw" className="aspect-[4/5] w-full sm:ml-auto sm:w-[82%] lg:w-full" rounded="rounded-[2rem]" />
            <MediaImage slot={slot("heroInset")} sizes="200px" className="absolute -bottom-6 -left-2 hidden aspect-[3/4] w-40 border-4 border-ink shadow-2xl sm:block lg:-left-10 lg:w-48" rounded="rounded-2xl" showLabel={false} />
          </div>
        </div>
      </section>

      {/* Services */}
      <section className="py-20 sm:py-28" aria-labelledby="services-title">
        <div className="container-x">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <SectionHeading eyebrow="Services & prices" title={<span id="services-title">{h.servicesTitle}</span>} lede={h.servicesLede} />
            <Link href="/pricing" className="btn-ghost self-start lg:self-auto" data-reveal>
              Full price list
            </Link>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((s, i) => (
              <ServiceCard key={s.id} s={s} summary={metas[s.id]?.summary} delay={(i % 3) * 70} />
            ))}
          </div>
        </div>
      </section>

      {/* Picker */}
      <section className="pb-20 sm:pb-28">
        <div className="container-x grid items-start gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5" data-reveal>
            <SectionHeading eyebrow="Help me choose" title={copy.picker.title} lede={copy.picker.lede} />
          </div>
          <div className="lg:col-span-7" data-reveal>
            <SessionPicker
              config={copy.picker as never}
              services={services.map((s) => ({ id: s.id, shortName: s.shortName, slug: s.slug, price: formatPence(s.pricePence), durationMin: s.durationMin }))}
            />
          </div>
        </div>
      </section>

      {/* Approach */}
      <section className="border-y border-white/[0.06] bg-coal/60 py-20 sm:py-28">
        <div className="container-x grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionHeading eyebrow={h.approach.eyebrow} title={h.approach.title} lede={h.approach.lede} />
          </div>
          <ol className="grid gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:col-span-7">
            {h.approach.steps.map((s, i) => (
              <li key={s.title} className="bg-ink p-7 sm:p-9" data-reveal style={{ "--d": `${i * 80}ms` } as React.CSSProperties}>
                <span className="font-display text-sm tabular-nums text-primary-light">0{i + 1}</span>
                <h3 className="mt-6 font-display text-2xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-bone/60">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Running community + video */}
      <section className="py-20 sm:py-28">
        <div className="container-x grid items-center gap-10 lg:grid-cols-12">
          <div className="grid grid-cols-2 gap-3 lg:col-span-6" data-reveal>
            <MediaImage slot={slot("gallery1")} sizes="(min-width:1024px) 25vw, 45vw" className="aspect-[3/4]" />
            <MediaVideo slot={slot("heroLoop")} className="mt-10 aspect-[3/4]" />
          </div>
          <div className="lg:col-span-6">
            <SectionHeading eyebrow={h.running.eyebrow} title={h.running.title} lede={h.running.body} />
            <Link href="/book" className="btn-primary mt-8" data-reveal>
              {copy.cta.bookSession} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* About teaser */}
      <section className="surface-light bg-bone py-20 text-ink sm:py-28">
        <div className="container-x grid items-center gap-10 lg:grid-cols-12">
          <MediaImage slot={slot("headshot")} sizes="(min-width:1024px) 40vw, 92vw" className="aspect-[4/5] lg:col-span-5" rounded="rounded-[2rem]" />
          <div className="lg:col-span-7">
            <SectionHeading tone="light" eyebrow={h.aboutTeaser.eyebrow} title={h.aboutTeaser.title} lede={h.aboutTeaser.body} />
            <Link href="/about" className="btn-dark mt-8" data-reveal>
              {h.aboutTeaser.cta} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="pb-4">
        <div className="container-x grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionHeading eyebrow="FAQ" title={copy.faq.title} />
            <Link href="/faq" className="mt-6 inline-flex items-center gap-2 text-primary-light" data-reveal>
              All questions <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="lg:col-span-8">
            <FaqList featuredOnly />
          </div>
        </div>
      </section>

      <CtaBand title={h.finalCta.title} body={h.finalCta.body} />
    </>
  );
}
