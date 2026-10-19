/**
 * npm run check:placeholders            → list remaining placeholders, exit 1 if any (run before go-live)
 * npm run check:placeholders -- --write → also regenerate CLIENT_TODO.md
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

const byArea = new Map<string, PlaceholderItem[]>();
for (const i of items) byArea.set(i.area, [...(byArea.get(i.area) ?? []), i]);
for (const [area, list] of byArea) {
  console.log(`\n${area} (${list.length})`);
  for (const i of list) console.log(`  • ${i.what}  [${i.file}]\n      now: ${i.current}\n      need: ${i.needed}`);
}
if (envProblems.length) console.log(`\nProduction environment: missing/invalid → ${envProblems.join(", ")}`);

const total = items.length + envProblems.length;
console.log(total ? `\n✗ ${total} placeholder(s) remaining.` : "\n✓ No placeholders remaining.");
process.exit(total ? 1 : 0);
