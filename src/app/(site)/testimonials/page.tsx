import type { Metadata } from "next";
import { business } from "@config/business";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { Star } from "@/components/icons";
import { copy, visibleTestimonials } from "@/lib/content";

export const metadata: Metadata = {
  title: "Client Reviews",
  description: `Reviews from runners, athletes and clients of ${business.name} in Manchester.`,
  alternates: { canonical: "/testimonials" },
};

export default function TestimonialsPage() {
  const items = visibleTestimonials();
  return (
    <>
      <PageHero eyebrow="Testimonials" title={copy.testimonials.title} lede={copy.testimonials.lede}>
        {business.googleReviewUrl && (
          <a href={business.googleReviewUrl} className="btn-ghost" rel="noopener">
            Leave a Google review
          </a>
        )}
      </PageHero>
      <section className="pb-8">
        <div className="container-x">
          {items.length === 0 ? (
            <p className="text-bone/60">Reviews coming soon.</p>
          ) : (
            <div className="columns-1 gap-4 md:columns-2 lg:columns-3">
              {items.map((t) => (
                <figure key={t.id} className="card mb-4 break-inside-avoid p-6" data-reveal>
                  {t.sample && <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-warning">Sample: replace with a real review</p>}
                  <div className="flex gap-0.5 text-primary-light" aria-label={`${t.rating} out of 5 stars`}>
                    {Array.from({ length: t.rating }, (_, i) => (
                      <Star key={i} className="size-4" />
                    ))}
                  </div>
                  <blockquote className="mt-3 leading-relaxed text-bone/80">&ldquo;{t.quote}&rdquo;</blockquote>
                  <figcaption className="mt-4 text-sm text-bone/65">
                    {t.name} · {t.context}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
    </>
  );
}
