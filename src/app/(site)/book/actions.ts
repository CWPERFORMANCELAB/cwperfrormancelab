"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db/client";
import { availabilityForRange } from "@/lib/availability";
import { BookingError } from "@/lib/booking/errors";
import { consentSchema, detailsSchema, intakeSchema, returningSchema } from "@/lib/booking/intake";
import { requestReturningCode, verifyClientToken, verifyReturningCode } from "@/lib/booking/returning";
import { beginCheckout, createHold, releaseHold, submitDetails } from "@/lib/booking/service";
import { formatPence } from "@/lib/money";
import { quote } from "@/lib/pricing";
import { checkRateLimit } from "@/lib/rate-limit";
import { getService, loadSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/url";

async function limit(bucket: string, max: number, windowSec = 600) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const db = await getDb();
  const r = await checkRateLimit(db, `${bucket}:${ip}`, { limit: max, windowSec });
  if (!r.ok) throw new BookingError("invalid", "Too many requests. Please wait a few minutes and try again.");
  return db;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };
async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message, code: err.code };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => i.message).join(" ") };
    console.error("[book]", err);
    return { ok: false, error: "Something went wrong. Please try again, or call us to book." };
  }
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function fetchSlots(serviceId: string, fromIso: string, days: number) {
  return run(async () => {
    const db = await limit("slots", 120);
    isoDate.parse(fromIso);
    const service = await getService(db, serviceId);
    if (!service?.active || service.archivedAt) throw new BookingError("service_unavailable", "That service isn't available.");
    const settings = await loadSettings(db);
    const out = await availabilityForRange(db, { service, settings, fromIso, days: Math.min(Math.max(days, 1), 42) });
    return out.map((d) => ({ dateIso: d.dateIso, slots: d.slots.map((s) => s.toISOString()), reason: d.reason ?? null }));
  });
}

export async function holdSlot(serviceId: string, startsAtIso: string) {
  return run(async () => {
    const db = await limit("hold", 20);
    const startsAt = new Date(startsAtIso);
    if (Number.isNaN(startsAt.getTime())) throw new BookingError("invalid", "Invalid time.");
    const { booking, holdToken } = await createHold(db, { serviceId, startsAt });
    return { bookingId: booking.id, holdToken, holdExpiresAt: booking.holdExpiresAt!.toISOString() };
  });
}

export async function releaseSlot(bookingId: string, holdToken: string) {
  return run(async () => {
    const db = await getDb();
    await releaseHold(db, bookingId, holdToken);
    return true;
  });
}

export async function requestCode(email: string) {
  return run(async () => {
    const db = await limit("otp", 5, 900);
    const e = z.string().email().parse(email.trim());
    await requestReturningCode(db, e);
    return true;
  });
}

export async function verifyCode(email: string, code: string) {
  return run(async () => {
    const db = await limit("otp-verify", 10, 900);
    const r = await verifyReturningCode(db, email, code);
    if (!r.ok) throw new BookingError("invalid", r.error);
    return { token: r.token, prefill: r.prefill };
  });
}

export async function previewQuote(serviceId: string, discountCode: string, voucherCode: string) {
  return run(async () => {
    const db = await limit("quote", 30);
    const service = await getService(db, serviceId);
    if (!service) throw new BookingError("service_unavailable", "Service not found.");
    const q = await quote(db, { service, settings: await loadSettings(db), discountCode, voucherCode, now: new Date() });
    return {
      ...q,
      display: {
        price: formatPence(q.pricePence),
        discount: q.discountPence ? `−${formatPence(q.discountPence)}` : null,
        voucher: q.voucherPence ? `−${formatPence(q.voucherPence)}` : null,
        chargeNow: formatPence(q.chargeNowPence),
        later: q.laterPence ? formatPence(q.laterPence) : null,
        voucherLeft: q.voucherBalanceAfterPence ? formatPence(q.voucherBalanceAfterPence) : null,
      },
    };
  });
}

const checkoutSchema = z.object({
  bookingId: z.string().uuid(),
  holdToken: z.string().min(10),
  details: detailsSchema,
  intake: intakeSchema.optional(),
  returning: returningSchema.optional(),
  consent: consentSchema,
  clientNotes: z.string().max(1000).optional(),
  discountCode: z.string().max(40).optional(),
  voucherCode: z.string().max(40).optional(),
  verifiedToken: z.string().optional(),
  insurer: z.object({ name: z.string().trim().min(2).max(80), authorisation: z.string().trim().min(2).max(60) }).optional(),
});

export async function checkout(input: z.input<typeof checkoutSchema>) {
  return run(async () => {
    const db = await limit("checkout", 15);
    const p = checkoutSchema.parse(input);
    const verifiedClientId = verifyClientToken(p.verifiedToken);
    const r = await submitDetails(db, p.bookingId, p.holdToken, {
      details: p.details,
      intake: p.intake,
      returning: p.returning,
      consent: p.consent,
      clientNotes: p.clientNotes,
      discountCode: p.discountCode,
      voucherCode: p.voucherCode,
      verifiedClientId,
      insurer: p.insurer ?? null,
    });
    const start = await beginCheckout(db, p.bookingId, p.holdToken);
    const url =
      start.kind === "redirect" ? start.url : siteUrl(`/book/confirmed?b=${p.bookingId}&t=${encodeURIComponent(p.holdToken)}`);
    return { url, redFlag: r.redFlag };
  });
}
