import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { business, fullAddress } from "@config/business";
import { getDb } from "@/db/client";
import { ManageActions } from "@/components/booking/manage";
import { Calendar, Clock, MapPin } from "@/components/icons";
import { findByManageToken } from "@/lib/booking/service";
import { formatPence } from "@/lib/money";
import { canReschedule, clientCancellation, policySummary } from "@/lib/policy";
import { loadSettings } from "@/lib/settings";
import { formatLong } from "@/lib/time";

export const metadata = { title: "Manage your booking", robots: { index: false, follow: false } };

async function Manage({ params }: { params: PageProps<"/manage/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const db = await getDb();
  const row = await findByManageToken(db, token);
  if (!row) {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Link not recognised</h1>
        <p className="mt-3 text-bone/70">
          This link may have expired or been replaced by a newer one. Please use the most recent email, or{" "}
          <Link href="/contact" className="underline">contact us</Link>.
        </p>
      </div>
    );
  }
  const { b, s } = row;
  const settings = await loadSettings(db);
  const now = new Date();
  const policy = settings.cancellationPolicy;
  const active = b.status === "confirmed" && b.startsAt > now;
  const cancel = clientCancellation({ startsAt: b.startsAt, pricePence: b.pricePence - b.discountPence, paidPence: b.paidPence + b.voucherPence }, policy, now);
  const resched = canReschedule(b, policy, now);

  return (
    <div>
      <p className="eyebrow text-primary-light">Your booking</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{s.name}</h1>
      <ul className="mt-6 space-y-2 text-bone/80">
        <li className="flex gap-3">
          <Calendar className="mt-0.5 size-5 text-primary-light" /> {formatLong(b.startsAt)}
        </li>
        <li className="flex gap-3">
          <Clock className="mt-0.5 size-5 text-primary-light" /> {s.durationMin} minutes
        </li>
        <li className="flex gap-3">
          <MapPin className="mt-0.5 size-5 text-primary-light" /> {b.locationType === "home" ? "Home visit" : fullAddress()}
        </li>
      </ul>
      {!active ? (
        <p className="mt-8 rounded-lg bg-white/5 p-5 text-bone/75">
          {b.status === "confirmed" ? "This appointment has passed." : `This booking is ${b.status.replace("_", " ")}.`}{" "}
          <Link href="/book" className="text-primary-light underline">
            Book again
          </Link>
        </p>
      ) : (
        <ManageActions
          token={token}
          serviceId={s.id}
          canReschedule={resched.allowed}
          rescheduleReason={resched.reason}
          cancelSummary={
            cancel.late
              ? `Cancelling now is within ${policy.freeCancelHours} hours of your appointment, so a fee of ${formatPence(cancel.feePence)} applies${cancel.refundPence ? ` and ${formatPence(cancel.refundPence)} will be refunded` : ""}.`
              : cancel.refundPence > 0
                ? `You'll receive a full refund of ${formatPence(cancel.refundPence)}.`
                : "There's no charge for cancelling."
          }
          policy={policySummary(policy)}
        />
      )}
      <p className="mt-10 text-sm text-bone/65">
        Questions? Call {business.contact.phone} or email {business.contact.email}.
      </p>
    </div>
  );
}

export default function ManagePage({ params }: PageProps<"/manage/[token]">) {
  return (
    <section className="pt-28 pb-24 sm:pt-36">
      <div className="container-x max-w-3xl">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-white/5" />}>
          <Manage params={params} />
        </Suspense>
      </div>
    </section>
  );
}
