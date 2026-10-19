/**
 * Session packages / blocks (behind the `packages` feature flag, off by default).
 * A client buys N credits for a service; they get a code to enter at checkout, and each booking uses one credit.
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { business } from "@config/business";
import type { Db, DbOrTx } from "@/db/client";
import { packagePurchases, packages } from "@/db/schema";
import { BookingError } from "@/lib/booking/errors";
import { friendlyCode } from "@/lib/crypto";
import { formatPence } from "@/lib/money";
import { enqueue } from "@/lib/notifications/queue";
import { startPayment } from "@/lib/payments/handlers";
import { addMinutes } from "@/lib/time";
import { siteUrl } from "@/lib/url";
import { normaliseCode } from "@/lib/vouchers";

export async function findUsablePackage(db: DbOrTx, code: string, serviceId: string, now: Date) {
  const [p] = await db
    .select({ pp: packagePurchases, pk: packages })
    .from(packagePurchases)
    .innerJoin(packages, eq(packages.id, packagePurchases.packageId))
    .where(eq(packagePurchases.code, normaliseCode(code)));
  if (!p || p.pp.status !== "active") return null;
  if (p.pp.expiresAt <= now || p.pp.creditsRemaining <= 0) return null;
  if (p.pk.serviceId && p.pk.serviceId !== serviceId) return null;
  return p.pp;
}

/** Use one credit (row-locked). */
export async function useCredit(tx: DbOrTx, purchaseId: string, now: Date) {
  const [row] = await tx
    .update(packagePurchases)
    .set({ creditsRemaining: sql`${packagePurchases.creditsRemaining} - 1` })
    .where(and(eq(packagePurchases.id, purchaseId), gt(packagePurchases.creditsRemaining, 0), gt(packagePurchases.expiresAt, now)))
    .returning();
  if (!row) throw new BookingError("voucher_invalid", "This package has no credits left.");
}

export async function restoreCredit(tx: DbOrTx, purchaseId: string) {
  await tx
    .update(packagePurchases)
    .set({ creditsRemaining: sql`least(${packagePurchases.creditsTotal}, ${packagePurchases.creditsRemaining} + 1)` })
    .where(eq(packagePurchases.id, purchaseId));
}

export async function buyPackage(db: Db, args: { packageId: string; clientId: string; email: string; name: string; now?: Date }) {
  const now = args.now ?? new Date();
  const [pk] = await db.select().from(packages).where(eq(packages.id, args.packageId));
  if (!pk || !pk.active) throw new BookingError("invalid", "That package isn't available.");
  const [pp] = await db
    .insert(packagePurchases)
    .values({
      packageId: pk.id,
      clientId: args.clientId,
      code: `PK-${friendlyCode(2, 4)}`,
      creditsTotal: pk.credits,
      creditsRemaining: pk.credits,
      expiresAt: addMinutes(now, pk.validityDays * 24 * 60),
    })
    .returning();
  return startPayment(db, {
    purpose: "package",
    mode: "payment",
    kind: "package",
    amountPence: pk.pricePence,
    saveCard: false,
    description: `${pk.name} · ${business.name}`,
    customerEmail: args.email,
    customerName: args.name,
    clientId: args.clientId,
    packagePurchaseId: pp.id,
    successUrl: siteUrl("/packages?bought=1"),
    cancelUrl: siteUrl("/packages"),
    expiresAt: addMinutes(now, 60),
  });
}

/** Called when the package payment succeeds. Idempotent. */
export async function activatePackage(db: Db, purchaseId: string) {
  const [pp] = await db
    .update(packagePurchases)
    .set({ status: "active" })
    .where(and(eq(packagePurchases.id, purchaseId), eq(packagePurchases.status, "pending")))
    .returning();
  if (!pp) return;
  const [pk] = await db.select().from(packages).where(eq(packages.id, pp.packageId));
  const { clients } = await import("@/db/schema");
  const [c] = await db.select().from(clients).where(eq(clients.id, pp.clientId));
  if (c) {
    await enqueue(db, {
      templateKey: "voucher_purchased",
      to: c.email,
      clientId: c.id,
      vars: {
        recipientName: c.firstName,
        voucherValue: `${pk.name} (${pp.creditsTotal} sessions, ${formatPence(pk.pricePence)})`,
        voucherCode: pp.code ?? "",
        voucherExpiry: pp.expiresAt.toISOString().slice(0, 10),
        message: "Enter this code when you book. Each booking uses one session.",
      },
      dedupeKey: `package:${pp.id}`,
    });
  }
}
