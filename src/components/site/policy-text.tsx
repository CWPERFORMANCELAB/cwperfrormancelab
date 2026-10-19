import { getCatalog } from "@/lib/data/public";
import { policySummary } from "@/lib/policy";

/** Live policy text for MDX/FAQ, always from settings so it can never drift from what's enforced. */
export async function PolicyText() {
  const { policy } = await getCatalog();
  return <>{policySummary(policy)}</>;
}

export async function RetentionText() {
  const { retentionYears } = await getCatalog();
  return <>{retentionYears} years</>;
}

export async function VoucherSetting({ field }: { field: "expiryMonths" }) {
  const { vouchers } = await getCatalog();
  return <>{vouchers[field]}</>;
}
