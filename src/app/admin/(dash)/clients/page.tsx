import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, PageHeader, Table, Td } from "@/components/admin/ui";
import { Download } from "@/components/icons";
import { getDb } from "@/db/client";
import { listClients } from "@/lib/admin/clients";
import { formatPence } from "@/lib/money";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

async function Clients({ searchParams }: { searchParams: PageProps<"/admin/clients">["searchParams"] }) {
  await connection();
  const admin = await requireAdmin();
  const sp = await searchParams;
  const db = await getDb();
  const filters = { q: str(sp.q), tag: str(sp.tag), consent: str(sp.consent) as "yes" | "no" | undefined, segment: str(sp.segment) as "new" | "lapsed" | "regular" | undefined };
  const rows = await listClients(db, filters);
  await audit(db, { actor: admin.email, action: "client.list", entityType: "client", meta: { count: rows.length, filters } });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit", timeZone: "Europe/London" }) : "—");
  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} client${rows.length === 1 ? "" : "s"}`}
        actions={
          <a href={`/api/admin/clients.csv${qs ? `?${qs}` : ""}`} className="btn-ghost-dark btn-sm">
            <Download className="size-4" /> Export CSV
          </a>
        }
      />
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-5" action="/admin/clients">
          <input name="q" defaultValue={filters.q} placeholder="Search name, email, phone" className="field py-2 sm:col-span-2" aria-label="Search" />
          <input name="tag" defaultValue={filters.tag} placeholder="Tag" className="field py-2" aria-label="Tag" />
          <select name="segment" defaultValue={filters.segment ?? ""} className="field py-2" aria-label="Segment">
            <option value="">All clients</option>
            <option value="new">New (last 30 days)</option>
            <option value="regular">Regulars (4+ sessions)</option>
            <option value="lapsed">Lapsed (90+ days)</option>
          </select>
          <div className="flex gap-2">
            <select name="consent" defaultValue={filters.consent ?? ""} className="field py-2" aria-label="Marketing consent">
              <option value="">Any consent</option>
              <option value="yes">Opted in</option>
              <option value="no">Not opted in</option>
            </select>
            <button className="btn-dark btn-sm">Go</button>
          </div>
        </form>
        <Table head={["Client", "Sport", "Heard via", "First / last visit", "Sessions", "Spend", "Voucher", "Mktg"]} empty={rows.length === 0}>
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-ink/[0.02]">
              <Td>
                <Link href={`/admin/clients/${c.id}`} className="font-medium hover:underline">
                  {c.first_name} {c.last_name}
                </Link>
                <span className="block text-xs text-ink/65">{c.email}</span>
                {c.tags.length > 0 && <span className="mt-1 flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-primary/10 px-1.5 text-[10px] text-primary-strong">{t}</span>)}</span>}
              </Td>
              <Td>{c.sport ?? "—"}</Td>
              <Td>{c.referral_source ?? "—"}</Td>
              <Td className="whitespace-nowrap text-xs">{date(c.first_visit)} / {date(c.last_visit)}</Td>
              <Td className="tabular-nums">{c.sessions}</Td>
              <Td className="tabular-nums">{formatPence(c.spend)}</Td>
              <Td className="tabular-nums">{c.voucher_balance ? formatPence(c.voucher_balance) : "—"}</Td>
              <Td>{c.marketing_opt_in ? "Yes" : "No"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

export default function ClientsPage({ searchParams }: PageProps<"/admin/clients">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Clients searchParams={searchParams} />
    </Suspense>
  );
}
