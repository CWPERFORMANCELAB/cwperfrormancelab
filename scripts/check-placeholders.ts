/**
 * npm run check:placeholders                 → list remaining placeholders; exit 1 if any are BLOCKING
 * npm run check:placeholders -- --production → same, plus the production environment rules (runs before every
 *                                              production build via scripts/prebuild.ts)
 * npm run check:placeholders -- --write      → also regenerate CLIENT_TODO.md
 *
 * Warnings (photos, draft FAQs, social links, legal review, ...) are listed but never fail: see isBlocking().
 */
import fs from "node:fs";
import { seedServices, seedSettings } from "../config/seed-settings";
import { scanFiles, type PlaceholderItem } from "../src/lib/placeholders";
import { renderClientTodo } from "./client-todo";
import { assertProductionEnv, EnvError } from "../src/lib/env";

const items: PlaceholderItem[] = scanFiles({ settings: [...seedSettings] as never, services: seedServices });

// Hard requirements for production that aren't "placeholders" but must not ship unset.
const envProblems: string[] = [];
if (process.argv.includes("--production")) {
  // Same rules the server enforces at startup (src/lib/env.ts), evaluated as production.
  const features = seedSettings.find((s) => s.key === "features")?.value as { smsReminders?: boolean } | undefined;
  try {
    assertProductionEnv({ ...process.env, VERCEL_ENV: "production" }, { smsReminders: features?.smsReminders });
  } catch (err) {
    if (err instanceof EnvError) envProblems.push(...err.missing);
    else throw err;
  }
}

if (process.argv.includes("--write")) {
  fs.writeFileSync("CLIENT_TODO.md", renderClientTodo(items));
  console.log("CLIENT_TODO.md updated.");
}

const print = (title: string, list: PlaceholderItem[]) => {
  if (!list.length) return;
  console.log(`\n${title}`);
  const byArea = new Map<string, PlaceholderItem[]>();
  for (const i of list) byArea.set(i.area, [...(byArea.get(i.area) ?? []), i]);
  for (const [area, items] of byArea) {
    console.log(`\n  ${area} (${items.length})`);
    for (const i of items) console.log(`    • ${i.what}  [${i.file}]\n        now: ${i.current}\n        need: ${i.needed}`);
  }
};
const blocking = items.filter((i) => i.blocking);
const warnings = items.filter((i) => !i.blocking);
print(`BLOCKING: must be confirmed before launch (${blocking.length})`, blocking);
print(`Can wait: safe to launch with, listed in CLIENT_TODO.md (${warnings.length})`, warnings);
if (envProblems.length) console.log(`\nProduction environment: missing/invalid → ${envProblems.join(", ")}`);

const failures = blocking.length + envProblems.length;
console.log(
  failures
    ? `\n✗ ${failures} blocking item(s) remaining${warnings.length ? `, plus ${warnings.length} that can wait` : ""}.`
    : `\n✓ Nothing blocking launch.${warnings.length ? ` ${warnings.length} item(s) can wait (see CLIENT_TODO.md).` : ""}`,
);
process.exit(failures ? 1 : 0);
