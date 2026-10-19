import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { seedServices, seedSettings } from "@config/seed-settings";
import { Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { dbPlaceholderCount, scanFiles } from "@/lib/placeholders";
import { settingMeta, type SettingKey } from "@/lib/settings-schema";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const dbp = await dbPlaceholderCount(db);
  const files = scanFiles({ settings: [...seedSettings] as never, services: seedServices }).filter((i) => i.area !== "Settings" && i.area !== "Services");
  const rows = [
    ...dbp.settings.map((s) => ({ area: "Settings", what: settingMeta[s.key as SettingKey]?.label ?? s.key, note: s.note ?? "", where: "Dashboard → Settings", href: "/admin/settings" })),
    ...dbp.services.map((s) => ({ area: "Services", what: s.name, note: s.note ?? "", where: "Dashboard → Services", href: "/admin/settings/services" })),
    ...files.map((f) => ({ area: f.area, what: f.what, note: `${f.needed} (now: ${f.current})`, where: f.file, href: "" })),
  ];
  return (
    <Table head={["Area", "Item", "What's needed", "Where to change it"]} empty={rows.length === 0}>
      {rows.map((r, i) => (
        <tr key={i}>
          <Td className="whitespace-nowrap">{r.area}</Td>
          <Td className="font-medium">{r.what}</Td>
          <Td className="text-ink/70">{r.note}</Td>
          <Td>{r.href ? <Link href={r.href} className="text-primary-strong underline">{r.where}</Link> : <code className="text-xs">{r.where}</code>}</Td>
        </tr>
      ))}
    </Table>
  );
}

export default function PlaceholdersPage() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Placeholder values" subtitle="Saving a setting or service in the dashboard marks it as confirmed. File-based items are updated by your developer (see CLIENT_TODO.md)." />
      <Card><Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-ink/5" />}><List /></Suspense></Card>
    </>
  );
}
