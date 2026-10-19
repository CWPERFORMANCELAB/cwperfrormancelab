import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { discountCodes, type Service } from "@/db/schema";
import { percentOf } from "@/lib/money";
import type { PaymentModel, Settings } from "@/lib/settings-schema";
import { findVoucher, voucherUsable } from "@/lib/vouchers";

export type Quote = {
  pricePence: number;
  discountPence: number;
  discountCodeId: string | null;
  discountLabel: string | null;
  voucherPence: number;
  voucherId: string | null;
  voucherBalanceAfterPence: number | null;
  /** Package credit applied (packages flag). */
  packagePurchaseId: string | null;
  /** Owed in total after discount + voucher. */
  duePence: number;
  /** Charged at checkout now. */
  chargeNowPence: number;
  /** Paid later (deposit balance) — settled in clinic or charged to the saved card. */
  laterPence: number;
  model: PaymentModel;
  saveCard: boolean;
  checkout: "payment" | "setup" | "none";
  errors: { discount?: string; voucher?: string };
};

export async function validateDiscount(db: DbOrTx, code: string, serviceId: string, now: Date) {
  const [d] = await db.select().from(discountCodes).where(eq(sql`upper(${discountCodes.code})`, code.trim().toUpperCase()));
  if (!d || !d.active) return { ok: false as const, reason: "That discount code isn't valid." };
  if (d.validFrom && d.validFrom > now) return { ok: false as const, reason: "That discount code isn't active yet." };
  if (d.validTo && d.validTo < now) return { ok: false as const, reason: "That discount code has expired." };
  if (d.maxUses !== null && d.uses >= d.maxUses) return { ok: false as const, reason: "That discount code has been fully used." };
  if (d.serviceIds.length && !d.serviceIds.includes(serviceId)) return { ok: false as const, reason: "That code doesn't apply to this session." };
  return { ok: true as const, code: d };
}

export async function quote(
  db: DbOrTx,
  args: {
    service: Pick<Service, "id" | "pricePence" | "paymentModel" | "depositPercent">;
    settings: Pick<Settings, "paymentDefaults"> & Partial<Pick<Settings, "features">>;
    discountCode?: string | null;
    voucherCode?: string | null;
    /** Already-attached package purchase (re-quote at checkout). */
    packagePurchaseId?: string | null;
    /** Insurer booking (insuranceBookings flag): no upfront charge, balance tracked. */
    insurer?: boolean;
    now: Date;
  },
): Promise<Quote> {
  const price = args.service.pricePence;
  const errors: Quote["errors"] = {};

  let discountPence = 0;
  let discountCodeId: string | null = null;
  let discountLabel: string | null = null;
  if (args.discountCode?.trim()) {
    const r = await validateDiscount(db, args.discountCode, args.service.id, args.now);
    if (r.ok) {
      discountPence = r.code.kind === "percent" ? percentOf(price, r.code.value) : Math.min(price, r.code.value);
      discountCodeId = r.code.id;
      discountLabel = r.code.code.toUpperCase();
    } else errors.discount = r.reason;
  }

  let voucherPence = 0;
  let voucherId: string | null = null;
  let voucherBalanceAfterPence: number | null = null;
  let packagePurchaseId: string | null = args.packagePurchaseId ?? null;
  if (args.voucherCode?.trim() && !packagePurchaseId) {
    const v = await findVoucher(db, args.voucherCode);
    const u = voucherUsable(v, args.now);
    if (u.ok && v) {
      voucherPence = Math.min(v.balancePence, price - discountPence);
      voucherId = v.id;
      voucherBalanceAfterPence = v.balancePence - voucherPence;
    } else if (!v && args.settings.features?.packages) {
      // The same box accepts package codes when packages are switched on.
      const { findUsablePackage } = await import("@/lib/packages");
      const pp = await findUsablePackage(db, args.voucherCode, args.service.id, args.now);
      if (pp) packagePurchaseId = pp.id;
      else errors.voucher = "That code isn't valid for this session.";
    } else if (!u.ok) errors.voucher = u.reason;
  }
  if (packagePurchaseId) {
    return {
      pricePence: price,
      discountPence: 0,
      discountCodeId: null,
      discountLabel: null,
      voucherPence: 0,
      voucherId: null,
      voucherBalanceAfterPence: null,
      packagePurchaseId,
      duePence: 0,
      chargeNowPence: 0,
      laterPence: 0,
      model: "full",
      saveCard: false,
      checkout: "none",
      errors: {},
    };
  }
  if (args.insurer && args.settings.features?.insuranceBookings) {
    return {
      pricePence: price,
      discountPence: 0,
      discountCodeId: null,
      discountLabel: null,
      voucherPence: 0,
      voucherId: null,
      voucherBalanceAfterPence: null,
      packagePurchaseId: null,
      duePence: price,
      chargeNowPence: 0,
      laterPence: price,
      model: "full",
      saveCard: false,
      checkout: "none",
      errors: {},
    };
  }

  const duePence = Math.max(0, price - discountPence - voucherPence);
  const model = (args.service.paymentModel ?? args.settings.paymentDefaults.model) as PaymentModel;
  const depositPct = args.service.depositPercent ?? args.settings.paymentDefaults.depositPercent;

  let chargeNowPence = duePence;
  if (model === "deposit") chargeNowPence = Math.min(duePence, percentOf(price, depositPct));
  if (model === "card_on_file") chargeNowPence = 0;
  const saveCard = model === "deposit" || model === "card_on_file";

  const checkout: Quote["checkout"] = chargeNowPence > 0 ? "payment" : saveCard && duePence > 0 ? "setup" : "none";

  return {
    pricePence: price,
    discountPence,
    discountCodeId,
    discountLabel,
    voucherPence,
    voucherId,
    voucherBalanceAfterPence,
    packagePurchaseId: null,
    duePence,
    chargeNowPence,
    laterPence: duePence - chargeNowPence,
    model,
    saveCard,
    checkout,
    errors,
  };
}
