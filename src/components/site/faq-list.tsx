import Link from "next/link";
import { visibleFaqs } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { policySummary } from "@/lib/policy";
import { Plus } from "@/components/icons";
import { SampleBadge } from "./blocks";

export async function FaqList({ featuredOnly = false, tone = "dark" }: { featuredOnly?: boolean; tone?: "dark" | "light" }) {
  const { policy } = await getCatalog();
  const items = visibleFaqs().filter((f) => !featuredOnly || f.featured);
  const line = tone === "dark" ? "divide-white/[0.08] border-white/[0.08]" : "divide-ink/10 border-ink/10";
  const muted = tone === "dark" ? "text-bone/65" : "text-ink/65";
  return (
    <div className={`divide-y border-y ${line}`}>
      {items.map((f) => (
        <details key={f.id} className="group" data-reveal>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-lg font-medium tracking-tight [&::-webkit-details-marker]:hidden">
            <span>
              {f.q}
              {f.sample && <SampleBadge />}
            </span>
            <Plus className={`size-5 shrink-0 transition duration-300 group-open:rotate-45 ${muted}`} />
          </summary>
          <p className={`max-w-2xl pb-6 leading-relaxed ${muted}`}>
            {f.dynamic === "cancellationPolicy" ? policySummary(policy) : f.a}
            {f.link && (
              <>
                {" "}
                <Link href={f.link.href} className="text-primary-light underline underline-offset-4">
                  {f.link.label}
                </Link>
              </>
            )}
          </p>
        </details>
      ))}
    </div>
  );
}

export async function faqJsonLd() {
  const { policy } = await getCatalog();
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: visibleFaqs()
      .filter((f) => !f.sample)
      .map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.dynamic === "cancellationPolicy" ? policySummary(policy) : f.a },
      })),
  };
}
