import type { Db } from "@/db/client";
import { localToUtc } from "@/lib/time";
import { addMonths, createVoucher, findVoucher, normaliseCode } from "@/lib/vouchers";

/**
 * Import vouchers sold before the switch (e.g. via Calendly). CSV header row required:
 *   code,value_pounds,expires,recipient_name,recipient_email,minutes,balance_pounds
 * Only `code` and `value_pounds` are required. Missing expiry → 12 months from today. Existing codes are skipped.
 */
export async function importVoucherCsv(db: Db, csv: string, now = new Date()) {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { imported: 0, skipped: 0, errors: ["Empty file"] };
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (k: string) => header.indexOf(k);
  if (idx("code") < 0 || idx("value_pounds") < 0) return { imported: 0, skipped: 0, errors: ["Header must include code and value_pounds"] };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (const [n, line] of lines.slice(1).entries()) {
    const cols = line.split(",").map((c) => c.trim());
    const get = (k: string) => (idx(k) >= 0 ? cols[idx(k)] ?? "" : "");
    const code = normaliseCode(get("code"));
    const value = Number(get("value_pounds"));
    if (!code || !Number.isFinite(value) || value <= 0) {
      errors.push(`row ${n + 2}: invalid code/value`);
      continue;
    }
    if (await findVoucher(db, code)) {
      skipped++;
      continue;
    }
    const exp = get("expires");
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(exp) ? localToUtc(exp, "23:59") : addMonths(now, 12);
    const v = await createVoucher(db, {
      code,
      valuePence: Math.round(value * 100),
      minutes: Number(get("minutes")) || null,
      expiresAt,
      source: "calendly_import",
      status: expiresAt < now ? "pending" : "active",
      recipientName: get("recipient_name") || undefined,
      recipientEmail: get("recipient_email") || undefined,
    });
    const bal = Number(get("balance_pounds"));
    if (Number.isFinite(bal) && bal >= 0 && get("balance_pounds") !== "") {
      const { vouchers } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const pence = Math.min(v.initialPence, Math.round(bal * 100));
      await db.update(vouchers).set({ balancePence: pence, status: expiresAt < now ? "expired" : pence === 0 ? "redeemed" : "active" }).where(eq(vouchers.id, v.id));
    } else if (expiresAt < now) {
      const { vouchers } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(vouchers).set({ status: "expired" }).where(eq(vouchers.id, v.id));
    }
    imported++;
  }
  return { imported, skipped, errors };
}
