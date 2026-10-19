/**
 * Global setup for end-to-end tests: seeds an isolated PGlite database (.data/e2e) with a canary client, booking,
 * payment and enquiry, then starts the PRODUCTION build (`next start`) against it. Requires a prior
 * `npm run build:local` (the `test:e2e` script does this).
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";

export const CANARY = {
  firstName: "Zelphine",
  lastName: "Canarywick",
  email: "canary-e2e@example.com",
  phone: "07700 900999",
  enquiryName: "Quillon Canaryhall",
  amountPence: 12345, // renders as £123.45
};

const PORT = 3099;
const DIR = ".data/e2e";
let server: ChildProcess | undefined;

export default async function setup(project: TestProject) {
  if (!fs.existsSync(".next/BUILD_ID")) throw new Error("No production build found. Run `npm run build:local` first (or `npm run test:e2e`).");
  fs.rmSync(DIR, { recursive: true, force: true });
  process.env.PGLITE_DIR = DIR;
  delete process.env.PGLITE_MEMORY;

  const { getDb } = await import("@/db/client");
  const { applyClientDetails } = await import("@/lib/seed/apply");
  const { ensureAdminUser } = await import("@/lib/auth/bootstrap");
  const { addMinutes } = await import("@/lib/time");
  const { sha256 } = await import("@/lib/crypto");
  const schema = await import("@/db/schema");
  const { business } = await import("@config/business");

  const db = await getDb();
  await applyClientDetails(db);
  await ensureAdminUser(db);
  const [admin] = await db.select().from(schema.adminUsers);
  await db.update(schema.adminUsers).set({ totpEnabled: true });
  const validToken = "e2e-valid-session-token-for-control-only";
  await db.insert(schema.adminSessions).values({ userId: admin.id, tokenHash: sha256(validToken), mfaVerified: true, expiresAt: addMinutes(new Date(), 120) });

  const [client] = await db
    .insert(schema.clients)
    .values({ firstName: CANARY.firstName, lastName: CANARY.lastName, email: CANARY.email, phone: CANARY.phone, sport: "Running" })
    .returning();
  const start = addMinutes(new Date(), 60 * 26);
  const [booking] = await db
    .insert(schema.bookings)
    .values({
      practitionerId: business.practitioner.id,
      serviceId: "injury-assessment",
      clientId: client.id,
      status: "confirmed",
      startsAt: start,
      endsAt: addMinutes(start, 60),
      occupiedUntil: addMinutes(start, 70),
      pricePence: CANARY.amountPence,
      paidPence: CANARY.amountPence,
    })
    .returning();
  await db.insert(schema.payments).values({ bookingId: booking.id, clientId: client.id, provider: "manual", amountPence: CANARY.amountPence, status: "succeeded", description: "E2E canary payment" });
  const [enquiry] = await db
    .insert(schema.enquiries)
    .values({ kind: "home_visit", name: CANARY.enquiryName, email: "enquiry-canary@example.com", phone: "07700 900888", postcode: "M8 8HQ" })
    .returning();
  await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();

  server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: { ...process.env, PGLITE_DIR: DIR, PORT: String(PORT), NEXT_PUBLIC_SITE_URL: `http://localhost:${PORT}`, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://localhost:${PORT}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/robots.txt`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }

  project.provide("baseUrl", base);
  project.provide("ids", { clientId: client.id, bookingId: booking.id, enquiryId: enquiry.id });
  project.provide("validCookie", `cw_admin=${validToken}`);

  return async () => {
    server?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    fs.rmSync(path.resolve(DIR), { recursive: true, force: true });
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
    ids: { clientId: string; bookingId: string; enquiryId: string };
    validCookie: string;
  }
}
