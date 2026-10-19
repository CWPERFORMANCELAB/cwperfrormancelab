import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { clients, payments, refunds } from "@/db/schema";
import { formatPenceExact } from "@/lib/money";
import { paymentsMode } from "@/lib/payments/provider";
import { formatLocal } from "@/lib/time";

async function Payments() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select({ p: payments, c: clients }).from(payments).leftJoin(clients, eq(clients.id, payments.clientId)).orderBy(desc(payments.createdAt)).limit(200);
  const refundRows = await db.select({ r: refunds, p: payments }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).orderBy(desc(refunds.createdAt)).limit(50);
  return (
    <>
      <PageHeader title="Payments" subtitle={paymentsMode() === "mock" ? "Test mode: payments use the built-in mock checkout until Stripe keys are added." : "Live data from Stripe Checkout."} />
      <Card title="Recent payments" className="mb-4">
        <Table head={["Date", "Client", "Description", "Type", "Amount", "Status"]} empty={rows.length === 0}>
          {rows.map(({ p, c }) => (
            <tr key={p.id}>
              <Td className="whitespace-nowrap">{formatLocal(p.createdAt, "d MMM, HH:mm")}</Td>
              <Td>{c ? <Link href={`/admin/clients/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link> : "—"}</Td>
              <Td>
                {p.bookingId ? <Link href={`/admin/bookings/${p.bookingId}`} className="hover:underline">{p.description}</Link> : p.description}
                {p.receiptNumber && <span className="block text-xs text-ink/65">{p.receiptNumber}</span>}
              </Td>
              <Td className="capitalize">{p.kind}</Td>
              <Td className="tabular-nums">
                {formatPenceExact(p.amountPence)}
                {p.refundedPence > 0 && <span className="block text-xs text-ink/65">−{formatPenceExact(p.refundedPence)} refunded</span>}
              </Td>
              <Td><Badge status={p.status} /></Td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Refunds">
        <Table head={["Date", "Payment", "Amount", "Reason", "Type"]} empty={refundRows.length === 0}>
          {refundRows.map(({ r, p }) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatLocal(r.createdAt, "d MMM, HH:mm")}</Td>
              <Td>{p.bookingId ? <Link href={`/admin/bookings/${p.bookingId}`} className="hover:underline">{p.description}</Link> : p.description}</Td>
              <Td className="tabular-nums">{formatPenceExact(r.amountPence)}</Td>
              <Td>{r.reason?.replace(/_/g, " ")}</Td>
              <Td>{r.automatic ? "Automatic (policy)" : "Manual"}</Td>
            </tr>
          ))}
        </Table>
        <p className="mt-3 text-xs text-ink/65">To refund, open the booking and use the refund control next to the payment.</p>
      </Card>
    </>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Payments />
    </Suspense>
  );
}
