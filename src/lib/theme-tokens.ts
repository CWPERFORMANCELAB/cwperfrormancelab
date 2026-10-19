import fs from "node:fs";
import path from "node:path";

/**
 * Reads brand tokens from config/theme.css (the only file allowed to hold colour literals) for places that can't
 * use CSS variables: HTML emails, OG images, receipts, the e-voucher.
 */
let cache: Record<string, string> | null = null;

export function themeTokens(): Record<string, string> {
  if (cache) return cache;
  const css = fs.readFileSync(path.join(process.cwd(), "config/theme.css"), "utf8");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--brand-([a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  cache = out;
  return out;
}

export function token(name: string, fallback = "currentColor"): string {
  return themeTokens()[name] ?? fallback;
}
