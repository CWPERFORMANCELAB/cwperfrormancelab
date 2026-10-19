import { desc, ilike } from "drizzle-orm";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/client";
import { VoucherCreateForm, VoucherImportForm } from "@/components/admin/forms";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { vouchers } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { formatLocal } from "@/lib/time";
import { voidVoucherAction } from "../actions";

async function List({ q }: { q?: string }) {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(vouchers).where(q ? ilike(vouchers.code, `%${q.toUpperCase()}%`) : undefined).orderBy(desc(vouchers.createdAt)).limit(300);
  return (
    <Table head={["Code", "Value", "Balance", "For", "Expires", "Source", "Status", ""]} empty={rows.length === 0}>
      {rows.map((v) => (
        <tr key={v.id}>
          <Td className="font-mono">{v.code}</Td>
          <Td className="tabular-nums">{formatPence(v.initialPence)}{v.minutes ? ` (${v.minutes}m)` : ""}</Td>
          <Td className="tabular-nums">{formatPence(v.balancePence)}</Td>
          <Td>{v.recipientName ?? "—"}<span className="block text-xs text-ink/65">{v.recipientEmail ?? v.purchaserEmail ?? ""}</span></Td>
          <Td className="whitespace-nowrap">{formatLocal(v.expiresAt, "d MMM yyyy")}</Td>
          <Td className="capitalize">{v.source.replace("_", " ")}</Td>
          <Td><Badge status={v.status} /></Td>
          <Td>{v.status === "active" && <ActionButton action={voidVoucherAction.bind(null, v.id)} className="text-xs text-danger underline" confirm={`Void ${v.code}? It can no longer be redeemed.`}>Void</ActionButton>}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default async function VouchersPage({ searchParams }: PageProps<"/admin/vouchers">) {
  return (
    <>
      <PageHeader title="Gift vouchers" subtitle="Online sales, manual vouchers and codes imported from Calendly. Redeemed at checkout." />
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Create a voucher">
          <VoucherCreateForm />
        </Card>
        <Card title="Import vouchers sold via Calendly">
          <p className="mb-2 text-xs text-ink/65">Paste a CSV or choose a file. Existing codes are skipped, so it&apos;s safe to run twice.</p>
          <VoucherImportForm />
        </Card>
      </div>
      <Card title="All vouchers">
        <form className="mb-3 flex gap-2" action="/admin/vouchers">
          <input name="q" placeholder="Search code" className="field max-w-xs py-2 uppercase" aria-label="Search code" />
          <button className="btn-dark btn-sm">Search</button>
        </form>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-ink/5" />}>
          <ListWithQuery searchParams={searchParams} />
        </Suspense>
      </Card>
    </>
  );
}

async function ListWithQuery({ searchParams }: { searchParams: PageProps<"/admin/vouchers">["searchParams"] }) {
  const sp = await searchParams;
  return <List q={typeof sp.q === "string" && sp.q ? sp.q : undefined} />;
}
