"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { enquiries } from "@/db/schema";
import { alertAdmin, enqueue } from "@/lib/notifications/queue";
import { checkRateLimit, verifyTurnstile } from "@/lib/rate-limit";
import { siteUrl } from "@/lib/url";
import { BookingError } from "@/lib/booking/errors";

export type FormState = { ok: boolean; message?: string; errors?: Record<string, string> };

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Shared bot/abuse checks for public forms: honeypot, Turnstile (if configured), rate limit. */
async function guard(form: FormData, bucket: string, limit = 5): Promise<FormState | null> {
  if (String(form.get("company") ?? "").length > 0) return { ok: true, message: "Thanks!" }; // honeypot: pretend success
  const addr = await ip();
  if (!(await verifyTurnstile(form.get("cf-turnstile-response") as string | null, addr))) {
    return { ok: false, message: "Please complete the verification and try again." };
  }
  const db = await getDb();
  const rl = await checkRateLimit(db, `${bucket}:${addr}`, { limit, windowSec: 3600 });
  if (!rl.ok) return { ok: false, message: "Too many submissions. Please try again later or call us." };
  return null;
}

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const contactSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().max(30).optional().default(""),
  message: z.string().trim().min(5, "Please add a short message").max(3000),
});

export async function submitContact(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await guard(form, "contact");
  if (blocked) return blocked;
  const parsed = contactSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const [e] = await db.insert(enquiries).values({ kind: "contact", ...parsed.data }).returning();
  await alertAdmin(db, "admin_enquiry", {
    vars: { enquiryName: e.name, enquiryPostcode: "contact form", message: `${e.message}\n\nReply to: ${e.email} ${e.phone ?? ""}`, adminUrl: siteUrl(`/admin/enquiries`) },
    dedupeKey: `admin_contact:${e.id}`,
  });
  return { ok: true };
}

const homeVisitSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().trim().min(9, "Enter a phone number").max(30),
  postcode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/, "Enter a valid UK postcode"),
  serviceId: z.string().min(1, "Choose a service"),
  preferredTimes: z.string().trim().min(2, "Let me know what days/times suit you").max(500),
  message: z.string().trim().max(2000).optional().default(""),
});

export async function submitHomeVisit(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await guard(form, "homevisit");
  if (blocked) return blocked;
  const parsed = homeVisitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const db = await getDb();
  const [e] = await db.insert(enquiries).values({ kind: "home_visit", ...parsed.data }).returning();
  await enqueue(db, { templateKey: "enquiry_received", to: e.email, vars: { enquiryName: e.name.split(" ")[0] }, dedupeKey: `enquiry_ack:${e.id}` });
  await alertAdmin(db, "admin_enquiry", {
    vars: { enquiryName: e.name, enquiryPostcode: e.postcode ?? "", message: `${parsed.data.serviceId} · ${e.preferredTimes}\n${e.message ?? ""}`, adminUrl: siteUrl(`/admin/enquiries/${e.id}`) },
    dedupeKey: `admin_enquiry:${e.id}`,
  });
  return { ok: true };
}

const voucherSchema = z.object({
  productId: z.string().min(1, "Choose a voucher"),
  purchaserName: z.string().trim().min(1, "Enter your name").max(120),
  purchaserEmail: z.string().trim().email("Enter a valid email"),
  recipientName: z.string().trim().min(1, "Who's it for?").max(120),
  recipientEmail: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]).optional().default(""),
  message: z.string().trim().max(300).optional().default(""),
});

export async function buyVoucher(_: FormState, form: FormData): Promise<FormState> {
  const blocked = await guard(form, "voucher", 10);
  if (blocked) return blocked;
  const parsed = voucherSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const db = await getDb();
  let url: string;
  try {
    const { purchaseVoucher } = await import("@/lib/voucher-sales");
    ({ url } = await purchaseVoucher(db, parsed.data));
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, message: err.message };
    throw err;
  }
  redirect(url);
}
