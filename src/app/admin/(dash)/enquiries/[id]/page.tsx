import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/client";
import { QuoteForm } from "@/components/admin/forms";
import { Badge, Card, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { enquiries } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { listServices } from "@/lib/settings";
import { formatLocal } from "@/lib/time";
import { setEnquiryStatusAction } from "../../actions";

async function Detail({ params }: { params: PageProps<"/admin/enquiries/[id]">["params"] }) {
  await connection();
  const admin = await requireAdmin();
  const { id } = await params;
  const db = await getDb();
  const [e] = await db.select().from(enquiries).where(eq(enquiries.id, id));
  if (!e) notFound();
  await audit(db, { actor: admin.email, action: "enquiry.view", entityType: "enquiry", entityId: id });
  const svc = (await listServices(db, { includeInactive: true })).filter((s) => s.availableAtHome);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/enquiries" className="text-ink/65 hover:text-ink">← Enquiries</Link></p>
      <PageHeader title={e.name} subtitle={<span className="flex items-center gap-2">{e.kind === "home_visit" ? "Home visit request" : "Contact message"} · {formatLocal(e.createdAt, "d MMM yyyy, HH:mm")} <Badge status={e.status} /></span>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Request">
          <dl className="space-y-2 text-sm">
            {[
              ["Email", <a key="e" href={`mailto:${e.email}`} className="underline">{e.email}</a>],
              ["Phone", e.phone ? <a key="p" href={`tel:${e.phone}`} className="underline">{e.phone}</a> : "—"],
              ["Postcode", e.postcode ?? "—"],
              ["Service", svc.find((s) => s.id === e.serviceId)?.name ?? e.serviceId ?? "—"],
              ["Preferred times", e.preferredTimes ?? "—"],
              ["Message", e.message || "—"],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs text-ink/65">{k}</dt>
                <dd className="whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {e.postcode && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(e.postcode)}`} target="_blank" rel="noopener" className="btn-ghost-dark btn-sm">
                Check distance
              </a>
            )}
            {e.status !== "closed" && <ActionButton action={setEnquiryStatusAction.bind(null, e.id, "closed")} className="btn-ghost-dark btn-sm">Mark closed</ActionButton>}
          </div>
        </Card>
        {e.kind === "home_visit" && (
          <Card title="Send a quote">
            <p className="mb-3 text-sm text-ink/60">Sends the client a secure payment link. Add a date and time to hold the slot for 48 hours. It&apos;s confirmed automatically once paid.</p>
            <QuoteForm enquiryId={e.id} services={svc.map((s) => ({ id: s.id, name: s.name, price: s.pricePence / 100 }))} defaultService={e.serviceId} />
          </Card>
        )}
      </div>
    </>
  );
}

export default function EnquiryPage({ params }: PageProps<"/admin/enquiries/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Detail params={params} />
    </Suspense>
  );
}
