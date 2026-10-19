/**
 * Admin auth (DECISIONS.md #2): bcrypt password + mandatory TOTP 2FA, DB-backed sessions in an httpOnly cookie.
 * Everything auth-related lives in this folder so it can be swapped for Supabase Auth later.
 */
import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { connection } from "next/server";
import * as OTPAuth from "otpauth";
import { business } from "@config/business";
import { getDb } from "@/db/client";
import { adminSessions, adminUsers, type AdminUser } from "@/db/schema";
import { decrypt, encrypt, friendlyCode, randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureAdminUser } from "./bootstrap";

export const SESSION_COOKIE = "cw_admin";

let _dummy: string | null = null;
const dummyHash = () => (_dummy ??= bcrypt.hashSync("timing-equaliser", 12));
const SESSION_HOURS = 12;

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(email: string, password: string): Promise<{ ok: true; needsMfa: boolean; needsEnrol: boolean } | { ok: false; error: string }> {
  const db = await getDb();
  await ensureAdminUser(db);
  const ip = await clientIp();
  const rl = await checkRateLimit(db, `login:${ip}`, { limit: 8, windowSec: 900 });
  if (!rl.ok) return { ok: false, error: "Too many attempts. Try again in 15 minutes." };

  const [user] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.trim().toLowerCase()));
  // Compare against a dummy hash when the user doesn't exist to keep timing uniform.
  const ok = await bcrypt.compare(password, user?.passwordHash ?? dummyHash());
  if (!user || !ok) {
    await audit(db, { actor: email, action: "auth.login_failed", entityType: "admin", ip });
    return { ok: false, error: "Email or password is incorrect." };
  }
  const token = randomToken();
  const h = await headers();
  await db.insert(adminSessions).values({
    userId: user.id,
    tokenHash: sha256(token),
    mfaVerified: false,
    ip,
    userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    expiresAt: new Date(Date.now() + SESSION_HOURS * 3_600_000),
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true, needsMfa: user.totpEnabled, needsEnrol: !user.totpEnabled };
}

/** Deduplicated per request (React cache), so every page and data function can check auth for one DB query. */
export const currentSession = cache(async function currentSession() {
  await connection(); // always per-request (never prerendered)
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ s: adminSessions, u: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
    .where(and(eq(adminSessions.tokenHash, sha256(token)), gt(adminSessions.expiresAt, new Date())));
  return row ?? null;
});

/**
 * Use at the top of EVERY admin page's data component, server action and admin data function — never rely on the
 * layout (layouts and pages render in parallel; layouts don't re-run on client navigation). Redirects unless the
 * session is valid AND 2FA is complete.
 */
export async function requireAdmin(): Promise<AdminUser> {
  const s = await currentSession();
  if (!s) redirect("/admin/login");
  if (!s.u.totpEnabled) redirect("/admin/login/setup-2fa");
  if (!s.s.mfaVerified) redirect("/admin/login/2fa");
  return s.u;
}

function totpFor(user: Pick<AdminUser, "email">, secret: OTPAuth.Secret) {
  return new OTPAuth.TOTP({ issuer: business.name, label: user.email, algorithm: "SHA1", digits: 6, period: 30, secret });
}

export async function startTotpEnrolment() {
  const s = await currentSession();
  if (!s) redirect("/admin/login");
  const db = await getDb();
  let secretB32: string;
  if (s.u.totpSecretEnc && !s.u.totpEnabled) secretB32 = decrypt(s.u.totpSecretEnc);
  else {
    secretB32 = new OTPAuth.Secret({ size: 20 }).base32;
    await db.update(adminUsers).set({ totpSecretEnc: encrypt(secretB32) }).where(eq(adminUsers.id, s.u.id));
  }
  const totp = totpFor(s.u, OTPAuth.Secret.fromBase32(secretB32));
  return { uri: totp.toString(), secret: secretB32 };
}

export async function verifyTotp(code: string, opts: { enrol: boolean }): Promise<{ ok: boolean; recoveryCodes?: string[]; error?: string }> {
  const s = await currentSession();
  if (!s) return { ok: false, error: "Session expired. Please sign in again." };
  const db = await getDb();
  const ip = await clientIp();
  const rl = await checkRateLimit(db, `totp:${s.u.id}`, { limit: 10, windowSec: 900 });
  if (!rl.ok) return { ok: false, error: "Too many attempts. Try again later." };
  if (!s.u.totpSecretEnc) return { ok: false, error: "2FA is not set up." };

  const clean = code.replace(/\s/g, "").toUpperCase();
  let valid = false;
  if (/^\d{6}$/.test(clean)) {
    const totp = totpFor(s.u, OTPAuth.Secret.fromBase32(decrypt(s.u.totpSecretEnc)));
    valid = totp.validate({ token: clean, window: 1 }) !== null;
  } else if (!opts.enrol) {
    // Recovery code (single use).
    const h = sha256(clean);
    if (s.u.recoveryCodesHash.includes(h)) {
      valid = true;
      await db.update(adminUsers).set({ recoveryCodesHash: s.u.recoveryCodesHash.filter((x) => x !== h) }).where(eq(adminUsers.id, s.u.id));
    }
  }
  if (!valid) {
    await audit(db, { actor: s.u.email, action: "auth.2fa_failed", entityType: "admin", ip });
    return { ok: false, error: "That code didn't work. Check your authenticator app and try again." };
  }

  let recoveryCodes: string[] | undefined;
  if (opts.enrol) {
    recoveryCodes = Array.from({ length: 8 }, () => friendlyCode(2, 5));
    await db.update(adminUsers).set({ totpEnabled: true, recoveryCodesHash: recoveryCodes.map(sha256) }).where(eq(adminUsers.id, s.u.id));
  }
  await db.update(adminSessions).set({ mfaVerified: true }).where(eq(adminSessions.id, s.s.id));
  await db.update(adminUsers).set({ previousLoginAt: s.u.lastLoginAt, lastLoginAt: new Date() }).where(eq(adminUsers.id, s.u.id));
  await audit(db, { actor: s.u.email, action: opts.enrol ? "auth.2fa_enrolled" : "auth.login", entityType: "admin", ip });
  return { ok: true, recoveryCodes };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function changePassword(userId: string, current: string, next: string) {
  const db = await getDb();
  const [u] = await db.select().from(adminUsers).where(eq(adminUsers.id, userId));
  if (!u || !(await bcrypt.compare(current, u.passwordHash))) return { ok: false, error: "Current password is incorrect." };
  if (next.length < 12) return { ok: false, error: "Use at least 12 characters." };
  await db.update(adminUsers).set({ passwordHash: await bcrypt.hash(next, 12) }).where(eq(adminUsers.id, userId));
  await db.delete(adminSessions).where(eq(adminSessions.userId, userId));
  await audit(db, { actor: u.email, action: "auth.password_changed", entityType: "admin" });
  return { ok: true };
}
