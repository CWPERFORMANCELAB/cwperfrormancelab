import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CancelForm, NotesForm, OutcomeButtons, RefundForm, RescheduleForm } from "@/components/admin/booking-actions";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { Alert } from "@/components/icons";
import { getDb } from "@/db/client";
import { bookings, clients, intakeForms, paymentLinks, payments, refunds, services } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { compressionContraindications, dryCuppingContraindications, redFlagQuestions } from "@/lib/booking/questions";
import { decrypt, decryptJson } from "@/lib/crypto";
import { formatPence, formatPenceExact, percentOf } from "@/lib/money";
import { loadSettings } from "@/lib/settings";
import { formatLocal, localDateOf, formatTime } from "@/lib/time";
import { siteUrl } from "@/lib/url";

type IntakeData = {
  kind: "full" | "returning";
  intake: Record<string, unknown> & { redFlags?: Record<string, string> } | null;
  returning: { anythingChanged?: string; redFlags?: Record<string, string> } | null;
  dryCupping: Record<string, string> | null;
  compression: Record<string, string> | null;
  clientNotes: string;
};

async function Detail({ params }: { params: PageProps<"/admin/bookings/[id]">["params"] }) {
  await connection();
  const admin = await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  const [row] = await db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(eq(bookings.id, id));
  if (!row) notFound();
  const { b, s, c } = row;
  const settings = await loadSettings(db);
  const [intakeRow] = await db.select().from(intakeForms).where(eq(intakeForms.bookingId, b.id)).orderBy(desc(intakeForms.createdAt)).limit(1);
  const pays = await db.select().from(payments).where(eq(payments.bookingId, b.id)).orderBy(payments.createdAt);
  const refs = pays.length ? await db.select().from(refunds).where(eq(refunds.paymentId, pays[0].id)) : [];
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.bookingId, b.id));
  const intake = decryptJson<IntakeData>(intakeRow?.dataEnc);
  const emergency = decryptJson<{ name: string; phone: string; relationship: string }>(c?.emergencyContactEnc);
  await audit(db, { actor: admin.email, action: "booking.view", entityType: "booking", entityId: b.id, meta: { intakeViewed: Boolean(intakeRow) } });

  const flags = intake?.intake?.redFlags ?? intake?.returning?.redFlags ?? {};
  const yesFlags = redFlagQuestions.filter((q) => flags[q.id] === "yes");
  const fee = percentOf(b.pricePence - b.discountPence, settings.cancellationPolicy.noShowFeePercent);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/bookings" className="text-ink/65 hover:text-ink">
          ← Bookings
        </Link>
      </p>
      <PageHeader title={s.name} subtitle={<span className="flex flex-wrap items-center gap-2">{formatLocal(b.startsAt, "EEEE d MMMM yyyy, HH:mm")}–{formatTime(b.endsAt)} <Badge status={b.status} /> {b.locationType === "home" && <span className="text-xs">Home visit</span>}</span>} />

      {intakeRow?.hasRedFlags && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm" role="alert">
          <Alert className="mt-0.5 size-5 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">Red-flag answers. Review before the session.</p>
            <ul className="mt-1 list-disc pl-5 text-ink/75">{yesFlags.map((q) => <li key={q.id}>{q.label}</li>)}</ul>
          </div>
        </div>
      )}
      {intakeRow?.isMinor && <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">Under 18. Guardian: {intakeRow.guardianConsent?.name} ({intakeRow.guardianConsent?.relationship}) consented {intakeRow.guardianConsent?.at?.slice(0, 10)}.</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Client">
            {c ? (
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <Link href={`/admin/clients/${c.id}`} className="text-base font-semibold hover:underline">
                    {c.firstName} {c.lastName}
                  </Link>
                  <p className="mt-1 text-ink/70">
                    <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
                    <br />
                    {c.phone && <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>}
                    <br />
                    DOB {c.dob ?? "—"}
                  </p>
                </div>
                <div className="text-ink/70">
                  <p><span className="text-ink/65">Sport:</span> {c.sport ?? "—"} {c.trainingLevel && `(${c.trainingLevel})`}</p>
                  <p><span className="text-ink/65">Goals:</span> {c.goals ?? "—"}</p>
                  <p><span className="text-ink/65">Emergency:</span> {emergency ? `${emergency.name} ${emergency.phone} ${emergency.relationship ? `(${emergency.relationship})` : ""}` : "—"}</p>
                  <p><span className="text-ink/65">Heard via:</span> {c.referralSource ?? "—"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink/65">No client attached yet (checkout in progress).</p>
            )}
          </Card>

          <Card title="Intake & consent">
            {!intake ? (
              <p className="text-sm text-ink/65">No intake form for this booking.</p>
            ) : (
              <div className="space-y-4 text-sm">
                {intake.kind === "returning" ? (
                  <p><span className="text-ink/65">Returning client. Anything changed?</span><br />{intake.returning?.anythingChanged || "No changes reported"}</p>
                ) : (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {[["Complaint", "complaint"], ["Medical history", "history"], ["Medications", "medications"]].map(([l, k]) => (
                      <div key={k} className={k === "complaint" ? "sm:col-span-2" : ""}>
                        <dt className="text-xs text-ink/65">{l}</dt>
                        <dd className="whitespace-pre-wrap">{String(intake.intake?.[k] || "—")}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {intake.clientNotes && <p><span className="text-xs text-ink/65">Client notes</span><br />{intake.clientNotes}</p>}
                {intake.dryCupping && (
                  <p className="text-xs text-ink/60">Dry cupping screen: {dryCuppingContraindications.filter((q) => intake.dryCupping?.[q.id] === "yes").map((q) => q.label).join("; ") || "all clear"}</p>
                )}
                {intake.compression && (
                  <p className="text-xs text-ink/60">Compression screen: {compressionContraindications.filter((q) => intake.compression?.[q.id] === "yes").map((q) => q.label).join("; ") || "all clear"}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(intakeRow!.consents).map(([k, v]) => (
                    <span key={k} className={`rounded-full px-2 py-0.5 text-xs ${v.granted ? "bg-success/15" : "bg-ink/8 text-ink/65"}`}>
                      {k.replace("_", " ")}: {v.granted ? "yes" : "no"} · v{v.version}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title="Notes">
            <NotesForm bookingId={b.id} notes={b.adminNotesEnc ? decrypt(b.adminNotesEnc) : ""} clinical={settings.features.clinicalNotes ? (b.clinicalNotesEnc ? decrypt(b.clinicalNotesEnc) : "") : null} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Outcome">
            <OutcomeButtons bookingId={b.id} status={b.status} feeHint={`${settings.cancellationPolicy.noShowFeePercent}% = ${formatPence(fee)}`} />
            {!["confirmed", "attended", "no_show", "late_cancelled"].includes(b.status) && <p className="text-sm text-ink/65">This booking is {b.status.replace("_", " ")}.</p>}
          </Card>

          <Card title="Payment">
            <dl className="space-y-1.5 text-sm">
              {[
                ["Price", b.pricePence],
                ...(b.discountPence ? [["Discount", -b.discountPence]] : []),
                ...(b.voucherPence ? [["Gift voucher", -b.voucherPence]] : []),
                ["Paid by card", b.paidPence],
                ...(b.feeChargedPence ? [["Fees retained/charged", b.feeChargedPence]] : []),
              ].map(([k, v]) => (
                <div key={k as string} className="flex justify-between">
                  <dt className="text-ink/60">{k}</dt>
                  <dd className="tabular-nums">{formatPenceExact(v as number)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t border-ink/10 pt-1.5 font-semibold">
                <dt>Outstanding</dt>
                <dd className="tabular-nums">{formatPenceExact(Math.max(0, b.pricePence - b.discountPence - b.voucherPence - b.paidPence))}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-ink/65">Model: {b.paymentModel.replace("_", " ")}</p>
            {link && link.status === "open" && (
              <p className="mt-3 rounded-lg bg-warning/10 p-3 text-xs">
                Payment link sent, awaiting payment:
                <br />
                <span className="break-all font-mono">{siteUrl(`/pay/${link.token}`)}</span>
              </p>
            )}
            <ul className="mt-4 space-y-3">
              {pays.map((p) => (
                <li key={p.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="capitalize">{p.kind} · {formatPenceExact(p.amountPence)}</span>
                    <Badge status={p.status} />
                  </div>
                  <p className="mt-1 text-xs text-ink/65">
                    {formatLocal(p.createdAt, "d MMM yyyy HH:mm")} · {p.provider} {p.receiptNumber && `· ${p.receiptNumber}`}
                    {p.refundedPence > 0 && ` · refunded ${formatPenceExact(p.refundedPence)}`}
                  </p>
                  {(p.status === "succeeded" || p.status === "partially_refunded") && p.amountPence > p.refundedPence && (
                    <div className="mt-2">
                      <RefundForm paymentId={p.id} max={p.amountPence - p.refundedPence} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {refs.length > 0 && <p className="mt-2 text-xs text-ink/65">{refs.length} refund(s) recorded.</p>}
          </Card>

          {b.status === "confirmed" && (
            <>
              <Card title="Reschedule">
                <RescheduleForm bookingId={b.id} date={localDateOf(b.startsAt)} time={formatTime(b.startsAt)} />
              </Card>
              <Card title="Cancel">
                <CancelForm bookingId={b.id} />
              </Card>
            </>
          )}
          <p className="text-xs text-ink/65">
            Booked {formatLocal(b.createdAt, "d MMM yyyy HH:mm")} via {b.source.replace("_", " ")}. Buffer {b.bufferMin} min.
          </p>
        </div>
      </div>
    </>
  );
}

export default function BookingDetailPage({ params }: PageProps<"/admin/bookings/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Detail params={params} />
    </Suspense>
  );
}
