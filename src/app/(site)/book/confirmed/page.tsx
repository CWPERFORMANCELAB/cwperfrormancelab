import { connection } from "next/server";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { business, fullAddress } from "@config/business";
import { getDb } from "@/db/client";
import { bookings, payments, services } from "@/db/schema";
import { Calendar, Car, Check, Clock, MapPin } from "@/components/icons";
import { copy } from "@/lib/content";
import { sha256 } from "@/lib/crypto";
import { formatPence } from "@/lib/money";
import { getPaymentProvider } from "@/lib/payments/provider";
import { handleCheckoutCompleted } from "@/lib/payments/handlers";
import { formatLong } from "@/lib/time";
import { mapsUrl } from "@/lib/url";

export const metadata = { title: "Booking confirmed", robots: { index: false } };

async function Confirmation({ searchParams }: { searchParams: PageProps<"/book/confirmed">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const id = typeof sp.b === "string" ? sp.b : "";
  const token = typeof sp.t === "string" ? sp.t : "";
  const sessionId = typeof sp.session_id === "string" ? sp.session_id : null;
  const db = await getDb();

  let [row] = await db
    .select({ b: bookings, s: services })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(and(eq(bookings.id, id), eq(bookings.holdTokenHash, sha256(token))));
  if (!row) return <p className="text-bone/70">We couldn&apos;t find that booking. Please check your confirmation email.</p>;

  // Fast path: Stripe redirected here before the webhook arrived — confirm from the session directly.
  if (row.b.status === "pending_payment" && sessionId) {
    const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, sessionId));
    if (p?.bookingId === row.b.id) {
      const provider = await getPaymentProvider();
      const s = await provider.retrieveCheckout(sessionId);
      if (s.status === "complete") await handleCheckoutCompleted(db, s);
      [row] = await db.select({ b: bookings, s: services }).from(bookings).innerJoin(services, eq(services.id, bookings.serviceId)).where(eq(bookings.id, id));
    }
  }

  const { b, s } = row;
  if (b.status === "pending_payment") {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Confirming your payment…</h1>
        <p className="mt-3 text-bone/70">This usually takes a few seconds. Your confirmation email is on its way.</p>
        <meta httpEquiv="refresh" content="4" />
      </div>
    );
  }
  if (b.status !== "confirmed") {
    return (
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">This booking isn&apos;t active</h1>
        <p className="mt-3 text-bone/70">
          If you were charged, a full refund has been issued automatically. Please <Link href="/book" className="underline">choose another time</Link> or contact us.
        </p>
      </div>
    );
  }

  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`${s.name} with ${business.practitioner.name}`)}&dates=${b.startsAt.toISOString().replace(/[-:]|\.\d{3}/g, "")}/${b.endsAt.toISOString().replace(/[-:]|\.\d{3}/g, "")}&location=${encodeURIComponent(fullAddress())}`;

  return (
    <div className="animate-rise">
      <span className="grid size-14 place-items-center rounded-full bg-success text-white">
        <Check className="size-7" />
      </span>
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-5xl">{copy.book.confirmedTitle}</h1>
      <p className="mt-3 text-lg text-bone/70">{copy.book.confirmedBody}</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="card p-6">
          <p className="font-display text-xl font-semibold">{s.name}</p>
          <ul className="mt-4 space-y-2 text-bone/80">
            <li className="flex gap-3">
              <Calendar className="mt-0.5 size-5 shrink-0 text-primary-light" /> {formatLong(b.startsAt)}
            </li>
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-primary-light" /> {s.durationMin} minutes
            </li>
            <li className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary-light" /> {fullAddress()}
            </li>
            <li className="flex gap-3">
              <Car className="mt-0.5 size-5 shrink-0 text-primary-light" /> {business.address.parkingNote}
            </li>
          </ul>
          {b.paidPence + b.voucherPence > 0 && <p className="mt-4 border-t border-white/[0.08] pt-4 text-sm text-bone/60">Paid {formatPence(b.paidPence + b.voucherPence)}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={gcal} target="_blank" rel="noopener" className="btn-ghost btn-sm">
              Add to Google Calendar
            </a>
            <a href={mapsUrl()} target="_blank" rel="noopener" className="btn-ghost btn-sm">
              Directions
            </a>
          </div>
        </div>
        <div className="card p-6">
          <p className="font-display text-xl font-semibold">Before you come</p>
          <ul className="mt-4 space-y-3 text-bone/75">
            {copy.book.beforeYouCome.map((x) => (
              <li key={x} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-primary-light" /> {x}
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-white/[0.08] pt-4 text-sm text-bone/60">
            Need to change something? Use the link in your confirmation email to reschedule or cancel.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ConfirmedPage({ searchParams }: PageProps<"/book/confirmed">) {
  return (
    <section className="pt-28 pb-24 sm:pt-36">
      <div className="container-x max-w-4xl">
        <Suspense fallback={<div className="h-80 animate-pulse rounded-xl bg-white/5" />}>
          <Confirmation searchParams={searchParams} />
        </Suspense>
      </div>
    </section>
  );
}
