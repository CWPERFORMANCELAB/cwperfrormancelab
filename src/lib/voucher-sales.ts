import { eq } from "drizzle-orm";
import { business } from "@config/business";
import type { Db } from "@/db/client";
import { vouchers } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { alertAdmin, enqueue } from "@/lib/notifications/queue";
import { startPayment } from "@/lib/payments/handlers";
import { loadSettings } from "@/lib/settings";
import { formatLocal, addMinutes } from "@/lib/time";
import { siteUrl } from "@/lib/url";
import { BookingError } from "@/lib/booking/errors";
import { addMonths, createVoucher } from "@/lib/vouchers";

export async function purchaseVoucher(
  db: Db,
  args: { productId: string; purchaserName: string; purchaserEmail: string; recipientName: string; recipientEmail?: string; message?: string; now?: Date },
): Promise<{ url: string; voucherId: string }> {
  const now = args.now ?? new Date();
  const settings = await loadSettings(db);
  const product = settings.vouchers.products.find((p) => p.id === args.productId && p.active);
  if (!product) throw new BookingError("invalid", "That voucher isn't available.");
  const voucher = await createVoucher(db, {
    productId: product.id,
    minutes: product.minutes,
    valuePence: product.pricePence,
    expiresAt: addMonths(now, settings.vouchers.expiryMonths),
    source: "online",
    status: "pending",
    purchaserName: args.purchaserName,
    purchaserEmail: args.purchaserEmail,
    recipientName: args.recipientName,
    recipientEmail: args.recipientEmail || undefined,
    message: args.message,
  });
  const url = await startPayment(db, {
    purpose: "voucher",
    mode: "payment",
    kind: "voucher",
    amountPence: product.pricePence,
    saveCard: false,
    description: `${product.name} · ${business.name}`,
    customerEmail: args.purchaserEmail,
    customerName: args.purchaserName,
    voucherId: voucher.id,
    successUrl: siteUrl(`/gift-vouchers/thanks?v=${voucher.id}`),
    cancelUrl: siteUrl("/gift-vouchers"),
    expiresAt: addMinutes(now, 60),
  });
  return { url, voucherId: voucher.id };
}

/** Called once payment succeeds: activates the code and emails the e-voucher. Idempotent. */
export async function activateVoucher(db: Db, voucherId: string) {
  const [v] = await db.select().from(vouchers).where(eq(vouchers.id, voucherId));
  if (!v || v.status !== "pending") return;
  await db.update(vouchers).set({ status: "active" }).where(eq(vouchers.id, v.id));
  const vars = {
    recipientName: v.recipientName ?? "there",
    message: v.message ? `"${v.message}"${v.purchaserName ? ` from ${v.purchaserName}` : ""}` : v.purchaserName ? `From ${v.purchaserName}` : "",
    voucherCode: v.code,
    voucherValue: `${v.minutes ? `${v.minutes} minute massage (` : ""}${formatPence(v.initialPence)}${v.minutes ? ")" : ""}`,
    voucherExpiry: formatLocal(v.expiresAt, "d MMMM yyyy"),
    voucherUrl: siteUrl(`/gift-vouchers/${v.code}`),
  };
  // Purchaser always gets it (to print/forward); recipient too if an email was given.
  if (v.purchaserEmail) await enqueue(db, { templateKey: "voucher_purchased", to: v.purchaserEmail, vars, dedupeKey: `voucher:${v.id}:purchaser` });
  if (v.recipientEmail && v.recipientEmail !== v.purchaserEmail) {
    await enqueue(db, { templateKey: "voucher_purchased", to: v.recipientEmail, vars, dedupeKey: `voucher:${v.id}:recipient` });
  }
  await alertAdmin(db, "admin_voucher_sale", { vars, dedupeKey: `admin_voucher:${v.id}` });
}
