import type { ComponentType } from "react";
import { PageHero } from "./blocks";

export function LegalPage({ title, Body }: { title: string; Body: ComponentType }) {
  return (
    <>
      <PageHero eyebrow="Legal" title={title} />
      <section className="pb-24">
        <div className="container-x max-w-3xl">
          <div className="prose-cw text-bone/80">
            <Body />
          </div>
        </div>
      </section>
    </>
  );
}
