import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { voucherRedemptions, vouchers, type Voucher } from "@/db/schema";
import { friendlyCode } from "@/lib/crypto";
import { BookingError } from "@/lib/booking/errors";

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** Look up a voucher for display/validation (no lock). */
export async function findVoucher(db: DbOrTx, code: string): Promise<Voucher | null> {
  const [v] = await db.select().from(vouchers).where(eq(vouchers.code, normaliseCode(code)));
  return v ?? null;
}

export function voucherUsable(v: Voucher | null, now: Date): { ok: true } | { ok: false; reason: string } {
  if (!v) return { ok: false, reason: "We couldn't find that voucher code." };
  if (v.status === "pending") return { ok: false, reason: "This voucher hasn't been paid for yet." };
  if (v.status === "void") return { ok: false, reason: "This voucher is no longer valid." };
  if (v.expiresAt <= now || v.status === "expired") return { ok: false, reason: "This voucher has expired." };
  if (v.balancePence <= 0 || v.status === "redeemed") return { ok: false, reason: "This voucher has already been used." };
  return { ok: true };
}

export async function createVoucher(
  db: DbOrTx,
  args: {
    productId?: string | null;
    minutes?: number | null;
    valuePence: number;
    expiresAt: Date;
    source: "online" | "calendly_import" | "admin";
    status?: "pending" | "active";
    code?: string;
    purchaserName?: string;
    purchaserEmail?: string;
    recipientName?: string;
    recipientEmail?: string;
    message?: string;
    isDemo?: boolean;
  },
): Promise<Voucher> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = args.code ? normaliseCode(args.code) : `CW-${friendlyCode(2, 4)}`;
    const [row] = await db
      .insert(vouchers)
      .values({
        code,
        productId: args.productId ?? null,
        minutes: args.minutes ?? null,
        initialPence: args.valuePence,
        balancePence: args.valuePence,
        expiresAt: args.expiresAt,
        source: args.source,
        status: args.status ?? "pending",
        purchaserName: args.purchaserName,
        purchaserEmail: args.purchaserEmail,
        recipientName: args.recipientName,
        recipientEmail: args.recipientEmail,
        message: args.message,
        isDemo: args.isDemo ?? false,
      })
      .onConflictDoNothing()
      .returning();
    if (row) return row;
    if (args.code) throw new BookingError("invalid", `Voucher code ${code} already exists.`);
  }
  throw new Error("Could not generate a unique voucher code");
}

/**
 * Redeem part or all of a voucher against a booking. Row-locks the voucher so two checkouts can't spend the same
 * balance. Returns the amount actually applied.
 */
export async function redeemVoucher(tx: DbOrTx, args: { voucherId: string; bookingId: string; amountPence: number; now: Date }): Promise<number> {
  const locked = await tx.execute(sql`select id from vouchers where id = ${args.voucherId} for update`);
  void locked;
  const [v] = await tx.select().from(vouchers).where(eq(vouchers.id, args.voucherId));
  const usable = voucherUsable(v ?? null, args.now);
  if (!usable.ok) throw new BookingError("voucher_invalid", usable.reason);
  const [existing] = await tx
    .select()
    .from(voucherRedemptions)
    .where(and(eq(voucherRedemptions.voucherId, args.voucherId), eq(voucherRedemptions.bookingId, args.bookingId), isNull(voucherRedemptions.reversedAt)));
  if (existing) return existing.amountPence; // idempotent
  const apply = Math.min(v!.balancePence, args.amountPence);
  const balance = v!.balancePence - apply;
  await tx.update(vouchers).set({ balancePence: balance, status: balance === 0 ? "redeemed" : "active" }).where(eq(vouchers.id, args.voucherId));
  await tx.insert(voucherRedemptions).values({ voucherId: args.voucherId, bookingId: args.bookingId, amountPence: apply });
  return apply;
}

/** Give back (part of) a redemption — e.g. on a free cancellation. */
export async function reverseRedemption(tx: DbOrTx, args: { bookingId: string; amountPence?: number; now: Date }): Promise<number> {
  const [r] = await tx
    .select()
    .from(voucherRedemptions)
    .where(and(eq(voucherRedemptions.bookingId, args.bookingId), isNull(voucherRedemptions.reversedAt)));
  if (!r) return 0;
  const giveBack = Math.min(r.amountPence, args.amountPence ?? r.amountPence);
  if (giveBack <= 0) return 0;
  await tx.execute(sql`select id from vouchers where id = ${r.voucherId} for update`);
  const [v] = await tx.select().from(vouchers).where(eq(vouchers.id, r.voucherId));
  const balance = Math.min(v.initialPence, v.balancePence + giveBack);
  await tx
    .update(vouchers)
    .set({ balancePence: balance, status: v.expiresAt <= args.now ? "expired" : "active" })
    .where(eq(vouchers.id, r.voucherId));
  await tx.update(voucherRedemptions).set({ reversedAt: args.now }).where(eq(voucherRedemptions.id, r.id));
  if (giveBack < r.amountPence) {
    // Keep the non-refunded part on record.
    await tx.insert(voucherRedemptions).values({ voucherId: r.voucherId, bookingId: args.bookingId, amountPence: r.amountPence - giveBack });
  }
  return giveBack;
}

export async function expireVouchers(db: DbOrTx, now = new Date()) {
  return db
    .update(vouchers)
    .set({ status: "expired" })
    .where(and(eq(vouchers.status, "active"), lt(vouchers.expiresAt, now)))
    .returning({ id: vouchers.id });
}
