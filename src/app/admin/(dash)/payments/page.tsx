import { and, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { clients, disputes, paymentLinks, payments, refunds } from "@/db/schema";
import { formatPenceExact } from "@/lib/money";
import { paymentsMode } from "@/lib/payments/provider";
import { formatLocal } from "@/lib/time";
import { siteUrl } from "@/lib/url";

async function Payments() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select({ p: payments, c: clients }).from(payments).leftJoin(clients, eq(clients.id, payments.clientId)).orderBy(desc(payments.createdAt)).limit(200);
  const refundRows = await db.select({ r: refunds, p: payments }).from(refunds).innerJoin(payments, eq(payments.id, refunds.paymentId)).orderBy(desc(refunds.createdAt)).limit(50);
  const disputeRows = await db
    .select({ d: disputes, p: payments, c: clients })
    .from(disputes)
    .leftJoin(payments, eq(payments.id, disputes.paymentId))
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .orderBy(desc(disputes.createdAt))
    .limit(50);
  // Saved-card charges the bank declined pending authentication (SCA): the client was emailed a payment link.
  const awaitingAuth = await db
    .select({ p: payments, c: clients, l: paymentLinks })
    .from(payments)
    .leftJoin(clients, eq(clients.id, payments.clientId))
    .innerJoin(paymentLinks, sql`${paymentLinks.id}::text = ${payments.metadata}->>'paymentLinkId'`)
    .where(and(sql`${payments.metadata}->>'authenticationRequired' = 'true'`, eq(paymentLinks.status, "open")))
    .orderBy(desc(payments.createdAt));
  const openDisputes = disputeRows.filter(({ d }) => !d.closedAt);
  return (
    <>
      <PageHeader title="Payments" subtitle={paymentsMode() === "mock" ? "Test mode: payments use the built-in mock checkout until Stripe keys are added." : "Live data from Stripe Checkout."} />
      {openDisputes.length > 0 && (
        <p className="mb-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm" role="alert">
          <strong>{openDisputes.length} open dispute{openDisputes.length === 1 ? "" : "s"}.</strong> Respond in the Stripe dashboard before the evidence deadline.
        </p>
      )}
      {awaitingAuth.length > 0 && (
        <Card title={`Waiting for client: card authentication (${awaitingAuth.length})`} className="mb-4">
          <p className="mb-3 text-sm text-ink/65">These clients&apos; banks required them to approve a charge. They&apos;ve been emailed a secure payment link.</p>
          <Table head={["Date", "Client", "For", "Amount", "Payment link"]}>
            {awaitingAuth.map(({ p, c, l }) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{formatLocal(p.createdAt, "d MMM, HH:mm")}</Td>
                <Td>{c ? <Link href={`/admin/clients/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link> : "—"}</Td>
                <Td>{p.bookingId ? <Link href={`/admin/bookings/${p.bookingId}`} className="hover:underline">{p.description}</Link> : p.description}</Td>
                <Td className="tabular-nums">{formatPenceExact(l.amountPence)}</Td>
                <Td><span className="break-all font-mono text-xs">{siteUrl(`/pay/${l.token}`)}</span></Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Card title="Disputes (chargebacks)" className="mb-4">
        <Table head={["Opened", "Client", "Amount", "Reason", "Status", "Evidence due"]} empty={disputeRows.length === 0}>
          {disputeRows.map(({ d, p, c }) => (
            <tr key={d.id}>
              <Td className="whitespace-nowrap">{formatLocal(d.createdAt, "d MMM yyyy")}</Td>
              <Td>{c ? <Link href={`/admin/clients/${c.id}`} className="hover:underline">{c.firstName} {c.lastName}</Link> : "—"}{p?.bookingId && <Link href={`/admin/bookings/${p.bookingId}`} className="block text-xs text-ink/65 hover:underline">View booking</Link>}</Td>
              <Td className="tabular-nums">{formatPenceExact(d.amountPence)}</Td>
              <Td className="capitalize">{(d.reason ?? "—").replace(/_/g, " ")}</Td>
              <Td><Badge status={d.closedAt ? (d.status === "won" ? "succeeded" : "failed") : "pending"} /> <span className="ml-1 text-xs capitalize text-ink/65">{d.status.replace(/_/g, " ")}</span></Td>
              <Td className="whitespace-nowrap">{d.evidenceDueBy && !d.closedAt ? formatLocal(d.evidenceDueBy, "d MMM yyyy") : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
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
