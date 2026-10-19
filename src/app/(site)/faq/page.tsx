import type { Metadata } from "next";
import { CtaBand, PageHero } from "@/components/site/blocks";
import { FaqList, faqJsonLd } from "@/components/site/faq-list";
import { JsonLd } from "@/components/site/json-ld";
import { copy } from "@/lib/content";

export const metadata: Metadata = {
  title: "FAQ: Sports Massage & Injury Treatment",
  description: "What to wear, parking, home visits, cancellations and what to expect at your first sport rehabilitation session in Manchester.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title={copy.faq.title} lede={copy.faq.lede} />
      <section className="pb-8">
        <div className="container-x max-w-4xl">
          <FaqList />
        </div>
      </section>
      <CtaBand title={copy.home.finalCta.title} body={copy.home.finalCta.body} />
      <JsonLd data={await faqJsonLd()} />
    </>
  );
}
