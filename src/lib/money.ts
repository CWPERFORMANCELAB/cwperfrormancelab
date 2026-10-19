import { business } from "@config/business";

const fmt = new Intl.NumberFormat(business.locale, { style: "currency", currency: business.currency });
const fmtWhole = new Intl.NumberFormat(business.locale, {
  style: "currency",
  currency: business.currency,
  maximumFractionDigits: 0,
});

/** 6500 → "£65" (whole pounds) or "£65.50". */
export function formatPence(pence: number): string {
  return pence % 100 === 0 ? fmtWhole.format(pence / 100) : fmt.format(pence / 100);
}

/** Always two decimals — receipts, refunds. */
export function formatPenceExact(pence: number): string {
  return fmt.format(pence / 100);
}

export function percentOf(pence: number, percent: number): number {
  return Math.round((pence * percent) / 100);
}

/** VAT-inclusive price → VAT portion. rateBp = 2000 for 20%. */
export function taxFromInclusive(pence: number, rateBp: number): number {
  if (!rateBp) return 0;
  return Math.round(pence - pence / (1 + rateBp / 10_000));
}
