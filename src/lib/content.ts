import faq from "@content/faq.json";
import media from "@content/media.json";
import site from "@content/site.json";

/** Typed access to content/*.json. */
export const copy = site;

export type FaqItem = {
  id: string;
  q: string;
  a: string;
  draft?: boolean;
  featured?: boolean;
  dynamic?: "cancellationPolicy";
  link?: { href: string; label: string };
};
export const faqItems = faq.items as FaqItem[];

export type MediaSlot = { file: string; alt: string; placeholder: boolean; kind: "image" | "video"; poster?: string; needed?: string; fallback?: string; quality?: number };
export const mediaSlots = media.slots as Record<string, MediaSlot>;
export function slot(id: keyof typeof media.slots): MediaSlot & { id: string } {
  return { id, ...(media.slots[id] as MediaSlot) };
}
export function serviceSlot(serviceId: string) {
  const id = (media.services as Record<string, string>)[serviceId] ?? "hero";
  return slot(id as keyof typeof media.slots);
}

/** Draft FAQs show in development (with a label) and are hidden in production until approved. */
export function visibleFaqs(): (FaqItem & { sample: boolean })[] {
  const prod = process.env.NODE_ENV === "production" && process.env.SHOW_SAMPLE_CONTENT !== "1";
  return faqItems.filter((f) => !(prod && f.draft)).map((f) => ({ ...f, sample: Boolean(f.draft) }));
}

/** Simple {{var}} fill for copy strings. */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));
}

/** All service page metadata (from content/services/*.mdx), keyed by service ID. */
export async function serviceMetas() {
  const { serviceContent } = await import("@content/services");
  const entries = await Promise.all(Object.entries(serviceContent).map(async ([id, load]) => [id, (await load()).meta] as const));
  return Object.fromEntries(entries);
}
