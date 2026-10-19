import { desc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { DiscountForm, DiscountToggle } from "@/components/admin/forms";
import { Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { discountCodes } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { formatLocal } from "@/lib/time";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(discountCodes).orderBy(desc(discountCodes.createdAt));
  return (
    <Table head={["Code", "Discount", "Used", "Valid until", "Status", ""]} empty={rows.length === 0}>
      {rows.map((d) => (
        <tr key={d.id}>
          <Td className="font-mono">{d.code}</Td>
          <Td>{d.kind === "percent" ? `${d.value}% off` : `${formatPence(d.value)} off`}</Td>
          <Td className="tabular-nums">{d.uses}{d.maxUses ? ` / ${d.maxUses}` : ""}</Td>
          <Td>{d.validTo ? formatLocal(d.validTo, "d MMM yyyy") : "No end date"}</Td>
          <Td>{d.active ? "Active" : "Disabled"}</Td>
          <Td><DiscountToggle id={d.id} active={d.active} /></Td>
        </tr>
      ))}
    </Table>
  );
}

export default function DiscountsSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Discount codes" subtitle="Clients enter codes at checkout. Gift vouchers are separate (see Vouchers)." />
      <Card title="New code" className="mb-4"><DiscountForm /></Card>
      <Card title="Codes"><Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-ink/5" />}><List /></Suspense></Card>
    </>
  );
}
