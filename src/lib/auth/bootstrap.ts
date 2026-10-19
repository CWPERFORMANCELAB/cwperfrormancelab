import bcrypt from "bcryptjs";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { adminUsers } from "@/db/schema";
import { isStrict } from "@/lib/env";

/** Creates the single admin user on first run from ADMIN_EMAIL / ADMIN_PASSWORD. 2FA enrolment is forced at first login. */
export async function ensureAdminUser(db: Db) {
  const [existing] = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1);
  if (existing) return false;
  const email = (process.env.ADMIN_EMAIL || business.contact.email).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "change-me-now";
  if (isStrict() && password === "change-me-now") {
    throw new Error("Set ADMIN_PASSWORD before the first production run");
  }
  await db.insert(adminUsers).values({
    email,
    name: process.env.ADMIN_NAME || business.practitioner.name,
    passwordHash: await bcrypt.hash(password, 12),
  });
  return true;
}
