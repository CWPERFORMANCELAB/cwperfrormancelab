/**
 * Notification queue (DECISIONS.md #7). Everything is a row in `notifications`; the dispatcher renders the template
 * at send time (so reschedules and settings edits are reflected), checks the row is still relevant, then sends via
 * Resend/Twilio — or logs to the console when keys are missing.
 */
import { and, asc, eq, gt, inArray, lte, ne, sql } from "drizzle-orm";
import { business, fullAddress } from "@config/business";
import type { Db, DbOrTx } from "@/db/client";
import { bookings, clients, notificationTemplates, notifications, services } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { policySummary } from "@/lib/policy";
import { loadSettings } from "@/lib/settings";
import { addMinutes, formatLong, formatTime } from "@/lib/time";
import { mapsUrl, siteUrl } from "@/lib/url";
import { buildIcs } from "./ics";
import { renderTemplate, textToEmailHtml } from "./render";
import { sendEmail, sendSms } from "./transport";

export type EnqueueArgs = {
  templateKey: string;
  channel?: "email" | "sms";
  to: string;
  bookingId?: string | null;
  clientId?: string | null;
  scheduledFor?: Date;
  vars?: Record<string, string>;
  dedupeKey?: string;
  attachIcs?: boolean;
};

export async function enqueue(db: DbOrTx, args: EnqueueArgs) {
  const channel = args.channel ?? (args.templateKey.endsWith("_sms") ? "sms" : "email");
  const vars = { ...(args.vars ?? {}), ...(args.attachIcs ? { __attachIcs: "1" } : {}) };
  await db
    .insert(notifications)
    .values({
      channel,
      templateKey: args.templateKey,
      to: args.to,
      body: "",
      bookingId: args.bookingId ?? null,
      clientId: args.clientId ?? null,
      scheduledFor: args.scheduledFor ?? new Date(),
      vars,
      dedupeKey: args.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}

/** Cancel not-yet-sent notifications for a booking (used on cancel/reschedule before re-scheduling). */
export async function cancelPendingForBooking(db: DbOrTx, bookingId: string, keys?: string[]) {
  await db
    .update(notifications)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(notifications.bookingId, bookingId),
        eq(notifications.status, "scheduled"),
        ...(keys ? [inArray(notifications.templateKey, keys)] : []),
      ),
    );
}

/** Variables available to every template that relates to a booking. */
export async function bookingVars(db: DbOrTx, bookingId: string): Promise<Record<string, string> | null> {
  const [row] = await db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(eq(bookings.id, bookingId));
  if (!row) return null;
  const settings = await loadSettings(db);
  const { b, s, c } = row;
  const mins = Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
  return {
    serviceName: s.name,
    startLong: formatLong(b.startsAt),
    startTime: formatTime(b.startsAt),
    duration: `${mins} minutes`,
    price: formatPence(b.pricePence),
    amount: formatPence(b.paidPence + b.voucherPence),
    clientFirstName: c?.firstName ?? "there",
    clientFullName: c ? `${c.firstName} ${c.lastName}` : "A client",
    address: b.locationType === "home" ? "your home (home visit)" : fullAddress(),
    parkingNote: b.locationType === "home" ? "" : business.address.parkingNote,
    policySummary: policySummary(settings.cancellationPolicy),
    rehabVideosUrl: settings.notifications.rehabVideosUrl || siteUrl("/"),
    adminUrl: siteUrl(`/admin/bookings/${b.id}`),
  };
}

function baseVars(): Record<string, string> {
  return {
    businessName: business.name,
    practitionerName: business.practitioner.name,
    practitionerFirstName: business.practitioner.firstName,
    phone: business.contact.phone,
    email: business.contact.email,
    siteUrl: siteUrl(),
    bookUrl: siteUrl("/book"),
    mapsUrl: mapsUrl(),
    reviewUrl: business.googleReviewUrl || siteUrl("/testimonials"),
    address: fullAddress(),
    parkingNote: business.address.parkingNote,
  };
}

type Pending = typeof notifications.$inferSelect;

/** Is this queued message still relevant? (booking cancelled, client rebooked, review link missing, …) */
async function shouldSend(db: DbOrTx, n: Pending): Promise<{ ok: boolean; reason?: string }> {
  if (!n.bookingId) return { ok: true };
  const [b] = await db.select().from(bookings).where(eq(bookings.id, n.bookingId));
  if (!b) return { ok: false, reason: "booking deleted" };
  const settings = await loadSettings(db);
  const key = n.templateKey;

  if (key.startsWith("reminder") || key.startsWith("booking_confirmed")) {
    if (b.status !== "confirmed") return { ok: false, reason: `booking ${b.status}` };
    if (key === "reminder_2h_sms" && !settings.features.smsReminders) return { ok: false, reason: "sms off" };
  }
  if (key === "after_session_thanks" || key === "review_request" || key === "rebook_nudge") {
    if (!["confirmed", "attended"].includes(b.status)) return { ok: false, reason: `booking ${b.status}` };
  }
  if (key === "review_request") {
    if (!business.googleReviewUrl) return { ok: false, reason: "no review link configured" };
    if (!b.clientId) return { ok: false };
    const [{ n: earlier }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookings)
      .where(and(eq(bookings.clientId, b.clientId), inArray(bookings.status, ["attended", "confirmed"]), sql`${bookings.startsAt} < ${b.startsAt}`));
    if (earlier > 0) return { ok: false, reason: "not first visit" };
  }
  if (key === "rebook_nudge" && b.clientId) {
    const [future] = await db
      .select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.clientId, b.clientId), inArray(bookings.status, ["confirmed", "pending_payment"]), gt(bookings.startsAt, b.startsAt), ne(bookings.id, b.id)))
      .limit(1);
    if (future) return { ok: false, reason: "already rebooked" };
  }
  return { ok: true };
}

/** Send everything that is due. Safe to run concurrently-ish: rows are claimed with a status flip. */
export async function dispatchDue(db: Db, now = new Date(), limit = 50) {
  const due = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "scheduled"), lte(notifications.scheduledFor, now)))
    .orderBy(asc(notifications.scheduledFor))
    .limit(limit);

  const results: { id: string; status: string }[] = [];
  for (const n of due) {
    const check = await shouldSend(db, n);
    if (!check.ok) {
      await db.update(notifications).set({ status: "cancelled", error: check.reason ?? null }).where(eq(notifications.id, n.id));
      results.push({ id: n.id, status: "cancelled" });
      continue;
    }
    const [tpl] = await db.select().from(notificationTemplates).where(eq(notificationTemplates.key, n.templateKey));
    if (!tpl || !tpl.enabled) {
      await db.update(notifications).set({ status: "cancelled", error: "template disabled" }).where(eq(notifications.id, n.id));
      results.push({ id: n.id, status: "cancelled" });
      continue;
    }
    const vars: Record<string, string> = { ...baseVars(), ...(n.bookingId ? (await bookingVars(db, n.bookingId)) ?? {} : {}), ...n.vars };
    const body = renderTemplate(tpl.body, vars);
    const subject = tpl.subject ? renderTemplate(tpl.subject, vars) : null;

    try {
      let res: { id: string | null; logged: boolean };
      if (n.channel === "sms") {
        res = await sendSms(n.to, body);
      } else {
        const attachments: { filename: string; content: string; contentType: string }[] = [];
        if (n.vars.__attachIcs && n.bookingId) {
          const [b] = await db.select().from(bookings).where(eq(bookings.id, n.bookingId));
          if (b) {
            attachments.push({
              filename: "appointment.ics",
              contentType: "text/calendar",
              content: Buffer.from(
                buildIcs({
                  uid: b.id,
                  start: b.startsAt,
                  end: b.endsAt,
                  summary: `${vars.serviceName} with ${business.practitioner.name}`,
                  description: `${vars.parkingNote}\nManage your booking: ${vars.manageUrl ?? siteUrl()}`,
                  url: vars.manageUrl,
                  sequence: Math.floor((b.updatedAt.getTime() - b.createdAt.getTime()) / 1000),
                }),
              ).toString("base64"),
            });
          }
        }
        res = await sendEmail({ to: n.to, subject: subject ?? business.name, text: body, html: textToEmailHtml(body, { preheader: subject ?? "" }), attachments });
      }
      await db
        .update(notifications)
        .set({ status: res.logged ? "logged" : "sent", sentAt: new Date(), providerId: res.id, body, subject, attempts: n.attempts + 1, error: null })
        .where(eq(notifications.id, n.id));
      results.push({ id: n.id, status: res.logged ? "logged" : "sent" });
    } catch (err) {
      const attempts = n.attempts + 1;
      await db
        .update(notifications)
        .set({
          attempts,
          error: String((err as Error).message ?? err).slice(0, 500),
          // Exponential-ish backoff, give up after 5 attempts.
          status: attempts >= 5 ? "failed" : "scheduled",
          scheduledFor: addMinutes(now, 5 * attempts),
        })
        .where(eq(notifications.id, n.id));
      results.push({ id: n.id, status: "error" });
    }
  }
  return results;
}

/** Admin alert helper — always email to the configured admin address. */
export async function alertAdmin(db: DbOrTx, templateKey: string, args: { bookingId?: string; vars?: Record<string, string>; dedupeKey?: string }) {
  const settings = await loadSettings(db);
  await enqueue(db, { templateKey, to: settings.notifications.adminAlertEmail, bookingId: args.bookingId, vars: args.vars, dedupeKey: args.dedupeKey });
}
