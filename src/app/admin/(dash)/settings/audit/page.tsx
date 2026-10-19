import { desc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { auditLog } from "@/db/schema";
import { formatLocal } from "@/lib/time";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(300);
  return (
    <Table head={["When", "Who", "Action", "Record"]} empty={rows.length === 0}>
      {rows.map((r) => (
        <tr key={r.id}>
          <Td className="whitespace-nowrap text-xs">{formatLocal(r.createdAt, "d MMM HH:mm:ss")}</Td>
          <Td className="text-xs">{r.actor}</Td>
          <Td><code className="text-xs">{r.action}</code></Td>
          <Td className="text-xs text-ink/65">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function AuditPage() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Audit log" subtitle="Every view of client records and every change, kept for accountability (UK GDPR)." />
      <Card><Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-ink/5" />}><List /></Suspense></Card>
    </>
  );
}
