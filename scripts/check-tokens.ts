/**
 * npm run check:tokens — fails if a colour literal (hex) appears anywhere outside config/theme.css.
 * Keeps config/theme.css the single source of truth for brand colours.
 */
import fs from "node:fs";
import path from "node:path";

const roots = ["src", "content", "config", "scripts"];
const allow = new Set([path.normalize("config/theme.css")]);
const hex = /(^|[^&\w])#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?![\w-])/;
const bad: string[] = [];

function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "migrations" && e.name !== "node_modules") walk(p);
    } else if (/\.(tsx?|css|mdx?|json)$/.test(e.name) && !allow.has(path.normalize(p))) {
      fs.readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (hex.test(line) && !/check-tokens|href=|url\(|#main|#[a-z-]+"/.test(line)) bad.push(`${p}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
    }
  }
}
roots.forEach(walk);
if (bad.length) {
  console.error(`✗ Colour literals found outside config/theme.css:\n${bad.join("\n")}`);
  process.exit(1);
}
console.log("✓ No colour literals outside config/theme.css");
