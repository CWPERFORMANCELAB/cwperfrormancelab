/**
 * npm run apply:client-details — re-applies config/seed-settings.ts to the database (see src/lib/seed/apply.ts).
 * Updates services & settings in place by stable ID, archives removed services, never touches bookings/clients/payments.
 */
import "./env";
import { getDb } from "../src/db/client";
import { applyClientDetails } from "../src/lib/seed/apply";

getDb()
  .then(async (db) => {
    const r = await applyClientDetails(db);
    console.log(`✓ Settings applied: ${r.settings.join(", ")}`);
    console.log(`✓ Services upserted: ${r.servicesUpserted.join(", ")}`);
    if (r.servicesArchived.length) console.log(`• Services archived (kept for history): ${r.servicesArchived.join(", ")}`);
    if (r.templatesAdded.length) console.log(`• New notification templates: ${r.templatesAdded.join(", ")}`);
    console.log("\nNext: npm run check:placeholders");
    process.exit(0);
  })
  .catch((e) => {
    console.error("✗ apply:client-details failed — nothing was changed.\n", e.message ?? e);
    process.exit(1);
  });
