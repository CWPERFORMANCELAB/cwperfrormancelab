/**
 * npm run admin:reset -- --email christopher@example.com [--reset-2fa]
 *
 * Break-glass recovery when the admin has lost their password, or their phone and recovery codes.
 * Sets a random temporary password (printed once), optionally clears 2FA so it's re-enrolled at next sign-in,
 * revokes every session, and writes to the audit log. Needs the production DATABASE_URL — see RUNBOOK.md.
 */
import "./env";
import os from "node:os";
import { getDb } from "../src/db/client";
import { resetAdmin } from "../src/lib/auth/reset";

const args = process.argv.slice(2);
const emailIdx = args.indexOf("--email");
const email = emailIdx >= 0 ? args[emailIdx + 1] : undefined;
if (!email || email.startsWith("--")) {
  console.error("Usage: npm run admin:reset -- --email <admin email> [--reset-2fa]");
  process.exit(1);
}

getDb()
  .then((db) => resetAdmin(db, { email, reset2fa: args.includes("--reset-2fa"), operator: os.userInfo().username }))
  .then((r) => {
    console.log(`\n✓ Admin account reset: ${r.email}`);
    console.log(`  Temporary password (shown once): ${r.temporaryPassword}`);
    console.log(`  Two-factor: ${r.twoFactorCleared ? "cleared, will be set up again at next sign-in" : "unchanged"}`);
    console.log(`  Sessions revoked: ${r.sessionsRevoked}`);
    console.log("\n  Give the password to the admin over a separate channel (phone call), and ask them to change it");
    console.log("  in Dashboard → Settings → Account straight after signing in.\n");
    process.exit(0);
  })
  .catch((e) => {
    console.error("✗", e.message ?? e);
    process.exit(1);
  });
