/**
 * Regenerates public/brand/* from the supplied logo artwork + config/theme.css + config/business.ts.
 * Run after replacing src/assets/brand/logo-full.png / logo-mark.png:  npx tsx scripts/build-brand.ts
 * (When a true vector logo arrives, drop logo.svg / logo-mark.svg straight into public/brand instead.)
 */
import fs from "node:fs";
import sharp from "sharp";
import { business } from "../config/business";
import { themeTokens } from "../src/lib/theme-tokens";

const t = themeTokens();
const out = "public/brand";
fs.mkdirSync(out, { recursive: true });

async function embedSvg(src: string, dest: string) {
  const meta = await sharp(src).metadata();
  const b64 = fs.readFileSync(src).toString("base64");
  fs.writeFileSync(
    dest,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${meta.width} ${meta.height}" role="img" aria-label="${business.name}"><!-- PLACEHOLDER: replace with true vector artwork --><image width="${meta.width}" height="${meta.height}" href="data:image/png;base64,${b64}"/></svg>\n`,
  );
}

async function main() {
  await embedSvg("src/assets/brand/logo-full.png", `${out}/logo.svg`);
  await embedSvg("src/assets/brand/logo-mark.png", `${out}/logo-mark.svg`);

  const mark = (w: number) => sharp("src/assets/brand/logo-mark.png").resize({ width: w }).toBuffer();
  const square = async (size: number, pad: number, file: string) =>
    sharp({ create: { width: size, height: size, channels: 4, background: t.ink } })
      .composite([{ input: await mark(Math.round(size * (1 - pad))), gravity: "center" }])
      .png()
      .toFile(`${out}/${file}`);
  await square(512, 0.18, "icon-512.png");
  await square(192, 0.18, "icon-192.png");
  await square(180, 0.2, "apple-touch-icon.png");
  await square(48, 0.12, "favicon-48.png");
  await square(32, 0.1, "favicon-32.png");

  // Open Graph 1200×630
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const text = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="g" cx="85%" cy="15%" r="70%"><stop offset="0" stop-color="${t.primary}" stop-opacity=".55"/><stop offset="1" stop-color="${t.ink}" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="630" fill="${t.ink}"/><rect width="1200" height="630" fill="url(#g)"/>
    <text x="80" y="430" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="700" fill="${t.bone}">${esc(business.tagline)}</text>
    <text x="80" y="500" font-family="Helvetica, Arial, sans-serif" font-size="28" fill="${t.mist}">${esc(`${business.practitioner.title} · ${business.address.venue}, ${business.address.city}`)}</text>
  </svg>`);
  const logo = await sharp("src/assets/brand/logo-full.png").resize({ height: 220 }).toBuffer();
  await sharp(text).composite([{ input: logo, top: 90, left: 80 }]).png().toFile(`${out}/og-image.png`);
  console.log("brand assets written to", out);
}
main();
