/**
 * Booking lifecycle: hold → details/intake → checkout → confirmed → attended | no_show | late_cancelled | cancelled.
 *
 * Double-booking protection is layered:
 *  1. Per-practitioner advisory lock inside the transaction (serialises daily-cap and blocked-time checks).
 *  2. Server-side re-check of the requested slot with the availability engine (never trust the client).
 *  3. The Postgres exclusion constraint `bookings_no_overlap` — rejects overlaps even if 1 and 2 were bypassed.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { business } from "@config/business";
import type { Db, DbOrTx } from "@/db/client";
import { bookings, clients, discountCodes, intakeForms, payments, services, type Booking } from "@/db/schema";
import { audit } from "@/lib/audit";
import { availabilityForRange, lockPractitioner, releaseExpiredHolds } from "@/lib/availability";
import { encryptJson, randomToken, sha256 } from "@/lib/crypto";
import { formatPence } from "@/lib/money";
import { alertAdmin, cancelPendingForBooking, enqueue } from "@/lib/notifications/queue";
import { canReschedule, clientCancellation, noShow, practitionerCancellation, type CancellationOutcome } from "@/lib/policy";
import { quote, type Quote } from "@/lib/pricing";
import { getService, loadSettings } from "@/lib/settings";
import { addMinutes, localDateOf } from "@/lib/time";
import { siteUrl } from "@/lib/url";
import { redeemVoucher, reverseRedemption } from "@/lib/vouchers";
import { BookingError, isOverlapViolation } from "./errors";
import {
  ageOn,
  CONSENT_VERSION,
  consentProblems,
  hasRedFlag,
  type Consent,
  type Details,
  type Intake,
  type Returning,
} from "./intake";

const PRACTITIONER = business.practitioner.id;

/* -------------------------------------------------------------------------- hold */

export async function createHold(
  db: Db,
  args: {
    serviceId: string;
    startsAt: Date;
    now?: Date;
    locationType?: "clinic" | "home";
    source?: Booking["source"];
    holdMinutes?: number;
    practitionerId?: string;
    skipAvailabilityCheck?: boolean; // admin override (still protected by the DB constraint)
    isDemo?: boolean;
  },
): Promise<{ booking: Booking; holdToken: string }> {
  const now = args.now ?? new Date();
  const practitionerId = args.practitionerId ?? PRACTITIONER;
  const service = await getService(db, args.serviceId);
  if (!service || !service.active || service.archivedAt) throw new BookingError("service_unavailable", "That service isn't available to book.");
  const settings = await loadSettings(db);
  const holdToken = randomToken();

  try {
    const booking = await db.transaction(async (tx) => {
      await lockPractitioner(tx, practitionerId);
      await releaseExpiredHolds(tx, now);

      if (!args.skipAvailabilityCheck) {
        const dateIso = localDateOf(args.startsAt);
        const [day] = await availabilityForRange(tx, { service, settings, fromIso: dateIso, days: 1, now, practitionerId });
        if (!day.slots.some((s) => s.getTime() === args.startsAt.getTime())) {
          throw new BookingError("slot_unavailable", "Sorry, that time has just been taken. Please choose another.");
        }
      }

      const endsAt = addMinutes(args.startsAt, service.durationMin);
      const [row] = await tx
        .insert(bookings)
        .values({
          practitionerId,
          serviceId: service.id,
          status: "pending_payment",
          source: args.source ?? "online",
          locationType: args.locationType ?? "clinic",
          startsAt: args.startsAt,
          endsAt,
          bufferMin: service.bufferMin,
          occupiedUntil: addMinutes(endsAt, service.bufferMin),
          blocksTime: !service.runsConcurrently,
          pricePence: service.pricePence,
          paymentModel: (service.paymentModel ?? settings.paymentDefaults.model) as Booking["paymentModel"],
          holdExpiresAt: addMinutes(now, args.holdMinutes ?? settings.bookingRules.holdMinutes),
          holdTokenHash: sha256(holdToken),
          isDemo: args.isDemo ?? false,
        })
        .returning();
      return row;
    });
    return { booking, holdToken };
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("slot_unavailable", "Sorry, that time has just been taken. Please choose another.");
    throw err;
  }
}

async function getHeldBooking(db: DbOrTx, bookingId: string, holdToken: string, now: Date) {
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.holdTokenHash !== sha256(holdToken)) throw new BookingError("not_found", "Booking not found.");
  if (b.status !== "pending_payment") {
    if (b.status === "confirmed") return b;
    throw new BookingError("hold_expired", "Your reserved time has expired. Please choose a time again.");
  }
  if (b.holdExpiresAt && b.holdExpiresAt <= now) throw new BookingError("hold_expired", "Your reserved time has expired. Please choose a time again.");
  return b;
}

export async function releaseHold(db: DbOrTx, bookingId: string, holdToken: string) {
  await db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: new Date(), cancelReason: "released_by_client", updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending_payment"), eq(bookings.holdTokenHash, sha256(holdToken))));
}

/* ------------------------------------------------------------- details & intake */

export type DetailsInput = {
  details: Details;
  /** Full intake for first visits. */
  intake?: Intake;
  /** Short "anything changed?" form for returning clients. */
  returning?: Returning;
  consent: Consent;
  clientNotes?: string;
  discountCode?: string | null;
  voucherCode?: string | null;
  /** Set only after the client proved email ownership (returning.ts) — allows updating their stored details. */
  verifiedClientId?: string | null;
  /** Insurer booking (insuranceBookings flag). */
  insurer?: { name: string; authorisation: string } | null;
};

/**
 * Attach client + intake + consents to a held booking and price it.
 * Privacy: an existing client record is matched by email but never overwritten from this public form (only blanks
 * are filled) — otherwise anyone could change someone else's details by typing their email.
 */
export async function submitDetails(db: Db, bookingId: string, holdToken: string, input: DetailsInput, now = new Date()) {
  const booking = await getHeldBooking(db, bookingId, holdToken, now);
  const service = (await getService(db, booking.serviceId))!;
  const settings = await loadSettings(db);

  const isMinor = ageOn(input.details.dob, booking.startsAt) < 18;
  const problems = consentProblems(input.consent, service.requiredConsents, isMinor);
  if (problems.length) throw new BookingError("invalid", problems.join(" "));
  if (!input.intake && !input.returning) throw new BookingError("invalid", "Please complete the health questions.");

  const insurer = settings.features.insuranceBookings && input.insurer?.name ? input.insurer : null;
  const q = await quote(db, { service, settings, discountCode: input.discountCode, voucherCode: input.voucherCode, insurer: Boolean(insurer), now });
  if (q.errors.discount) throw new BookingError("discount_invalid", q.errors.discount);
  if (q.errors.voucher) throw new BookingError("voucher_invalid", q.errors.voucher);

  return db.transaction(async (tx) => {
    const email = input.details.email.toLowerCase();
    const [existing] = await tx.select().from(clients).where(eq(sql`lower(${clients.email})`, email));
    let clientId: string;
    if (existing && input.verifiedClientId === existing.id) {
      // Verified returning client: their submitted details are authoritative.
      clientId = existing.id;
      await tx
        .update(clients)
        .set({
          firstName: input.details.firstName,
          lastName: input.details.lastName,
          phone: input.details.phone,
          dob: input.details.dob,
          ...(input.intake
            ? {
                sport: input.intake.sport || null,
                trainingLevel: input.intake.trainingLevel ?? null,
                goals: input.intake.goals || null,
                emergencyContactEnc: encryptJson({ name: input.intake.emergencyName, phone: input.intake.emergencyPhone, relationship: input.intake.emergencyRelationship }),
              }
            : {}),
          ...(input.consent.marketingOptIn && !existing.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(clients.id, existing.id));
    } else if (existing) {
      clientId = existing.id;
      await tx
        .update(clients)
        .set({
          phone: existing.phone ?? input.details.phone,
          dob: existing.dob ?? input.details.dob,
          sport: existing.sport ?? input.intake?.sport ?? null,
          trainingLevel: existing.trainingLevel ?? input.intake?.trainingLevel ?? null,
          goals: existing.goals ?? input.intake?.goals ?? null,
          referralSource: existing.referralSource ?? input.intake?.referralSource ?? null,
          emergencyContactEnc:
            existing.emergencyContactEnc ??
            (input.intake ? encryptJson({ name: input.intake.emergencyName, phone: input.intake.emergencyPhone, relationship: input.intake.emergencyRelationship }) : null),
          // Opting in is always honoured; opting out happens via unsubscribe or the admin.
          ...(input.consent.marketingOptIn && !existing.marketingOptIn ? { marketingOptIn: true, marketingOptInAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(clients.id, existing.id));
    } else {
      const [c] = await tx
        .insert(clients)
        .values({
          firstName: input.details.firstName,
          lastName: input.details.lastName,
          email,
          phone: input.details.phone,
          dob: input.details.dob,
          emergencyContactEnc: input.intake
            ? encryptJson({ name: input.intake.emergencyName, phone: input.intake.emergencyPhone, relationship: input.intake.emergencyRelationship })
            : null,
          sport: input.intake?.sport || null,
          trainingLevel: input.intake?.trainingLevel ?? null,
          goals: input.intake?.goals || null,
          referralSource: input.intake?.referralSource ?? null,
          marketingOptIn: input.consent.marketingOptIn,
          marketingOptInAt: input.consent.marketingOptIn ? now : null,
          isDemo: booking.isDemo,
        })
        .returning();
      clientId = c.id;
    }

    const consentRecord: Record<string, { granted: boolean; at: string; version: string }> = {
      treatment: { granted: true, at: now.toISOString(), version: CONSENT_VERSION },
      cancellation_policy: { granted: true, at: now.toISOString(), version: CONSENT_VERSION },
      marketing: { granted: input.consent.marketingOptIn, at: now.toISOString(), version: CONSENT_VERSION },
    };
    if (service.requiredConsents.includes("dry_cupping")) consentRecord.dry_cupping = { granted: true, at: now.toISOString(), version: CONSENT_VERSION };
    if (service.requiredConsents.includes("compression_boots")) consentRecord.compression_boots = { granted: true, at: now.toISOString(), version: CONSENT_VERSION };

    const redFlags = (input.intake ?? input.returning)!.redFlags;
    await tx.delete(intakeForms).where(eq(intakeForms.bookingId, booking.id)); // re-submits replace
    await tx.insert(intakeForms).values({
      clientId,
      bookingId: booking.id,
      dataEnc: encryptJson({
        kind: input.intake ? "full" : "returning",
        intake: input.intake ?? null,
        returning: input.returning ?? null,
        dryCupping: input.consent.dryCupping ?? null,
        compression: input.consent.compression ?? null,
        clientNotes: input.clientNotes ?? "",
      }),
      hasRedFlags: hasRedFlag(redFlags),
      isMinor,
      consents: consentRecord,
      guardianConsent:
        isMinor && input.consent.guardianName
          ? { name: input.consent.guardianName, relationship: input.consent.guardianRelationship ?? "", at: now.toISOString() }
          : null,
    });

    await tx
      .update(bookings)
      .set({
        clientId,
        clientNotes: input.clientNotes || null,
        pricePence: q.pricePence,
        discountPence: q.discountPence,
        discountCodeId: q.discountCodeId,
        voucherPence: q.voucherPence,
        voucherId: q.voucherId,
        packagePurchaseId: q.packagePurchaseId,
        paymentModel: q.packagePurchaseId ? "package" : insurer ? "insurer" : q.model,
        insurerName: insurer?.name ?? null,
        insurerAuthorisation: insurer?.authorisation ?? null,
        insurerBalancePence: insurer ? q.pricePence : null,
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id));

    return { clientId, quote: q, redFlag: hasRedFlag(redFlags) };
  });
}

/* --------------------------------------------------------------------- checkout */

export type CheckoutStart = { kind: "redirect"; url: string } | { kind: "confirmed"; bookingId: string; manageToken: string };

export async function beginCheckout(db: Db, bookingId: string, holdToken: string, now = new Date()): Promise<CheckoutStart> {
  const booking = await getHeldBooking(db, bookingId, holdToken, now);
  if (!booking.clientId) throw new BookingError("invalid", "Please complete your details first.");
  const service = (await getService(db, booking.serviceId))!;
  const settings = await loadSettings(db);
  const [client] = await db.select().from(clients).where(eq(clients.id, booking.clientId));

  // Re-quote server-side (prices, voucher balance, discount limits may have changed since the details step).
  const [voucherCode, discountCode] = await Promise.all([
    booking.voucherId ? db.execute(sql`select code from vouchers where id = ${booking.voucherId}`) : null,
    booking.discountCodeId ? db.select({ code: discountCodes.code }).from(discountCodes).where(eq(discountCodes.id, booking.discountCodeId)) : null,
  ]);
  const vc = voucherCode ? (rowsOf(voucherCode)[0] as { code?: string } | undefined)?.code : null;
  const q = await quote(db, {
    service,
    settings,
    voucherCode: vc,
    discountCode: discountCode?.[0]?.code,
    packagePurchaseId: booking.packagePurchaseId,
    insurer: booking.paymentModel === "insurer",
    now,
  });
  if (q.errors.voucher) throw new BookingError("voucher_invalid", q.errors.voucher);
  if (q.errors.discount) throw new BookingError("discount_invalid", q.errors.discount);

  if (q.checkout === "none") {
    const manageToken = await confirmBooking(db, booking.id, { paidPence: 0, now });
    return { kind: "confirmed", bookingId: booking.id, manageToken: manageToken! };
  }

  const { startPayment } = await import("@/lib/payments/handlers");
  // Stripe Checkout sessions last at least 30 minutes, so extend the hold to cover the payment page.
  const holdUntil = addMinutes(now, 35);
  await db.update(bookings).set({ holdExpiresAt: holdUntil, updatedAt: now }).where(eq(bookings.id, booking.id));
  const url = await startPayment(db, {
    purpose: "booking",
    bookingId: booking.id,
    clientId: client.id,
    mode: q.checkout,
    amountPence: q.chargeNowPence,
    saveCard: q.saveCard,
    kind: q.model === "deposit" ? "deposit" : q.checkout === "setup" ? "setup" : "payment",
    description: `${service.name} · ${business.name}`,
    customerEmail: client.email,
    customerName: `${client.firstName} ${client.lastName}`,
    stripeCustomerId: client.stripeCustomerId,
    successUrl: siteUrl(`/book/confirmed?b=${booking.id}&t=${encodeURIComponent(holdToken)}`),
    cancelUrl: siteUrl(`/book?resume=${booking.id}`),
    expiresAt: holdUntil,
    taxRateBp: service.taxRateBp ?? settings.paymentDefaults.defaultTaxRateBp,
  });
  return { kind: "redirect", url };
}

function rowsOf(result: unknown): unknown[] {
  const r = result as { rows?: unknown[] } | unknown[];
  return Array.isArray(r) ? r : (r.rows ?? []);
}

/* -------------------------------------------------------------------- confirm */

/**
 * Idempotent. Moves a held booking to confirmed, redeems voucher/discount, rotates the manage token and schedules
 * notifications. Returns the new raw manage token (only on the first call), or null if it was already confirmed.
 *
 * Reconciliation: if the hold expired before payment arrived, we try to re-reserve the same slot. If someone else
 * has taken it, the caller refunds (see payments/handlers.ts).
 */
export async function confirmBooking(db: Db, bookingId: string, args: { paidPence: number; now?: Date; skipNotifications?: boolean }): Promise<string | null> {
  const now = args.now ?? new Date();
  const manageToken = randomToken();
  const confirmed = await db.transaction(async (tx) => {
    await lockPractitioner(tx, PRACTITIONER);
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId));
    if (!b) throw new BookingError("not_found", "Booking not found.");
    if (b.status === "confirmed" || b.status === "attended") return null;
    if (b.status !== "pending_payment" && !(b.status === "cancelled" && b.cancelReason === "checkout_expired")) {
      throw new BookingError("invalid", `Booking is ${b.status}.`);
    }

    let voucherApplied = 0;
    if (b.voucherId && b.voucherPence > 0) {
      voucherApplied = await redeemVoucher(tx, { voucherId: b.voucherId, bookingId: b.id, amountPence: b.voucherPence, now });
    }
    if (b.packagePurchaseId) {
      const { useCredit } = await import("@/lib/packages");
      await useCredit(tx, b.packagePurchaseId, now);
    }
    if (b.discountCodeId) {
      await tx.update(discountCodes).set({ uses: sql`${discountCodes.uses} + 1` }).where(eq(discountCodes.id, b.discountCodeId));
    }
    await tx
      .update(bookings)
      .set({
        status: "confirmed",
        holdExpiresAt: null,
        cancelledAt: null,
        cancelReason: null,
        paidPence: b.paidPence + args.paidPence,
        voucherPence: voucherApplied,
        manageTokenHash: sha256(manageToken),
        updatedAt: now,
      })
      .where(eq(bookings.id, b.id));
    return b;
  });
  if (!confirmed) return null;
  if (!args.skipNotifications) await scheduleBookingNotifications(db, bookingId, manageToken, { isNew: true });
  await audit(db, { actor: "system", action: "booking.confirmed", entityType: "booking", entityId: bookingId, meta: { paidPence: args.paidPence } });
  const { pushBookingToCalendar } = await import("@/lib/calendar/google");
  await pushBookingToCalendar(db, bookingId).catch((e) => console.error("[calendar] push failed", e));
  return manageToken;
}

/* -------------------------------------------------------------- notifications */

export async function scheduleBookingNotifications(db: DbOrTx, bookingId: string, manageToken: string, opts: { isNew: boolean; rescheduled?: boolean }) {
  const [row] = await db.select({ b: bookings, c: clients }).from(bookings).leftJoin(clients, eq(clients.id, bookings.clientId)).where(eq(bookings.id, bookingId));
  if (!row?.c) return;
  const { b, c } = row;
  const settings = await loadSettings(db);
  const manageUrl = siteUrl(`/manage/${manageToken}`);
  const vars = { manageUrl };
  const stamp = b.startsAt.toISOString();
  const now = new Date();

  await cancelPendingForBooking(db, b.id, ["reminder_48h", "reminder_2h_sms", "after_session_thanks", "review_request", "rebook_nudge"]);

  if (opts.isNew || opts.rescheduled) {
    await enqueue(db, {
      templateKey: opts.rescheduled ? "booking_rescheduled" : "booking_confirmed",
      to: c.email,
      bookingId: b.id,
      clientId: c.id,
      vars,
      attachIcs: true,
      dedupeKey: `${opts.rescheduled ? "rescheduled" : "confirmed"}:${b.id}:${stamp}`,
    });
    if (settings.features.smsReminders && c.phone && !opts.rescheduled) {
      await enqueue(db, { templateKey: "booking_confirmed_sms", to: c.phone, bookingId: b.id, clientId: c.id, vars, dedupeKey: `confirmed_sms:${b.id}` });
    }
    if (opts.isNew) {
      await alertAdmin(db, "admin_new_booking", { bookingId: b.id, dedupeKey: `admin_new:${b.id}` });
    }
  }

  for (const h of settings.notifications.reminderHoursBefore) {
    const at = addMinutes(b.startsAt, -h * 60);
    if (at <= now) continue;
    if (h >= 12) {
      await enqueue(db, { templateKey: "reminder_48h", to: c.email, bookingId: b.id, clientId: c.id, scheduledFor: at, vars, dedupeKey: `reminder_${h}h:${b.id}:${stamp}` });
    } else if (settings.features.smsReminders && c.phone) {
      await enqueue(db, { templateKey: "reminder_2h_sms", to: c.phone, bookingId: b.id, clientId: c.id, scheduledFor: at, vars, dedupeKey: `reminder_${h}h:${b.id}:${stamp}` });
    }
  }

  const n = settings.notifications;
  await enqueue(db, { templateKey: "after_session_thanks", to: c.email, bookingId: b.id, clientId: c.id, scheduledFor: addMinutes(b.endsAt, n.thankYouDelayHours * 60), dedupeKey: `thanks:${b.id}:${stamp}` });
  await enqueue(db, { templateKey: "review_request", to: c.email, bookingId: b.id, clientId: c.id, scheduledFor: addMinutes(b.endsAt, n.reviewRequestDelayHours * 60), dedupeKey: `review:${b.id}:${stamp}` });
  await enqueue(db, { templateKey: "rebook_nudge", to: c.email, bookingId: b.id, clientId: c.id, scheduledFor: addMinutes(b.endsAt, n.rebookNudgeDays * 24 * 60), dedupeKey: `rebook:${b.id}:${stamp}` });
}

/* ------------------------------------------------------------- manage link */

export async function findByManageToken(db: DbOrTx, token: string) {
  const [row] = await db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(and(eq(bookings.manageTokenHash, sha256(token)), inArray(bookings.status, ["confirmed", "attended", "cancelled", "late_cancelled", "no_show"])));
  return row ?? null;
}

/* ----------------------------------------------------------------- cancel */

export type CancelResult = CancellationOutcome & { refundedPence: number; voucherRestoredPence: number; feeChargedPence: number };

export async function cancelBooking(
  db: Db,
  bookingId: string,
  args: { actor: "client" | "admin"; adminEmail?: string; reason?: string; now?: Date; waiveFee?: boolean },
): Promise<CancelResult> {
  const now = args.now ?? new Date();
  const settings = await loadSettings(db);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b) throw new BookingError("not_found", "Booking not found.");
  if (b.status !== "confirmed") throw new BookingError("invalid", "Only upcoming bookings can be cancelled.");

  // Voucher money counts as paid for policy purposes; card money is refunded first (DECISIONS.md #14).
  const paidTotal = b.paidPence + b.voucherPence;
  const basis = { startsAt: b.startsAt, pricePence: b.pricePence - b.discountPence, paidPence: paidTotal };
  const outcome = args.actor === "admin" && args.waiveFee !== false ? practitionerCancellation(basis) : clientCancellation(basis, settings.cancellationPolicy, now);
  if (!outcome.allowed) throw new BookingError("policy", outcome.reason ?? "This booking can't be cancelled online.");

  const retained = outcome.feePence - outcome.outstandingFeePence;
  const cardRetained = Math.min(b.paidPence, retained);
  const cardRefund = b.paidPence - cardRetained;
  const voucherRetained = retained - cardRetained;
  const voucherRestore = b.voucherPence - voucherRetained;

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({
        status: outcome.late ? "late_cancelled" : "cancelled",
        cancelledAt: now,
        cancelReason: args.reason ?? `${args.actor}_cancelled`,
        feeChargedPence: retained,
        updatedAt: now,
      })
      .where(eq(bookings.id, b.id));
    if (voucherRestore > 0) await reverseRedemption(tx, { bookingId: b.id, amountPence: voucherRestore, now });
    if (b.packagePurchaseId && !outcome.late) {
      const { restoreCredit } = await import("@/lib/packages");
      await restoreCredit(tx, b.packagePurchaseId);
    }
  });

  const { refundBooking, chargeFeeToSavedCard } = await import("@/lib/payments/handlers");
  let refundedPence = 0;
  if (cardRefund > 0) refundedPence = await refundBooking(db, b.id, cardRefund, { reason: "cancellation", automatic: true, actor: args.adminEmail ?? "client" });
  let feeChargedPence = 0;
  if (outcome.outstandingFeePence > 0 && b.paymentModel !== "full") {
    feeChargedPence = await chargeFeeToSavedCard(db, b.id, outcome.outstandingFeePence, "Late cancellation fee");
  }

  await cancelPendingForBooking(db, b.id);
  const refundLine =
    refundedPence > 0
      ? `A refund of ${formatPence(refundedPence)} is on its way to your card (usually 5–10 working days).`
      : outcome.feePence > 0
        ? `In line with our cancellation policy, a fee of ${formatPence(outcome.feePence)} applies.`
        : "";
  const [c] = b.clientId ? await db.select().from(clients).where(eq(clients.id, b.clientId)) : [];
  if (c) await enqueue(db, { templateKey: "booking_cancelled", to: c.email, bookingId: b.id, clientId: c.id, vars: { refundLine, manageUrl: siteUrl("/book") }, dedupeKey: `cancelled:${b.id}` });
  if (args.actor === "client") await alertAdmin(db, "admin_cancellation", { bookingId: b.id, vars: { refundLine }, dedupeKey: `admin_cancel:${b.id}` });
  await audit(db, { actor: args.adminEmail ?? "client", action: "booking.cancel", entityType: "booking", entityId: b.id, meta: { ...outcome, refundedPence, voucherRestore } });
  const { removeBookingFromCalendar } = await import("@/lib/calendar/google");
  await removeBookingFromCalendar(db, b.id).catch(() => {});

  return { ...outcome, refundedPence, voucherRestoredPence: Math.max(0, voucherRestore), feeChargedPence: retained + feeChargedPence };
}

/* -------------------------------------------------------------- reschedule */

export async function rescheduleBooking(
  db: Db,
  bookingId: string,
  newStart: Date,
  args: { actor: "client" | "admin"; adminEmail?: string; now?: Date; manageToken?: string },
): Promise<Booking> {
  const now = args.now ?? new Date();
  const settings = await loadSettings(db);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || b.status !== "confirmed") throw new BookingError("invalid", "Only upcoming bookings can be rescheduled.");
  if (args.actor === "client") {
    const r = canReschedule(b, settings.cancellationPolicy, now);
    if (!r.allowed) throw new BookingError("policy", r.reason!);
  }
  const service = (await getService(db, b.serviceId))!;
  try {
    const updated = await db.transaction(async (tx) => {
      await lockPractitioner(tx, b.practitionerId);
      await releaseExpiredHolds(tx, now);
      // Clients get the full rules (hours, caps, notice). The admin may deliberately book outside them; overlaps
      // are still impossible because of the DB exclusion constraint.
      if (args.actor === "client") {
        const [day] = await availabilityForRange(tx, {
          service: { ...service, bufferMin: b.bufferMin },
          settings,
          fromIso: localDateOf(newStart),
          days: 1,
          now,
          practitionerId: b.practitionerId,
          excludeBookingId: b.id,
        });
        if (!day.slots.some((s) => s.getTime() === newStart.getTime())) {
          throw new BookingError("slot_unavailable", "That time isn't available. Please choose another.");
        }
      }
      const endsAt = addMinutes(newStart, b.endsAt.getTime() / 60000 - b.startsAt.getTime() / 60000);
      const [row] = await tx
        .update(bookings)
        .set({ startsAt: newStart, endsAt, occupiedUntil: addMinutes(endsAt, b.bufferMin), updatedAt: now })
        .where(eq(bookings.id, b.id))
        .returning();
      return row;
    });
    const token = args.manageToken ?? randomToken();
    if (!args.manageToken) await db.update(bookings).set({ manageTokenHash: sha256(token) }).where(eq(bookings.id, b.id));
    await scheduleBookingNotifications(db, b.id, token, { isNew: false, rescheduled: true });
    await audit(db, { actor: args.adminEmail ?? "client", action: "booking.reschedule", entityType: "booking", entityId: b.id, meta: { from: b.startsAt, to: newStart } });
    const { pushBookingToCalendar } = await import("@/lib/calendar/google");
    await pushBookingToCalendar(db, b.id).catch(() => {});
    return updated;
  } catch (err) {
    if (isOverlapViolation(err)) throw new BookingError("slot_unavailable", "That time clashes with another booking.");
    throw err;
  }
}

/* -------------------------------------------------------------- attendance */

export async function markOutcome(
  db: Db,
  bookingId: string,
  outcome: "attended" | "no_show" | "late_cancelled",
  args: { adminEmail: string; chargeFee: boolean; now?: Date },
) {
  const now = args.now ?? new Date();
  const settings = await loadSettings(db);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (!b || !["confirmed", "attended", "no_show", "late_cancelled"].includes(b.status)) throw new BookingError("invalid", "This booking can't be updated.");

  let feeCharged = 0;
  if (outcome !== "attended" && args.chargeFee) {
    const basis = { startsAt: b.startsAt, pricePence: b.pricePence - b.discountPence, paidPence: b.paidPence + b.voucherPence };
    const o: CancellationOutcome =
      outcome === "no_show" ? noShow(basis, settings.cancellationPolicy) : clientCancellation(basis, settings.cancellationPolicy, addMinutes(b.startsAt, -1));
    const retained = o.feePence - o.outstandingFeePence;
    const cardRefund = Math.max(0, b.paidPence - Math.min(b.paidPence, retained));
    const { refundBooking, chargeFeeToSavedCard } = await import("@/lib/payments/handlers");
    if (cardRefund > 0) await refundBooking(db, b.id, cardRefund, { reason: outcome, automatic: true, actor: args.adminEmail });
    if (o.outstandingFeePence > 0) feeCharged = await chargeFeeToSavedCard(db, b.id, o.outstandingFeePence, outcome === "no_show" ? "No-show fee" : "Late cancellation fee");
    feeCharged += retained;
  }
  await db.update(bookings).set({ status: outcome, feeChargedPence: feeCharged || b.feeChargedPence, updatedAt: now }).where(eq(bookings.id, b.id));
  if (outcome !== "attended") await cancelPendingForBooking(db, b.id);
  await audit(db, { actor: args.adminEmail, action: `booking.${outcome}`, entityType: "booking", entityId: b.id, meta: { feeCharged } });
  return { feeCharged };
}

/* ----------------------------------------------------------- admin booking */

export async function createAdminBooking(
  db: Db,
  args: {
    serviceId: string;
    startsAt: Date;
    clientId: string;
    adminEmail: string;
    locationType?: "clinic" | "home";
    pricePence?: number;
    payment: "in_clinic" | "payment_link" | "saved_card" | "already_paid";
    notes?: string;
    allowOutsideHours?: boolean;
    isDemo?: boolean;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const { booking, holdToken } = await createHold(db, {
    serviceId: args.serviceId,
    startsAt: args.startsAt,
    now,
    source: args.payment === "payment_link" ? "payment_link" : "admin",
    locationType: args.locationType,
    holdMinutes: args.payment === "payment_link" ? 48 * 60 : 10,
    skipAvailabilityCheck: args.allowOutsideHours,
    isDemo: args.isDemo,
  });
  await db
    .update(bookings)
    .set({ clientId: args.clientId, pricePence: args.pricePence ?? booking.pricePence, clientNotes: args.notes ?? null })
    .where(eq(bookings.id, booking.id));

  if (args.payment === "payment_link") return { booking, holdToken, needsPaymentLink: true as const };

  if (args.payment === "saved_card") {
    const { chargeFeeToSavedCard } = await import("@/lib/payments/handlers");
    const charged = await chargeFeeToSavedCard(db, booking.id, args.pricePence ?? booking.pricePence, "Session payment", "payment");
    if (charged === 0) {
      await releaseHold(db, booking.id, holdToken);
      throw new BookingError("invalid", "The saved card couldn't be charged. Use a payment link instead.");
    }
    await confirmBooking(db, booking.id, { paidPence: 0, now });
  } else {
    if (args.payment === "already_paid") {
      await db.insert(payments).values({
        bookingId: booking.id,
        clientId: args.clientId,
        provider: "manual",
        kind: "payment",
        amountPence: args.pricePence ?? booking.pricePence,
        status: "succeeded",
        description: "Recorded manually",
        isDemo: args.isDemo ?? false,
      });
    }
    await confirmBooking(db, booking.id, { paidPence: args.payment === "already_paid" ? (args.pricePence ?? booking.pricePence) : 0, now });
  }
  await audit(db, { actor: args.adminEmail, action: "booking.create_manual", entityType: "booking", entityId: booking.id, meta: { payment: args.payment } });
  return { booking, holdToken, needsPaymentLink: false as const };
}

export async function lastBookingsForClient(db: DbOrTx, clientId: string, limit = 50) {
  return db.select().from(bookings).where(eq(bookings.clientId, clientId)).orderBy(desc(bookings.startsAt)).limit(limit);
}

export type { Quote };
