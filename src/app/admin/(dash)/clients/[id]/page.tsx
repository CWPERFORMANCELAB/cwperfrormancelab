import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ClientEditor } from "@/components/admin/forms";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { Download, Plus } from "@/components/icons";
import { getDb } from "@/db/client";
import { bookings, clients, disputes, intakeForms, payments, services } from "@/db/schema";
import { listClients } from "@/lib/admin/clients";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { decrypt, decryptJson } from "@/lib/crypto";
import { formatPence } from "@/lib/money";
import { formatLocal } from "@/lib/time";

async function Profile({ params }: { params: PageProps<"/admin/clients/[id]">["params"] }) {
  await connection();
  const admin = await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  if (!c) notFound();
  const [stats] = await listClients(db, { q: c.email, limit: 1 });
  const [history, pays, forms] = await Promise.all([
    db.select({ b: bookings, s: services }).from(bookings).innerJoin(services, eq(services.id, bookings.serviceId)).where(eq(bookings.clientId, id)).orderBy(desc(bookings.startsAt)),
    db.select().from(payments).where(eq(payments.clientId, id)).orderBy(desc(payments.createdAt)),
    db.select().from(intakeForms).where(eq(intakeForms.clientId, id)).orderBy(desc(intakeForms.createdAt)),
  ]);
  const clientDisputes = await db.select({ d: disputes }).from(disputes).innerJoin(payments, eq(payments.id, disputes.paymentId)).where(eq(payments.clientId, id)).orderBy(desc(disputes.createdAt));
  await audit(db, { actor: admin.email, action: "client.view", entityType: "client", entityId: id });
  const emergency = decryptJson<{ name: string; phone: string; relationship: string }>(c.emergencyContactEnc);

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/clients" className="text-ink/65 hover:text-ink">← Clients</Link></p>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        subtitle={`${c.email}${c.phone ? ` · ${c.phone}` : ""}`}
        actions={
          <>
            <a href={`/api/admin/clients/${c.id}/export`} className="btn-ghost-dark btn-sm"><Download className="size-4" /> Export data</a>
            <Link href="/admin/bookings/new" className="btn-primary btn-sm"><Plus className="size-4" /> Book</Link>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Sessions attended", String(stats?.sessions ?? 0)],
          ["Total spend", formatPence(stats?.spend ?? 0)],
          ["First visit", stats?.first_visit ? formatLocal(new Date(stats.first_visit), "d MMM yyyy") : "—"],
          ["Voucher balance", stats?.voucher_balance ? formatPence(stats.voucher_balance) : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-ink/[0.08] bg-white p-4">
            <p className="text-xs text-ink/65">{k}</p>
            <p className="mt-1 font-display text-xl font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Bookings" padded={false}>
            <div className="px-5">
              <Table head={["When", "Service", "Status", "Paid"]} empty={history.length === 0}>
                {history.map(({ b, s }) => (
                  <tr key={b.id}>
                    <Td><Link href={`/admin/bookings/${b.id}`} className="hover:underline">{formatLocal(b.startsAt, "d MMM yyyy, HH:mm")}</Link></Td>
                    <Td>{s.shortName}</Td>
                    <Td><Badge status={b.status} /></Td>
                    <Td className="tabular-nums">{formatPence(b.paidPence + b.voucherPence)}</Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
          <Card title="Payments" padded={false}>
            <div className="px-5">
              <Table head={["Date", "Description", "Amount", "Status"]} empty={pays.length === 0}>
                {pays.map((p) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap">{formatLocal(p.createdAt, "d MMM yyyy")}</Td>
                    <Td>{p.description}</Td>
                    <Td className="tabular-nums">{formatPence(p.amountPence)}{p.refundedPence ? ` (−${formatPence(p.refundedPence)})` : ""}</Td>
                    <Td><Badge status={p.status} /></Td>
                  </tr>
                ))}
              </Table>
            </div>
          </Card>
          {clientDisputes.length > 0 && (
            <Card title={`Disputes (${clientDisputes.length})`}>
              <ul className="space-y-2 text-sm">
                {clientDisputes.map(({ d }) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/25 bg-danger/5 p-3">
                    <span>
                      {formatPence(d.amountPence)} · <span className="capitalize">{(d.reason ?? "unspecified").replace(/_/g, " ")}</span>
                    </span>
                    <span className="text-xs capitalize text-ink/65">
                      {d.status.replace(/_/g, " ")} · opened {formatLocal(d.createdAt, "d MMM yyyy")}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card title={`Intake & consent forms (${forms.length})`}>
            {forms.length === 0 ? (
              <p className="text-sm text-ink/65">None yet.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {forms.map((f) => {
                  const d = decryptJson<{ kind: string; intake?: { complaint?: string } | null; returning?: { anythingChanged?: string } | null }>(f.dataEnc);
                  return (
                    <li key={f.id} className="rounded-lg border border-ink/10 p-3">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-ink/65">
                        {formatLocal(f.createdAt, "d MMM yyyy")} · {d?.kind === "returning" ? "Returning update" : "Full intake"}
                        {f.hasRedFlags && <span className="rounded bg-danger/10 px-1.5 text-danger">Red flags</span>}
                        {f.isMinor && <span className="rounded bg-warning/15 px-1.5">Under 18</span>}
                        {f.bookingId && <Link href={`/admin/bookings/${f.bookingId}`} className="underline">Booking</Link>}
                      </p>
                      <p className="mt-1">{d?.intake?.complaint || d?.returning?.anythingChanged || "—"}</p>
                      <p className="mt-1 text-xs text-ink/65">Consents: {Object.entries(f.consents).filter(([, v]) => v.granted).map(([k]) => k.replace("_", " ")).join(", ")}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Details">
            <dl className="space-y-2 text-sm">
              {[
                ["Date of birth", c.dob ?? "—"],
                ["Sport", `${c.sport ?? "—"}${c.trainingLevel ? ` (${c.trainingLevel})` : ""}`],
                ["Goals", c.goals ?? "—"],
                ["Heard via", c.referralSource ?? "—"],
                ["Emergency contact", emergency ? `${emergency.name}, ${emergency.phone}${emergency.relationship ? ` (${emergency.relationship})` : ""}` : "—"],
                ["Marketing consent", c.marketingOptIn ? `Yes, since ${c.marketingOptInAt ? formatLocal(c.marketingOptInAt, "d MMM yyyy") : "?"}` : "No"],
                ["Client since", formatLocal(c.createdAt, "d MMM yyyy")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink/65">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card title="Notes, tags & privacy">
            <ClientEditor id={c.id} notes={c.adminNotesEnc ? decrypt(c.adminNotesEnc) : ""} tags={c.tags.join(", ")} marketing={c.marketingOptIn} email={c.email} />
          </Card>
        </div>
      </div>
    </>
  );
}

export default function ClientPage({ params }: PageProps<"/admin/clients/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Profile params={params} />
    </Suspense>
  );
}
