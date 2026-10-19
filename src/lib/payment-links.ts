/**
 * Payment links for home visits and phone/in-person bookings. If a time is attached, the slot is held (48h by
 * default) until the link is paid or expires.
 */
import { eq } from "drizzle-orm";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { bookings, clients, enquiries, paymentLinks } from "@/db/schema";
import { audit } from "@/lib/audit";
import { BookingError } from "@/lib/booking/errors";
import { createHold } from "@/lib/booking/service";
import { randomToken } from "@/lib/crypto";
import { formatPence } from "@/lib/money";
import { enqueue } from "@/lib/notifications/queue";
import { startPayment } from "@/lib/payments/handlers";
import { policySummary } from "@/lib/policy";
import { getService, loadSettings } from "@/lib/settings";
import { addMinutes } from "@/lib/time";
import { siteUrl } from "@/lib/url";

export async function createPaymentLink(
  db: Db,
  args: {
    adminEmail: string;
    amountPence: number;
    description: string;
    recipientName: string;
    recipientEmail: string;
    clientId?: string | null;
    serviceId?: string | null;
    startsAt?: Date | null;
    locationType?: "clinic" | "home";
    enquiryId?: string | null;
    holdHours?: number;
    sendEmail?: boolean;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const holdHours = args.holdHours ?? 48;
  let bookingId: string | null = null;
  if (args.serviceId && args.startsAt) {
    const { booking } = await createHold(db, {
      serviceId: args.serviceId,
      startsAt: args.startsAt,
      now,
      source: "payment_link",
      locationType: args.locationType ?? "clinic",
      holdMinutes: holdHours * 60,
      skipAvailabilityCheck: true, // admin-arranged; DB still prevents overlaps
    });
    bookingId = booking.id;
    await db.update(bookings).set({ clientId: args.clientId ?? null, pricePence: args.amountPence }).where(eq(bookings.id, booking.id));
  }
  const token = randomToken(18);
  const [link] = await db
    .insert(paymentLinks)
    .values({
      token,
      clientId: args.clientId ?? null,
      serviceId: args.serviceId ?? null,
      enquiryId: args.enquiryId ?? null,
      startsAt: args.startsAt ?? null,
      locationType: args.locationType ?? "clinic",
      amountPence: args.amountPence,
      description: args.description,
      recipientName: args.recipientName,
      recipientEmail: args.recipientEmail,
      bookingId,
      expiresAt: addMinutes(now, holdHours * 60),
    })
    .returning();
  if (args.enquiryId) await db.update(enquiries).set({ status: "quoted", quotePence: args.amountPence, paymentLinkId: link.id }).where(eq(enquiries.id, args.enquiryId));

  const url = siteUrl(`/pay/${token}`);
  if (args.sendEmail !== false) {
    const settings = await loadSettings(db);
    await enqueue(db, {
      templateKey: "payment_link",
      to: args.recipientEmail,
      clientId: args.clientId ?? null,
      vars: {
        clientFirstName: args.recipientName.split(" ")[0],
        serviceName: args.description,
        amount: formatPence(args.amountPence),
        paymentUrl: url,
        policySummary: policySummary(settings.cancellationPolicy),
      },
      dedupeKey: `paylink:${link.id}`,
    });
  }
  await audit(db, { actor: args.adminEmail, action: "payment_link.create", entityType: "payment_link", entityId: link.id, meta: { amountPence: args.amountPence, bookingId } });
  return { link, url };
}

export async function payLink(db: Db, token: string, now = new Date()) {
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, token));
  if (!link || link.status !== "open") throw new BookingError("not_found", "This payment link is no longer active.");
  if (link.expiresAt && link.expiresAt < now) throw new BookingError("hold_expired", "This payment link has expired. Please contact us for a new one.");
  const [client] = link.clientId ? await db.select().from(clients).where(eq(clients.id, link.clientId)) : [];
  const service = link.serviceId ? await getService(db, link.serviceId) : null;
  return startPayment(db, {
    purpose: "payment_link",
    mode: "payment",
    kind: "payment",
    amountPence: link.amountPence,
    saveCard: false,
    description: `${link.description} · ${business.name}`,
    customerEmail: link.recipientEmail ?? client?.email,
    customerName: link.recipientName ?? undefined,
    stripeCustomerId: client?.stripeCustomerId,
    clientId: link.clientId,
    bookingId: link.bookingId,
    paymentLinkId: link.id,
    successUrl: siteUrl(`/pay/${token}?paid=1`),
    cancelUrl: siteUrl(`/pay/${token}`),
    expiresAt: link.expiresAt ?? addMinutes(now, 60),
    taxRateBp: service?.taxRateBp ?? 0,
  });
}
