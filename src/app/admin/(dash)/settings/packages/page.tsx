import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { PackageForm } from "@/components/admin/package-form";
import { Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { clients, packagePurchases, packages } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { listServices, loadSettings } from "@/lib/settings";
import { formatLocal } from "@/lib/time";

async function Body() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const settings = await loadSettings(db);
  const [pk, svc, sold] = await Promise.all([
    db.select().from(packages),
    listServices(db, { includeInactive: true }),
    db.select({ pp: packagePurchases, c: clients, pk: packages }).from(packagePurchases).innerJoin(clients, eq(clients.id, packagePurchases.clientId)).innerJoin(packages, eq(packages.id, packagePurchases.packageId)).orderBy(desc(packagePurchases.createdAt)).limit(100),
  ]);
  return (
    <>
      {!settings.features.packages && <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">Packages are switched <strong>off</strong>. Turn on the <code>packages</code> feature flag in Settings to show /packages on the site and accept package codes at checkout.</p>}
      <Card title="Add or update a package" className="mb-4">
        <PackageForm services={svc.map((s) => ({ id: s.id, name: s.name }))} />
      </Card>
      <Card title="Packages" className="mb-4">
        <Table head={["ID", "Name", "Sessions", "Price", "Valid for"]} empty={pk.length === 0}>
          {pk.map((p) => (
            <tr key={p.id}><Td className="font-mono text-xs">{p.id}</Td><Td>{p.name}</Td><Td>{p.credits}</Td><Td>{formatPence(p.pricePence)}</Td><Td>{p.validityDays} days</Td></tr>
          ))}
        </Table>
      </Card>
      <Card title="Sold">
        <Table head={["Client", "Package", "Code", "Credits left", "Expires", "Status"]} empty={sold.length === 0}>
          {sold.map(({ pp, c, pk }) => (
            <tr key={pp.id}><Td>{c.firstName} {c.lastName}</Td><Td>{pk.name}</Td><Td className="font-mono">{pp.code}</Td><Td>{pp.creditsRemaining}/{pp.creditsTotal}</Td><Td>{formatLocal(pp.expiresAt, "d MMM yyyy")}</Td><Td>{pp.status}</Td></tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

export default function PackagesSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Packages & blocks" subtitle="Sell multi-session blocks with credit tracking. Each booking uses one credit." />
      <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-ink/5" />}><Body /></Suspense>
    </>
  );
}
