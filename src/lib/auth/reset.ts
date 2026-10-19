/**
 * Break-glass admin recovery (PRE-DEPLOY-FIXES #9). Only reachable from the command line with database access
 * (`npm run admin:reset`); there is deliberately no web route for it.
 */
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { adminSessions, adminUsers } from "@/db/schema";
import { audit } from "@/lib/audit";
import { friendlyCode } from "@/lib/crypto";

export type ResetResult = { email: string; temporaryPassword: string; twoFactorCleared: boolean; sessionsRevoked: number };

export async function resetAdmin(db: Db, opts: { email: string; reset2fa: boolean; operator?: string }): Promise<ResetResult> {
  const email = opts.email.trim().toLowerCase();
  const [user] = await db.select().from(adminUsers).where(eq(sql`lower(${adminUsers.email})`, email));
  if (!user) throw new Error(`No admin account with email ${email}`);

  // 20 random characters from an unambiguous alphabet (~100 bits), e.g. "K7Q2M-9XWD4-PL3HT-R8ZNB".
  const temporaryPassword = friendlyCode(4, 5);
  await db
    .update(adminUsers)
    .set({
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
      ...(opts.reset2fa ? { totpEnabled: false, totpSecretEnc: null, recoveryCodesHash: [] } : {}),
    })
    .where(eq(adminUsers.id, user.id));
  const revoked = await db.delete(adminSessions).where(eq(adminSessions.userId, user.id)).returning({ id: adminSessions.id });
  await audit(db, {
    actor: `cli:${opts.operator ?? "unknown"}`,
    action: "auth.admin_reset",
    entityType: "admin",
    entityId: user.id,
    meta: { email, reset2fa: opts.reset2fa, sessionsRevoked: revoked.length },
  });
  return { email: user.email, temporaryPassword, twoFactorCleared: opts.reset2fa, sessionsRevoked: revoked.length };
}
