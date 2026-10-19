import { eq, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageHero } from "@/components/site/blocks";
import { getDb } from "@/db/client";
import { clients, packages } from "@/db/schema";
import { getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";

export const metadata = { title: "Session packages" };

/** Behind the `packages` feature flag (404 while off). */
async function Packages({ searchParams }: { searchParams: PageProps<"/packages">["searchParams"] }) {
  await connection();
  const { features } = await getCatalog();
  if (!features.packages) notFound();
  const sp = await searchParams;
  const db = await getDb();
  const list = await db.select().from(packages).where(eq(packages.active, true));

  async function buy(form: FormData) {
    "use server";
    const db = await getDb();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const name = String(form.get("name") ?? "").trim();
    if (!email.includes("@") || !name) redirect("/packages?error=1");
    const [first, ...rest] = name.split(" ");
    const [existing] = await db.select().from(clients).where(eq(sql`lower(${clients.email})`, email));
    const clientId = existing?.id ?? (await db.insert(clients).values({ firstName: first, lastName: rest.join(" ") || "-", email }).returning())[0].id;
    const { buyPackage } = await import("@/lib/packages");
    redirect(await buyPackage(db, { packageId: String(form.get("packageId")), clientId, email, name }));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sp.bought && <p className="rounded-lg bg-success/15 p-4 md:col-span-2">Thanks! Your package code is on its way by email.</p>}
      {list.map((p) => (
        <form key={p.id} action={buy} className="surface-light rounded-card bg-bone p-6 text-ink">
          <input type="hidden" name="packageId" value={p.id} />
          <p className="font-display text-2xl font-semibold">{p.name}</p>
          <p className="mt-1 text-ink/60">{p.credits} sessions · valid {Math.round(p.validityDays / 30)} months</p>
          <p className="mt-4 font-display text-3xl font-semibold">{formatPence(p.pricePence)}</p>
          <div className="mt-4 grid gap-2">
            <input name="name" required placeholder="Your name" className="field" aria-label="Your name" />
            <input name="email" type="email" required placeholder="Email" className="field" aria-label="Email" />
            <button className="btn-primary">Buy package</button>
          </div>
        </form>
      ))}
    </div>
  );
}

export default function PackagesPage(props: PageProps<"/packages">) {
  return (
    <>
      <PageHero eyebrow="Packages" title="Session packages" lede="Save when you book a block of sessions. You'll get a code to use each time you book." />
      <section className="pb-24"><div className="container-x"><Suspense fallback={null}><Packages {...props} /></Suspense></div></section>
    </>
  );
}
