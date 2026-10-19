"use server";

/**
 * Dashboard mutations. Every action re-verifies the admin session + 2FA (requireAdmin), writes to the audit log,
 * and refreshes the router. Changes to services/settings also expire the public "catalog" cache.
 */
import { and, eq, sql } from "drizzle-orm";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { business } from "@config/business";
import { getDb } from "@/db/client";
import {
  blockedTimes,
  bookings,
  clients,
  discountCodes,
  enquiries,
  notificationTemplates,
  services,
  vouchers,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { changePassword, requireAdmin } from "@/lib/auth";
import { BookingError } from "@/lib/booking/errors";
import { cancelBooking, createAdminBooking, markOutcome, rescheduleBooking } from "@/lib/booking/service";
import { encrypt } from "@/lib/crypto";
import { createPaymentLink } from "@/lib/payment-links";
import { refundPayment } from "@/lib/payments/handlers";
import { saveSetting } from "@/lib/settings";
import { settingsSchemas, type SettingKey } from "@/lib/settings-schema";
import { localToUtc } from "@/lib/time";
import { addMonths, createVoucher, normaliseCode } from "@/lib/vouchers";

export type ActionResult = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

async function act(fn: (admin: Awaited<ReturnType<typeof requireAdmin>>) => Promise<string | void | { message?: string; data?: unknown }>): Promise<ActionResult> {
  const admin = await requireAdmin();
  try {
    const r = await fn(admin);
    refresh();
    return typeof r === "string" ? { ok: true, message: r } : { ok: true, ...(r ?? {}) };
  } catch (err) {
    if (err instanceof BookingError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (err && typeof err === "object" && "digest" in err) throw err; // redirect()
    console.error("[admin]", err);
    return { ok: false, error: (err as Error).message || "Something went wrong." };
  }
}

/* ---------------------------------------------------------------- bookings */

export async function markOutcomeAction(bookingId: string, outcome: "attended" | "no_show" | "late_cancelled", chargeFee: boolean) {
  return act(async (admin) => {
    const db = await getDb();
    const r = await markOutcome(db, bookingId, outcome, { adminEmail: admin.email, chargeFee });
    return outcome === "attended" ? "Marked as attended." : `Marked as ${outcome.replace("_", "-")}.${r.feeCharged ? ` Fee of £${(r.feeCharged / 100).toFixed(2)} retained/charged.` : ""}`;
  });
}

export async function cancelBookingAction(bookingId: string, opts: { applyPolicy: boolean; reason: string }) {
  return act(async (admin) => {
    const db = await getDb();
    const r = await cancelBooking(db, bookingId, { actor: "admin", adminEmail: admin.email, waiveFee: !opts.applyPolicy, reason: opts.reason || "admin_cancelled" });
    return `Cancelled. Refunded £${(r.refundedPence / 100).toFixed(2)}.`;
  });
}

export async function rescheduleAction(bookingId: string, date: string, time: string) {
  return act(async (admin) => {
    const db = await getDb();
    await rescheduleBooking(db, bookingId, localToUtc(date, time), { actor: "admin", adminEmail: admin.email });
    return "Rescheduled. The client has been emailed.";
  });
}

export async function refundAction(paymentId: string, pounds: number, reason: string) {
  return act(async (admin) => {
    const db = await getDb();
    const amount = Math.round(pounds * 100);
    if (amount <= 0) throw new BookingError("invalid", "Enter an amount.");
    const r = await refundPayment(db, paymentId, amount, { reason: reason || "manual", automatic: false, actor: admin.email });
    return `Refunded £${(r / 100).toFixed(2)}.`;
  });
}

export async function saveBookingNotesAction(bookingId: string, notes: string, clinical?: string) {
  return act(async (admin) => {
    const db = await getDb();
    await db
      .update(bookings)
      .set({
        adminNotesEnc: notes ? encrypt(notes) : null,
        ...(clinical !== undefined ? { clinicalNotesEnc: clinical ? encrypt(clinical) : null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));
    await audit(db, { actor: admin.email, action: "booking.notes", entityType: "booking", entityId: bookingId });
    return "Notes saved.";
  });
}

const manualSchema = z.object({
  clientId: z.string().uuid().optional().or(z.literal("")),
  newFirstName: z.string().optional(),
  newLastName: z.string().optional(),
  newEmail: z.string().optional(),
  newPhone: z.string().optional(),
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  locationType: z.enum(["clinic", "home"]),
  price: z.coerce.number().min(0),
  payment: z.enum(["in_clinic", "payment_link", "saved_card", "already_paid"]),
  notes: z.string().optional(),
});

export async function createManualBookingAction(input: z.input<typeof manualSchema>) {
  return act(async (admin) => {
    const db = await getDb();
    const p = manualSchema.parse(input);
    let clientId = p.clientId || "";
    if (!clientId) {
      if (!p.newFirstName || !p.newLastName || !p.newEmail) throw new BookingError("invalid", "Choose a client or enter a new client's name and email.");
      const email = p.newEmail.trim().toLowerCase();
      const [existing] = await db.select().from(clients).where(eq(sql`lower(${clients.email})`, email));
      clientId =
        existing?.id ??
        (await db.insert(clients).values({ firstName: p.newFirstName, lastName: p.newLastName, email, phone: p.newPhone || null }).returning())[0].id;
    }
    const startsAt = localToUtc(p.date, p.time);
    const pricePence = Math.round(p.price * 100);
    const r = await createAdminBooking(db, {
      serviceId: p.serviceId,
      startsAt,
      clientId,
      adminEmail: admin.email,
      locationType: p.locationType,
      pricePence,
      payment: p.payment,
      notes: p.notes,
      allowOutsideHours: true,
    });
    if (r.needsPaymentLink) {
      const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
      const [svc] = await db.select().from(services).where(eq(services.id, p.serviceId));
      // Re-use the held booking for the link.
      const { link } = await createPaymentLink(db, {
        adminEmail: admin.email,
        amountPence: pricePence,
        description: svc.name,
        recipientName: `${c.firstName} ${c.lastName}`,
        recipientEmail: c.email,
        clientId,
        locationType: p.locationType,
      });
      const { paymentLinks } = await import("@/db/schema");
      await db.update(paymentLinks).set({ bookingId: r.booking.id, serviceId: p.serviceId, startsAt }).where(eq(paymentLinks.id, link.id));
    }
    redirect(`/admin/bookings/${r.booking.id}`);
  });
}

export async function addTimeOffAction(input: { startDate: string; startTime: string; endDate: string; endTime: string; reason: string }) {
  return act(async (admin) => {
    const db = await getDb();
    const startsAt = localToUtc(input.startDate, input.startTime || "00:00");
    const endsAt = localToUtc(input.endDate, input.endTime || "23:59");
    if (endsAt <= startsAt) throw new BookingError("invalid", "End must be after start.");
    const [row] = await db.insert(blockedTimes).values({ practitionerId: business.practitioner.id, startsAt, endsAt, reason: input.reason || "Time off" }).returning();
    await audit(db, { actor: admin.email, action: "timeoff.add", entityType: "blocked_time", entityId: row.id });
    return "Time blocked out.";
  });
}

export async function removeTimeOffAction(id: string) {
  return act(async (admin) => {
    const db = await getDb();
    await db.delete(blockedTimes).where(and(eq(blockedTimes.id, id), eq(blockedTimes.source, "manual")));
    await audit(db, { actor: admin.email, action: "timeoff.remove", entityType: "blocked_time", entityId: id });
    return "Removed.";
  });
}

/* ----------------------------------------------------------------- clients */

export async function updateClientAction(clientId: string, input: { notes?: string; tags?: string; marketingOptIn?: boolean; phone?: string; email?: string }) {
  return act(async (admin) => {
    const db = await getDb();
    await db
      .update(clients)
      .set({
        ...(input.notes !== undefined ? { adminNotesEnc: input.notes ? encrypt(input.notes) : null } : {}),
        ...(input.tags !== undefined ? { tags: input.tags.split(",").map((t) => t.trim()).filter(Boolean) } : {}),
        ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn, marketingOptInAt: input.marketingOptIn ? new Date() : null } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.email ? { email: input.email.trim().toLowerCase() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(clients.id, clientId));
    await audit(db, { actor: admin.email, action: "client.update", entityType: "client", entityId: clientId, meta: { fields: Object.keys(input) } });
    return "Saved.";
  });
}

/** UK GDPR erasure: anonymise the person, delete health data; keep financial records (legal obligation). */
export async function eraseClientAction(clientId: string, confirmEmail: string) {
  return act(async (admin) => {
    const db = await getDb();
    const [c] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!c || c.email.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw new BookingError("invalid", "Type the client's email to confirm.");
    const { intakeForms, clientOtps } = await import("@/db/schema");
    await db.transaction(async (tx) => {
      await tx.delete(intakeForms).where(eq(intakeForms.clientId, clientId));
      await tx.delete(clientOtps).where(eq(clientOtps.clientId, clientId));
      await tx
        .update(bookings)
        .set({ adminNotesEnc: null, clinicalNotesEnc: null, clientNotes: null, homeAddressEnc: null })
        .where(eq(bookings.clientId, clientId));
      await tx
        .update(clients)
        .set({
          firstName: "Erased",
          lastName: "Client",
          email: `erased-${clientId}@invalid.local`,
          phone: null,
          dob: null,
          emergencyContactEnc: null,
          sport: null,
          trainingLevel: null,
          goals: null,
          adminNotesEnc: null,
          marketingOptIn: false,
          marketingOptInAt: null,
          tags: [],
          archivedAt: new Date(),
        })
        .where(eq(clients.id, clientId));
    });
    await audit(db, { actor: admin.email, action: "client.erase", entityType: "client", entityId: clientId });
    redirect("/admin/clients");
  });
}

/* ---------------------------------------------------------------- vouchers */

export async function createVoucherAction(input: { pounds: number; minutes?: number; recipientName?: string; recipientEmail?: string; code?: string; expiresOn?: string }) {
  return act(async (admin) => {
    const db = await getDb();
    const v = await createVoucher(db, {
      valuePence: Math.round(input.pounds * 100),
      minutes: input.minutes || null,
      expiresAt: input.expiresOn ? localToUtc(input.expiresOn, "23:59") : addMonths(new Date(), 12),
      source: "admin",
      status: "active",
      code: input.code?.trim() || undefined,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail,
    });
    await audit(db, { actor: admin.email, action: "voucher.create", entityType: "voucher", entityId: v.id });
    return { message: `Voucher ${v.code} created.`, data: v.code };
  });
}

/**
 * Import vouchers already sold via Calendly. CSV: code,value_pounds,expires(YYYY-MM-DD),recipient_name,recipient_email,minutes
 * Existing codes are skipped (idempotent).
 */
export async function importVouchersAction(csv: string) {
  return act(async (admin) => {
    const db = await getDb();
    const { importVoucherCsv } = await import("@/lib/voucher-import");
    const r = await importVoucherCsv(db, csv);
    await audit(db, { actor: admin.email, action: "voucher.import", entityType: "voucher", meta: r });
    return `Imported ${r.imported}, skipped ${r.skipped}${r.errors.length ? `, ${r.errors.length} errors: ${r.errors.slice(0, 3).join("; ")}` : ""}.`;
  });
}

export async function voidVoucherAction(id: string) {
  return act(async (admin) => {
    const db = await getDb();
    await db.update(vouchers).set({ status: "void" }).where(eq(vouchers.id, id));
    await audit(db, { actor: admin.email, action: "voucher.void", entityType: "voucher", entityId: id });
    return "Voucher voided.";
  });
}

/* --------------------------------------------------------------- enquiries */

export async function quoteEnquiryAction(enquiryId: string, input: { pounds: number; date?: string; time?: string; serviceId: string }) {
  return act(async (admin) => {
    const db = await getDb();
    const [e] = await db.select().from(enquiries).where(eq(enquiries.id, enquiryId));
    if (!e) throw new BookingError("not_found", "Enquiry not found.");
    const [svc] = await db.select().from(services).where(eq(services.id, input.serviceId));
    const email = e.email.toLowerCase();
    const [existing] = await db.select().from(clients).where(eq(sql`lower(${clients.email})`, email));
    const [first, ...rest] = e.name.split(" ");
    const clientId = existing?.id ?? (await db.insert(clients).values({ firstName: first, lastName: rest.join(" ") || "-", email, phone: e.phone, isDemo: e.isDemo }).returning())[0].id;
    const { url } = await createPaymentLink(db, {
      adminEmail: admin.email,
      amountPence: Math.round(input.pounds * 100),
      description: `${svc?.name ?? "Home visit"} (home visit)`,
      recipientName: e.name,
      recipientEmail: e.email,
      clientId,
      serviceId: input.date && input.time ? input.serviceId : null,
      startsAt: input.date && input.time ? localToUtc(input.date, input.time) : null,
      locationType: "home",
      enquiryId,
    });
    return { message: "Quote sent with a secure payment link.", data: url };
  });
}

export async function setEnquiryStatusAction(id: string, status: "new" | "quoted" | "booked" | "closed") {
  return act(async () => {
    const db = await getDb();
    await db.update(enquiries).set({ status }).where(eq(enquiries.id, id));
  });
}

/* ---------------------------------------------------------------- settings */

export async function saveSettingAction(key: SettingKey, json: string) {
  return act(async (admin) => {
    const db = await getDb();
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      throw new BookingError("invalid", "That isn't valid JSON.");
    }
    settingsSchemas[key].parse(value);
    await saveSetting(db, key, value);
    await audit(db, { actor: admin.email, action: "settings.update", entityType: "setting", entityId: key });
    updateTag("catalog");
    return "Saved.";
  });
}

const serviceEdit = z.object({
  name: z.string().min(2),
  shortName: z.string().min(2),
  price: z.coerce.number().min(0),
  durationMin: z.coerce.number().int().min(5).max(480),
  bufferMin: z.coerce.number().int().min(0).max(60),
  active: z.boolean(),
  featured: z.boolean(),
  runsConcurrently: z.boolean(),
  availableAtHome: z.boolean(),
  paymentModel: z.enum(["", "full", "deposit", "card_on_file"]),
  depositPercent: z.coerce.number().int().min(0).max(100).optional(),
  taxRateBp: z.coerce.number().int().min(0).max(10000).optional(),
});

export async function saveServiceAction(id: string, input: z.input<typeof serviceEdit>) {
  return act(async (admin) => {
    const db = await getDb();
    const p = serviceEdit.parse(input);
    await db
      .update(services)
      .set({
        name: p.name,
        shortName: p.shortName,
        pricePence: Math.round(p.price * 100),
        durationMin: p.durationMin,
        bufferMin: p.bufferMin,
        active: p.active,
        featured: p.featured,
        runsConcurrently: p.runsConcurrently,
        availableAtHome: p.availableAtHome,
        paymentModel: p.paymentModel || null,
        depositPercent: p.depositPercent ?? null,
        taxRateBp: p.taxRateBp ?? null,
        placeholder: false,
        placeholderNote: null,
        updatedAt: new Date(),
      })
      .where(eq(services.id, id));
    await audit(db, { actor: admin.email, action: "service.update", entityType: "service", entityId: id, meta: p });
    updateTag("catalog");
    return "Service saved. Remember to copy confirmed values into config/seed-settings.ts so a future apply:client-details keeps them.";
  });
}

export async function saveTemplateAction(key: string, input: { subject?: string; body: string; enabled: boolean }) {
  return act(async (admin) => {
    const db = await getDb();
    await db
      .update(notificationTemplates)
      .set({ subject: input.subject ?? null, body: input.body, enabled: input.enabled, updatedAt: new Date() })
      .where(eq(notificationTemplates.key, key));
    await audit(db, { actor: admin.email, action: "template.update", entityType: "template", entityId: key });
    return "Template saved.";
  });
}

export async function saveDiscountAction(input: { code: string; kind: "percent" | "fixed"; value: number; maxUses?: number | null; validTo?: string; serviceIds?: string[] }) {
  return act(async (admin) => {
    const db = await getDb();
    const code = normaliseCode(input.code);
    if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw new BookingError("invalid", "Codes are 3–30 letters, numbers or dashes.");
    const value = input.kind === "percent" ? Math.round(input.value) : Math.round(input.value * 100);
    await db
      .insert(discountCodes)
      .values({ code, kind: input.kind, value, maxUses: input.maxUses || null, validTo: input.validTo ? localToUtc(input.validTo, "23:59") : null, serviceIds: input.serviceIds ?? [] })
      .onConflictDoNothing();
    await audit(db, { actor: admin.email, action: "discount.create", entityType: "discount", entityId: code });
    return `Code ${code} created.`;
  });
}

export async function toggleDiscountAction(id: string, active: boolean) {
  return act(async () => {
    const db = await getDb();
    await db.update(discountCodes).set({ active }).where(eq(discountCodes.id, id));
  });
}

export async function changePasswordAction(current: string, next: string) {
  return act(async (admin) => {
    const r = await changePassword(admin.id, current, next);
    if (!r.ok) throw new BookingError("invalid", r.error!);
    redirect("/admin/login");
  });
}

export async function disconnectCalendarAction() {
  return act(async (admin) => {
    const db = await getDb();
    const { calendarConnections } = await import("@/db/schema");
    await db.delete(calendarConnections);
    await db.delete(blockedTimes).where(eq(blockedTimes.source, "google"));
    await audit(db, { actor: admin.email, action: "calendar.disconnect", entityType: "calendar" });
    return "Google Calendar disconnected.";
  });
}

/* ------------------------------------------------- packages (feature flag) */

export async function savePackageAction(input: { id: string; name: string; serviceId: string; credits: number; pounds: number; validityDays: number }) {
  return act(async (admin) => {
    const db = await getDb();
    const { packages } = await import("@/db/schema");
    const id = input.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!id || !input.name) throw new BookingError("invalid", "ID and name are required.");
    const values = { id, name: input.name, serviceId: input.serviceId || null, credits: input.credits, pricePence: Math.round(input.pounds * 100), validityDays: input.validityDays, active: true };
    await db.insert(packages).values(values).onConflictDoUpdate({ target: packages.id, set: values });
    await audit(db, { actor: admin.email, action: "package.save", entityType: "package", entityId: id });
    updateTag("catalog");
    return "Package saved.";
  });
}
