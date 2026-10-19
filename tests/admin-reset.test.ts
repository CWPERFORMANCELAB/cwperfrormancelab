/** PRE-DEPLOY-FIXES #9: break-glass admin reset. */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { adminSessions, adminUsers, auditLog } from "@/db/schema";
import { ensureAdminUser } from "@/lib/auth/bootstrap";
import { resetAdmin } from "@/lib/auth/reset";
import { addMinutes } from "@/lib/time";
import { freshDb } from "./helpers";

let db: Db;
let adminId: string;
beforeEach(async () => {
  db = await freshDb();
  await ensureAdminUser(db);
  const [a] = await db.select().from(adminUsers);
  adminId = a.id;
  await db.update(adminUsers).set({ totpEnabled: true, totpSecretEnc: "v1.x.y.z", recoveryCodesHash: ["h1", "h2"] }).where(eq(adminUsers.id, adminId));
  await db.insert(adminSessions).values([
    { userId: adminId, tokenHash: "t1", mfaVerified: true, expiresAt: addMinutes(new Date(), 60) },
    { userId: adminId, tokenHash: "t2", mfaVerified: true, expiresAt: addMinutes(new Date(), 60) },
  ]);
});

describe("admin:reset", () => {
  it("sets a strong temporary password, clears 2FA, revokes sessions and audits it", async () => {
    const [before] = await db.select().from(adminUsers);
    const r = await resetAdmin(db, { email: before.email.toUpperCase(), reset2fa: true, operator: "ops" });
    expect(r.temporaryPassword).toMatch(/^[A-Z2-9]{5}(-[A-Z2-9]{5}){3}$/);
    expect(r.sessionsRevoked).toBe(2);

    const [after] = await db.select().from(adminUsers);
    expect(await bcrypt.compare(r.temporaryPassword, after.passwordHash)).toBe(true);
    expect(await bcrypt.compare("change-me-now", after.passwordHash)).toBe(false);
    expect(after).toMatchObject({ totpEnabled: false, totpSecretEnc: null, recoveryCodesHash: [] });
    expect(await db.select().from(adminSessions)).toHaveLength(0);

    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "auth.admin_reset"));
    expect(log).toMatchObject({ actor: "cli:ops", entityId: adminId });
  });

  it("without --reset-2fa keeps two-factor enrolled", async () => {
    const [u] = await db.select().from(adminUsers);
    await resetAdmin(db, { email: u.email, reset2fa: false });
    const [after] = await db.select().from(adminUsers);
    expect(after.totpEnabled).toBe(true);
    expect(after.recoveryCodesHash).toEqual(["h1", "h2"]);
  });

  it("refuses an unknown email", async () => {
    await expect(resetAdmin(db, { email: "nobody@example.com", reset2fa: true })).rejects.toThrow(/No admin account/);
  });
});
