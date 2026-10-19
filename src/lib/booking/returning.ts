/**
 * Returning clients: prove email ownership with a 6-digit code, then their details + last intake are prefilled
 * ("anything changed?"). Responses never reveal whether an email is on file (no account enumeration).
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clientOtps, clients, intakeForms } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decryptJson, hmacSign, safeEqual, sha256 } from "@/lib/crypto";
import { enqueue } from "@/lib/notifications/queue";
import type { Intake } from "./intake";

const CODE_MINUTES = 10;
const TOKEN_MINUTES = 60;

export async function requestReturningCode(db: Db, email: string, now = new Date()) {
  const [c] = await db.select().from(clients).where(eq(sql`lower(${clients.email})`, email.trim().toLowerCase()));
  if (!c) return; // same response either way
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(clientOtps).values({ clientId: c.id, codeHash: sha256(`${c.id}:${code}`), expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000) });
  await enqueue(db, { templateKey: "returning_code", to: c.email, clientId: c.id, vars: { code, clientFirstName: c.firstName } });
}

export type ReturningPrefill = {
  details: { firstName: string; lastName: string; email: string; phone: string; dob: string };
  intake: Partial<Intake> | null;
};

export async function verifyReturningCode(db: Db, email: string, code: string, now = new Date()): Promise<{ ok: true; token: string; prefill: ReturningPrefill } | { ok: false; error: string }> {
  const fail = { ok: false as const, error: "That code isn't right or has expired. Request a new one, or continue as a new client." };
  const [c] = await db.select().from(clients).where(eq(sql`lower(${clients.email})`, email.trim().toLowerCase()));
  if (!c) return fail;
  const [otp] = await db
    .select()
    .from(clientOtps)
    .where(and(eq(clientOtps.clientId, c.id), isNull(clientOtps.usedAt), gt(clientOtps.expiresAt, now)))
    .orderBy(desc(clientOtps.createdAt))
    .limit(1);
  if (!otp || otp.attempts >= 5) return fail;
  if (!safeEqual(otp.codeHash, sha256(`${c.id}:${code.trim()}`))) {
    await db.update(clientOtps).set({ attempts: otp.attempts + 1 }).where(eq(clientOtps.id, otp.id));
    return fail;
  }
  await db.update(clientOtps).set({ usedAt: now }).where(eq(clientOtps.id, otp.id));

  const [last] = await db.select().from(intakeForms).where(eq(intakeForms.clientId, c.id)).orderBy(desc(intakeForms.createdAt)).limit(1);
  const data = decryptJson<{ intake: Intake | null }>(last?.dataEnc);
  const emergency = decryptJson<{ name: string; phone: string; relationship: string }>(c.emergencyContactEnc);
  const intake: Partial<Intake> | null = data?.intake
    ? { ...data.intake, redFlags: undefined }
    : {
        emergencyName: emergency?.name ?? "",
        emergencyPhone: emergency?.phone ?? "",
        emergencyRelationship: emergency?.relationship ?? "",
        sport: c.sport ?? "",
        goals: c.goals ?? "",
      };
  await audit(db, { actor: "client", action: "client.returning_verified", entityType: "client", entityId: c.id });
  return {
    ok: true,
    token: signClientToken(c.id, now),
    prefill: {
      details: { firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone ?? "", dob: c.dob ?? "" },
      intake,
    },
  };
}

export function signClientToken(clientId: string, now = new Date()) {
  const exp = now.getTime() + TOKEN_MINUTES * 60_000;
  return `${clientId}.${exp}.${hmacSign(`returning:${clientId}.${exp}`)}`;
}

export function verifyClientToken(token: string | null | undefined, now = new Date()): string | null {
  if (!token) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig || Number(exp) < now.getTime()) return null;
  return safeEqual(sig, hmacSign(`returning:${id}.${exp}`)) ? id : null;
}
