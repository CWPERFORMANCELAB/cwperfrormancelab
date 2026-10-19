import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { ServiceForm } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { listServices } from "@/lib/settings";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await listServices(db, { includeInactive: true });
  return (
    <div className="space-y-4">
      {rows.map((s) => (
        <Card key={s.id} title={<span>{s.name} <span className="ml-1 font-mono text-xs font-normal text-ink/65">{s.id}</span>{s.placeholder && <span className="ml-2 rounded bg-warning/20 px-1.5 text-[10px] font-semibold">PLACEHOLDER</span>}</span>}>
          <ServiceForm s={{ ...s, price: s.pricePence / 100 }} />
        </Card>
      ))}
    </div>
  );
}

export default function ServicesSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Services & prices" subtitle="Edits apply immediately. Existing bookings keep the price and duration they were booked at. To add or remove a service, see UPDATING-CLIENT-DETAILS.md." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}><List /></Suspense>
    </>
  );
}
