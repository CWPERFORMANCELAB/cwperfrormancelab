import { z } from "zod";

/**
 * Intake & consent definitions. Questions live here (not in page code) so the form, the admin view and the
 * validation stay in sync. Wording is a sensible clinical default — flagged for the client's review in CLIENT_TODO.md.
 */

export const CONSENT_VERSION = "2026-10";

export { redFlagQuestions, dryCuppingContraindications, compressionContraindications, trainingLevels, referralSources } from "./questions";
import { redFlagQuestions, dryCuppingContraindications, compressionContraindications, trainingLevels, referralSources } from "./questions";

const yesNo = z.enum(["yes", "no"]);
const answers = <T extends readonly { id: string }[]>(qs: T) =>
  z.object(Object.fromEntries(qs.map((q) => [q.id, yesNo])) as { [K in T[number]["id"]]: typeof yesNo });

const phone = z
  .string()
  .trim()
  .regex(/^[+\d][\d\s()-]{8,}$/, "Enter a valid phone number");

export const detailsSchema = z.object({
  firstName: z.string().trim().min(1, "Required").max(80),
  lastName: z.string().trim().min(1, "Required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone,
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth"),
});

export const intakeSchema = z.object({
  emergencyName: z.string().trim().min(1, "Required").max(120),
  emergencyPhone: phone,
  emergencyRelationship: z.string().trim().max(60).optional().default(""),
  sport: z.string().trim().max(120).optional().default(""),
  trainingLevel: z.enum(trainingLevels).optional(),
  goals: z.string().trim().max(1000).optional().default(""),
  complaint: z.string().trim().max(2000).optional().default(""),
  history: z.string().trim().max(2000).optional().default(""),
  medications: z.string().trim().max(1000).optional().default(""),
  redFlags: answers(redFlagQuestions),
  referralSource: z.enum(referralSources).optional(),
});

export const returningSchema = z.object({
  anythingChanged: z.string().trim().max(2000).optional().default(""),
  redFlags: answers(redFlagQuestions),
});

export const consentSchema = z.object({
  treatment: z.literal(true, { error: "Please give consent to assessment and treatment" }),
  dryCupping: answers(dryCuppingContraindications).optional(),
  dryCuppingConsent: z.boolean().optional(),
  compression: answers(compressionContraindications).optional(),
  compressionConsent: z.boolean().optional(),
  guardianName: z.string().trim().max(120).optional(),
  guardianRelationship: z.string().trim().max(60).optional(),
  guardianConsent: z.boolean().optional(),
  marketingOptIn: z.boolean().default(false),
  policyAccepted: z.literal(true, { error: "Please accept the cancellation policy" }),
});

export type Details = z.infer<typeof detailsSchema>;
export type Intake = z.infer<typeof intakeSchema>;
export type Returning = z.infer<typeof returningSchema>;
export type Consent = z.infer<typeof consentSchema>;

export function ageOn(dobIso: string, on: Date): number {
  const dob = new Date(`${dobIso}T00:00:00Z`);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function hasRedFlag(flags: Record<string, "yes" | "no">): boolean {
  return Object.values(flags).some((v) => v === "yes");
}

/**
 * Consent rules for a service. Returns human-readable problems; empty = OK.
 * A "yes" to any contraindication blocks online booking for that service (safety first — they're asked to get in touch).
 */
export function consentProblems(consent: Consent, requiredConsents: string[], isMinor: boolean): string[] {
  const problems: string[] = [];
  if (requiredConsents.includes("dry_cupping")) {
    if (!consent.dryCupping) problems.push("Please answer the dry cupping safety questions.");
    else if (Object.values(consent.dryCupping).includes("yes"))
      problems.push("Based on your answers, dry cupping may not be suitable. Please get in touch so we can advise before booking.");
    else if (!consent.dryCuppingConsent) problems.push("Please consent to dry cupping.");
  }
  if (requiredConsents.includes("compression_boots")) {
    if (!consent.compression) problems.push("Please answer the compression boots safety questions.");
    else if (Object.values(consent.compression).includes("yes"))
      problems.push("Based on your answers, compression therapy may not be suitable. Please get in touch so we can advise before booking.");
    else if (!consent.compressionConsent) problems.push("Please consent to compression therapy.");
  }
  if (isMinor) {
    if (!consent.guardianName?.trim() || !consent.guardianRelationship?.trim() || !consent.guardianConsent)
      problems.push("Clients under 18 need a parent or guardian's name, relationship and consent.");
  }
  return problems;
}
