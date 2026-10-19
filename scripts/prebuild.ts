/**
 * Runs before every `next build`.
 *  - Production deploys (VERCEL_ENV=production): placeholders must be gone and the environment complete, otherwise
 *    the build fails here instead of the site misbehaving at runtime.
 *  - Preview deploys: environment must still include a real database and Stripe (test keys allowed).
 *  - Local builds: nothing to enforce (set NEXT_PUBLIC_SITE_URL to a localhost URL, e.g. `npm run build:local`).
 */
import "./env";
import { execFileSync } from "node:child_process";
import { seedSettings } from "../config/seed-settings";
import { assertProductionEnv, runtimeMode } from "../src/lib/env";

const mode = runtimeMode();
console.log(`[prebuild] runtime mode: ${mode}`);
if (mode === "production") {
  execFileSync("npx", ["tsx", "scripts/check-placeholders.ts", "--production"], { stdio: "inherit" });
} else if (mode === "preview") {
  const features = seedSettings.find((s) => s.key === "features")?.value as { smsReminders?: boolean } | undefined;
  assertProductionEnv(process.env, { smsReminders: features?.smsReminders });
}
