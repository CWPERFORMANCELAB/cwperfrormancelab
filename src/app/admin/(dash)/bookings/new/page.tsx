import { asc, isNull } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { ManualBookingForm } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema";
import { listServices } from "@/lib/settings";
import { todayLocal } from "@/lib/time";

async function Form() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const [svc, cl] = await Promise.all([
    listServices(db, { includeInactive: true }),
    db.select({ id: clients.id, f: clients.firstName, l: clients.lastName, e: clients.email }).from(clients).where(isNull(clients.archivedAt)).orderBy(asc(clients.lastName)),
  ]);
  return (
    <ManualBookingForm
      services={svc.map((s) => ({ id: s.id, name: `${s.name} (${s.durationMin} min)`, price: s.pricePence / 100 }))}
      clients={cl.map((c) => ({ id: c.id, label: `${c.f} ${c.l} · ${c.e}` }))}
      today={todayLocal()}
    />
  );
}

export default function NewBookingPage() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/bookings" className="text-ink/65 hover:text-ink">← Bookings</Link></p>
      <PageHeader title="New booking" subtitle="For phone, in-person or home-visit bookings. Clients can still book themselves online." />
      <Card>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-ink/5" />}>
          <Form />
        </Suspense>
      </Card>
    </>
  );
}
