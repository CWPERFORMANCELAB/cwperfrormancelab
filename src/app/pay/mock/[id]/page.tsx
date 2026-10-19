import { connection } from "next/server";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { payments } from "@/db/schema";
import { formatPenceExact } from "@/lib/money";
import { handleCheckoutCompleted, handleCheckoutExpired } from "@/lib/payments/handlers";
import { mockCheckoutEnabled } from "@/lib/payments/provider";
import { randomToken } from "@/lib/crypto";

export const metadata = { title: "Test checkout", robots: { index: false } };

/**
 * LOCAL MOCK CHECKOUT — only active when STRIPE_SECRET_KEY is not set. Lets the full booking/voucher flow run and
 * be demoed without Stripe. With Stripe configured, this page 404s.
 */
async function MockCheckout({ params }: { params: PageProps<"/pay/mock/[id]">["params"] }) {
  await connection();
  // Unconditionally unavailable outside local development, whatever the payment configuration.
  if (!mockCheckoutEnabled()) notFound();
  const { id } = await params;
  const db = await getDb();
  const [p] = await db.select().from(payments).where(eq(payments.providerSessionId, id));
  if (!p) notFound();
  const meta = p.metadata as { purpose?: string; successUrl?: string; cancelUrl?: string };
  const successUrl = meta.successUrl ?? "/";
  const cancelUrl = meta.cancelUrl ?? "/";

  async function pay() {
    "use server";
    const db = await getDb();
    const [cur] = await db.select().from(payments).where(eq(payments.providerSessionId, id));
    await handleCheckoutCompleted(db, {
      status: "complete",
      sessionId: id,
      paymentIntentId: cur.kind === "setup" ? null : `mock_pi_${randomToken(10)}`,
      setupIntentId: cur.kind === "setup" ? `mock_seti_${randomToken(8)}` : null,
      paymentMethodId: `mock_pm_${randomToken(8)}`,
      customerId: null,
      amountTotalPence: cur.amountPence,
    });
    redirect(successUrl);
  }
  async function cancel() {
    "use server";
    const db = await getDb();
    await handleCheckoutExpired(db, id);
    redirect(cancelUrl);
  }

  return (
    <div className="w-full max-w-md rounded-2xl bg-white p-8 text-ink shadow-2xl">
      <p className="rounded-md bg-warning/15 px-3 py-2 text-xs font-semibold text-ink">TEST MODE: no real payment is taken. Add Stripe keys to use real checkout.</p>
      <p className="mt-6 text-sm text-ink/60">{p.description}</p>
      <p className="mt-1 font-display text-4xl font-semibold tabular-nums">{p.kind === "setup" ? "£0.00" : formatPenceExact(p.amountPence)}</p>
      {p.kind === "setup" && <p className="mt-1 text-sm text-ink/60">Card saved for the cancellation policy. Nothing charged today.</p>}
      <div className="mt-6 space-y-2 rounded-lg border border-ink/10 p-4 font-mono text-sm text-ink/70">
        <p>4242 4242 4242 4242</p>
        <p>12/34 · 123</p>
      </div>
      <form action={pay} className="mt-6">
        <button className="btn-dark w-full">{p.kind === "setup" ? "Save card" : "Pay now"}</button>
      </form>
      <form action={cancel} className="mt-2">
        <button className="btn-ghost-dark w-full">Cancel and go back</button>
      </form>
    </div>
  );
}

export default function MockCheckoutPage({ params }: PageProps<"/pay/mock/[id]">) {
  return (
    <main className="surface-light grid min-h-dvh place-items-center bg-bone px-4 py-10">
      <Suspense fallback={null}>
        <MockCheckout params={params} />
      </Suspense>
    </main>
  );
}
