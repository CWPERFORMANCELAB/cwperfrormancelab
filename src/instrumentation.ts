/**
 * Runs once when a server instance starts, before it handles requests (Next.js instrumentation).
 * Refuses to serve if production/preview configuration is incomplete, then verifies the database invariants.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionEnv, isStrict } = await import("@/lib/env");
  const { seedSettings } = await import("@config/seed-settings");
  const features = seedSettings.find((s) => s.key === "features")?.value as { smsReminders?: boolean } | undefined;
  assertProductionEnv(process.env, { smsReminders: features?.smsReminders });

  if (isStrict()) {
    // Connect now so a missing exclusion constraint / extension fails the instance at boot, not on the first booking.
    const { getDb } = await import("@/db/client");
    await getDb();
  }

  const { initMonitoring } = await import("@/lib/monitoring");
  initMonitoring("server");
}

export { onRequestError } from "@/lib/monitoring";
