import { desc } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { Badge, Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { enquiries } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { formatLocal } from "@/lib/time";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(enquiries).orderBy(desc(enquiries.createdAt)).limit(200);
  return (
    <Table head={["Received", "From", "Type", "Postcode", "Status", "Quote"]} empty={rows.length === 0}>
      {rows.map((e) => (
        <tr key={e.id} className="hover:bg-ink/[0.02]">
          <Td className="whitespace-nowrap">{formatLocal(e.createdAt, "d MMM, HH:mm")}</Td>
          <Td>
            <Link href={`/admin/enquiries/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
            <span className="block text-xs text-ink/65">{e.email}</span>
          </Td>
          <Td>{e.kind === "home_visit" ? "Home visit" : "Contact"}</Td>
          <Td>{e.postcode ?? "—"}</Td>
          <Td><Badge status={e.status} /></Td>
          <Td className="tabular-nums">{e.quotePence ? formatPence(e.quotePence) : "—"}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function EnquiriesPage() {
  return (
    <>
      <PageHeader title="Enquiries" subtitle="Home-visit requests and contact-form messages." />
      <Card>
        <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-ink/5" />}>
          <List />
        </Suspense>
      </Card>
    </>
  );
}
