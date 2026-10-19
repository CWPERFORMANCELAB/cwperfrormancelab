"use server";

import { headers } from "next/headers";
import { getDb } from "@/db/client";
import { BookingError } from "@/lib/booking/errors";
import { cancelBooking, findByManageToken, rescheduleBooking } from "@/lib/booking/service";
import { checkRateLimit } from "@/lib/rate-limit";

async function guard() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const db = await getDb();
  const r = await checkRateLimit(db, `manage:${ip}`, { limit: 20, windowSec: 600 });
  if (!r.ok) throw new BookingError("invalid", "Too many requests. Please try again shortly.");
  return db;
}

export async function cancelByToken(token: string) {
  try {
    const db = await guard();
    const row = await findByManageToken(db, token);
    if (!row) throw new BookingError("not_found", "Booking not found.");
    const r = await cancelBooking(db, row.b.id, { actor: "client" });
    return { ok: true as const, refunded: r.refundedPence, fee: r.feePence };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingError ? err.message : "Something went wrong. Please contact us." };
  }
}

export async function rescheduleByToken(token: string, startsAtIso: string) {
  try {
    const db = await guard();
    const row = await findByManageToken(db, token);
    if (!row) throw new BookingError("not_found", "Booking not found.");
    await rescheduleBooking(db, row.b.id, new Date(startsAtIso), { actor: "client", manageToken: token });
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingError ? err.message : "Something went wrong. Please contact us." };
  }
}

export async function slotsForReschedule(token: string, fromIso: string) {
  try {
    const db = await guard();
    const row = await findByManageToken(db, token);
    if (!row) throw new BookingError("not_found", "Booking not found.");
    const { availabilityForRange } = await import("@/lib/availability");
    const { loadSettings } = await import("@/lib/settings");
    const days = await availabilityForRange(db, {
      service: { ...row.s, bufferMin: row.b.bufferMin },
      settings: await loadSettings(db),
      fromIso,
      days: 28,
      excludeBookingId: row.b.id,
    });
    return { ok: true as const, days: days.map((d) => ({ dateIso: d.dateIso, slots: d.slots.map((s) => s.toISOString()) })) };
  } catch (err) {
    return { ok: false as const, error: err instanceof BookingError ? err.message : "Something went wrong." };
  }
}
