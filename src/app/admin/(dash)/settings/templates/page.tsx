import { asc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { TemplateForm } from "@/components/admin/forms";
import { PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { notificationTemplates } from "@/db/schema";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(notificationTemplates).orderBy(asc(notificationTemplates.name));
  return (
    <div className="space-y-3">
      {rows.map((t) => (
        <details key={t.key} className="rounded-xl border border-ink/[0.08] bg-white">
          <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-sm">
            <span className="font-medium">{t.name}</span>
            <span className="text-xs text-ink/65">{t.channel.toUpperCase()}{t.enabled ? "" : " · off"}</span>
          </summary>
          <div className="border-t border-ink/[0.06] p-5"><TemplateForm t={t} /></div>
        </details>
      ))}
    </div>
  );
}

export default function TemplatesSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Emails & SMS" subtitle="Use {{variables}} like {{clientFirstName}}, {{serviceName}}, {{startLong}}, {{address}}, {{manageUrl}}, {{policySummary}}. Business details are filled in automatically." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}><List /></Suspense>
    </>
  );
}
