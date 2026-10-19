"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft } from "@/components/icons";

type Option = { id: string; label: string };
type Question = { id: string; label: string; dependsOn?: string; options: Option[] | Record<string, Option[]> };
type Rule = { when: Record<string, string>; recommend: string; why: string };
export type PickerConfig = { title: string; lede: string; questions: Question[]; rules: Rule[]; fallback: string };
type ServiceLite = { id: string; shortName: string; slug: string; price: string; durationMin: number };

/** "Not sure which session?" — rules live in content/site.json so the client can tune them without code. */
export function SessionPicker({ config, services, onChoose }: { config: PickerConfig; services: ServiceLite[]; onChoose?: (serviceId: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const step = config.questions.findIndex((q) => !answers[q.id]);
  const done = step === -1;

  const result = useMemo(() => {
    if (!done) return null;
    const rule = config.rules.find((r) => Object.entries(r.when).every(([k, v]) => answers[k] === v));
    const id = rule?.recommend ?? config.fallback;
    return { service: services.find((s) => s.id === id) ?? services[0], why: rule?.why ?? "" };
  }, [done, answers, config, services]);

  const q = done ? null : config.questions[step];
  const options: Option[] = q ? (Array.isArray(q.options) ? q.options : (q.options[answers[q.dependsOn!]] ?? [])) : [];

  return (
    <div className="rounded-xl border border-white/10 bg-coal p-5 sm:p-7" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <p className="eyebrow text-primary-light">{config.title}</p>
        {Object.keys(answers).length > 0 && (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-bone/60 hover:text-bone" onClick={() => setAnswers({})}>
            <ChevronLeft className="size-4" /> Start again
          </button>
        )}
      </div>

      {q && (
        <fieldset className="mt-4">
          <legend className="font-display text-xl font-semibold tracking-tight">{q.label}</legend>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))}
                className="min-h-12 rounded-lg border border-white/12 bg-ink/40 px-4 py-3 text-left text-[15px] transition hover:border-primary hover:bg-primary/10"
              >
                {o.label}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {result && (
        <div className="mt-4 animate-rise">
          <p className="text-sm text-bone/60">I&apos;d recommend</p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight">
            {result.service.shortName}{" "}
            <span className="text-base font-normal text-bone/60">
              · {result.service.price} · {result.service.durationMin} min
            </span>
          </p>
          <p className="mt-2 text-bone/70">{result.why}</p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {onChoose ? (
              <button type="button" className="btn-primary" onClick={() => onChoose(result.service.id)}>
                Book {result.service.shortName} <ArrowRight className="size-4" />
              </button>
            ) : (
              <Link href={`/book?service=${result.service.id}`} className="btn-primary">
                Book {result.service.shortName} <ArrowRight className="size-4" />
              </Link>
            )}
            <Link href={`/services/${result.service.slug}`} className="btn-ghost">
              Learn more
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
