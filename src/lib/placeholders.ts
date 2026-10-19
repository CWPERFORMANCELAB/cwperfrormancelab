/**
 * Finds every value still awaiting client confirmation. One scanner powers three things:
 *   - `npm run check:placeholders` (fails the go-live check while any remain)
 *   - CLIENT_TODO.md (generated)
 *   - the "X settings still use placeholder values" banner in the dashboard
 *
 * Sources: `// PLACEHOLDER:` markers in config/ and content/, `placeholder: true` in seed data and content JSON,
 * draft FAQs, and media slots without real files.
 */
import fs from "node:fs";
import path from "node:path";

export type PlaceholderItem = {
  id: string;
  area: "Business details" | "Brand" | "Settings" | "Services" | "Content" | "Media" | "Legal";
  file: string;
  what: string;
  current: string;
  needed: string;
};

const root = () => process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(/*turbopackIgnore: true*/ root(), rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(/*turbopackIgnore: true*/ root(), rel));

function scanMarkers(rel: string, area: PlaceholderItem["area"], opts: { skip?: RegExp } = {}): PlaceholderItem[] {
  if (!exists(rel)) return [];
  const out: PlaceholderItem[] = [];
  const lines = read(rel).split("\n");
  // key: "quoted value" | 'quoted' | bare value up to a comma/comment.  Also CSS custom properties.
  const kvRe = /^\s*([A-Za-z0-9_]+)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\[[^\]]*\]|[^,/]+?)\s*,?\s*(?:\/\/.*)?$/;
  const cssRe = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("/**")) return; // doc comments that merely mention the marker
    if (opts.skip?.test(line)) return;
    const m = line.match(/PLACEHOLDER:\s*(.+?)\s*(?:\*\/|\}|-->)?\s*$/);
    if (!m) return;
    // Marker on its own line applies to the next line(s) (e.g. a comment above a key, or above a CSS block).
    const standalone = /^\s*(\/\/|\/\*|\{\/\*)/.test(line);
    const target = standalone ? lines.slice(i + 1).find((l) => kvRe.test(l) || cssRe.test(l)) ?? "" : line.replace(/\s*\/\/\s*PLACEHOLDER:.*$/, "");
    const kv = target.match(kvRe) || target.match(cssRe);
    const isLegal = area === "Legal";
    out.push({
      id: `${rel}:${i + 1}`,
      area,
      file: `${rel}:${i + 1}`,
      what: isLegal ? "Legal review" : kv ? kv[1] : m[1],
      current: isLegal || !kv ? "Draft" : kv[2].trim().replace(/^["']|["']$/g, "") || "(empty — hidden on the site)",
      needed: m[1].trim(),
    });
  });
  return out;
}

type SeedLike = {
  settings: { key: string; placeholder: boolean; placeholderNote?: string; value: unknown }[];
  services: { id: string; name: string; placeholder: boolean; placeholderNote?: string; pricePence: number; durationMin: number }[];
};

/** Static scan of files (used by the CLI and CLIENT_TODO.md). `seed` is passed in to avoid importing config here. */
export function scanFiles(seed: SeedLike): PlaceholderItem[] {
  const items: PlaceholderItem[] = [
    ...scanMarkers("config/business.ts", "Business details"),
    ...scanMarkers("config/theme.css", "Brand"),
    // Seed settings are tracked by their placeholder flags; also pick up inline markers on individual fields.
    ...scanMarkers("config/seed-settings.ts", "Settings", { skip: /placeholder:\s*(true|false)/ }),
  ];

  for (const s of seed.settings.filter((x) => x.placeholder)) {
    items.push({
      id: `setting:${s.key}`,
      area: "Settings",
      file: "config/seed-settings.ts",
      what: s.key,
      current: s.placeholderNote ?? JSON.stringify(s.value),
      needed: "Confirm with client, then set placeholder: false",
    });
  }
  for (const s of seed.services.filter((x) => x.placeholder)) {
    items.push({
      id: `service:${s.id}`,
      area: "Services",
      file: "config/seed-settings.ts",
      what: `${s.name} (${s.id})`,
      current: `£${(s.pricePence / 100).toFixed(2)} · ${s.durationMin} min`,
      needed: s.placeholderNote ?? "Confirm duration/price",
    });
  }

  if (exists("public/brand/logo.svg") && read("public/brand/logo.svg").includes("PLACEHOLDER")) {
    items.push({ id: "brand:logo", area: "Brand", file: "public/brand/logo.svg", what: "Vector logo", current: "Raster artwork embedded in SVG", needed: "True vector logo files (logo.svg, logo-mark.svg)" });
  }

  const faq = JSON.parse(read("content/faq.json")) as { items: { id: string; q: string; draft?: boolean }[] };
  for (const f of faq.items.filter((x) => x.draft)) {
    items.push({ id: `faq:${f.id}`, area: "Content", file: "content/faq.json", what: `FAQ: ${f.q}`, current: "Draft answer (hidden in production)", needed: "Client to approve or edit, then set draft: false" });
  }
  const t = JSON.parse(read("content/testimonials.json")) as { items: { id: string; placeholder?: boolean }[] };
  const pt = t.items.filter((x) => x.placeholder);
  if (pt.length) items.push({ id: "testimonials", area: "Content", file: "content/testimonials.json", what: `${pt.length} sample testimonials`, current: "Sample text (hidden in production)", needed: "Real client reviews with written permission" });

  const media = JSON.parse(read("content/media.json")) as { slots: Record<string, { file: string; placeholder: boolean; needed?: string; fallback?: string }> };
  for (const [id, s] of Object.entries(media.slots).filter(([, s]) => s.placeholder)) {
    const current = s.fallback ? `Showing stand-in photo ${s.fallback.replace("/media/", "")}` : "Labelled placeholder box";
    items.push({ id: `media:${id}`, area: "Media", file: `public${s.file}`, what: `Media slot "${id}"`, current, needed: s.needed ?? "Image/video file" });
  }

  for (const rel of ["content/policies/privacy.mdx", "content/policies/terms.mdx", "content/policies/cookies.mdx", "content/about.mdx"]) {
    for (const m of scanMarkers(rel, "Legal")) items.push(m);
  }
  return items;
}

/** DB-backed placeholders for the dashboard banner (reflects edits made in the dashboard). */
export async function dbPlaceholderCount(db: import("@/db/client").Db) {
  const { settings, services } = await import("@/db/schema");
  const { and, eq, isNull } = await import("drizzle-orm");
  const s = await db.select({ key: settings.key, note: settings.placeholderNote }).from(settings).where(eq(settings.placeholder, true));
  const v = await db.select({ id: services.id, name: services.name, note: services.placeholderNote }).from(services).where(and(eq(services.placeholder, true), isNull(services.archivedAt)));
  return { settings: s, services: v };
}
