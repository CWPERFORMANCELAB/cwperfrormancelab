import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { business } from "@config/business";
import { getDb } from "@/db/client";
import { paymentLinks } from "@/db/schema";
import { BookingError } from "@/lib/booking/errors";
import { formatPenceExact } from "@/lib/money";
import { payLink } from "@/lib/payment-links";
import { policySummary } from "@/lib/policy";
import { loadSettings } from "@/lib/settings";
import { formatLong } from "@/lib/time";

export const metadata = { title: "Secure payment", robots: { index: false, follow: false } };

async function PayLink({ params, searchParams }: { params: PageProps<"/pay/[token]">["params"]; searchParams: PageProps<"/pay/[token]">["searchParams"] }) {
  await connection();
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  const db = await getDb();
  const [link] = await db.select().from(paymentLinks).where(eq(paymentLinks.token, token));
  const settings = await loadSettings(db);

  async function pay() {
    "use server";
    const db = await getDb();
    let url: string;
    try {
      url = await payLink(db, token);
    } catch (err) {
      if (err instanceof BookingError) redirect(`/pay/${token}?error=${encodeURIComponent(err.code)}`);
      throw err;
    }
    redirect(url);
  }

  if (!link) return <p>This payment link isn&apos;t valid. Please contact {business.name}.</p>;
  if (link.status === "paid" || sp.paid === "1")
    return (
      <>
        <h1 className="font-display text-2xl font-semibold">Thank you, you&apos;re all set</h1>
        <p className="mt-2 text-ink/65">Payment received. A confirmation is on its way to your inbox.</p>
      </>
    );
  const expired = link.status !== "open" || (link.expiresAt && link.expiresAt < new Date());
  return (
    <>
      <p className="text-sm text-ink/65">{business.name}</p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">{link.description}</h1>
      {link.startsAt && <p className="mt-2 text-ink/70">{formatLong(link.startsAt)}{link.locationType === "home" ? " · Home visit" : ""}</p>}
      <p className="mt-5 font-display text-4xl font-semibold tabular-nums">{formatPenceExact(link.amountPence)}</p>
      {expired ? (
        <p className="mt-6 rounded-md bg-warning/15 px-4 py-3 text-sm">This link has expired. Please contact {business.contact.phone} for a new one.</p>
      ) : (
        <>
          <form action={pay} className="mt-6">
            <button className="btn-primary w-full">Pay securely</button>
          </form>
          {sp.error && <p className="mt-3 text-sm text-danger">Something went wrong. Please try again or contact us.</p>}
          <p className="mt-5 text-xs leading-relaxed text-ink/65">{policySummary(settings.cancellationPolicy)}</p>
        </>
      )}
    </>
  );
}

export default function PayLinkPage(props: PageProps<"/pay/[token]">) {
  return (
    <main className="surface-light grid min-h-dvh place-items-center bg-bone px-4 py-10 text-ink">
      <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">
        <Suspense fallback={<div className="h-48 animate-pulse rounded-lg bg-ink/5" />}>
          <PayLink {...props} />
        </Suspense>
      </div>
    </main>
  );
}
