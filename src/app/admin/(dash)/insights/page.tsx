import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { BarList, Card, PageHeader, Segmented, Stat } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { insights, rangeFor } from "@/lib/admin/stats";
import { formatPence } from "@/lib/money";
import { addDaysIso, localToUtc, todayLocal } from "@/lib/time";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

async function Insights({ searchParams }: { searchParams: PageProps<"/admin/insights">["searchParams"] }) {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const sp = await searchParams;
  const months = sp.range === "3m" ? 3 : sp.range === "12m" ? 12 : 6;
  const end = localToUtc(addDaysIso(todayLocal(), 1), "00:00");
  const start = new Date(end);
  start.setUTCMonth(start.getUTCMonth() - months);
  const db = await getDb();
  const d = await insights(db, { start, end });
  void rangeFor;

  const totalClients = d.clients.new_clients + d.clients.returning_clients;
  const retention = d.retention.total ? d.retention.rebooked / d.retention.total : 0;
  const hours = Array.from({ length: 13 }, (_, i) => i + 7);
  const max = Math.max(1, ...d.heat.map((h) => h.n));
  const cell = (dow: number, hour: number) => d.heat.find((h) => h.dow === dow && h.hour === hour)?.n ?? 0;

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle={`Last ${months} months`}
        actions={<Segmented active={`${months}`} items={[{ key: "3", label: "3 months", href: "/admin/insights?range=3m" }, { key: "6", label: "6 months", href: "/admin/insights?range=6m" }, { key: "12", label: "12 months", href: "/admin/insights?range=12m" }]} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New vs returning clients" value={`${d.clients.new_clients} · ${d.clients.returning_clients}`} hint={totalClients ? `${Math.round((d.clients.new_clients / totalClients) * 100)}% new` : "No clients yet"} />
        <Stat label="Rebooked within 30 days" value={`${Math.round(retention * 100)}%`} hint={`${d.retention.rebooked} of ${d.retention.total} visits`} />
        <Stat label="Avg sessions per client" value={d.ltv.avg_sessions.toFixed(1)} hint={`${d.ltv.clients} clients all-time`} />
        <Stat label="Avg lifetime value" value={formatPence(Math.round(d.ltv.avg_spend))} hint="Net spend per client, all-time" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Most profitable services">
          <BarList rows={d.byService.map((s) => ({ label: s.name, value: s.net, sub: `${s.sessions} sessions` }))} format={formatPence} />
        </Card>
        <Card title="Top referral sources (new clients)">
          <BarList rows={d.referrals.map((r) => ({ label: r.source, value: r.n }))} format={(n) => `${n} client${n === 1 ? "" : "s"}`} />
        </Card>
      </div>
      <Card title="Busiest days & times" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-center text-[11px]">
            <caption className="sr-only">Number of appointments by weekday and start hour</caption>
            <thead>
              <tr>
                <th />
                {hours.map((h) => (
                  <th key={h} scope="col" className="font-normal text-ink/65">{String(h).padStart(2, "0")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DOW.map((day, i) => (
                <tr key={day}>
                  <th scope="row" className="pr-2 text-right font-normal text-ink/65">{day}</th>
                  {hours.map((h) => {
                    const n = cell(i + 1, h);
                    const pct = n ? 12 + Math.round((n / max) * 88) : 0;
                    return (
                      <td
                        key={h}
                        title={`${day} ${String(h).padStart(2, "0")}:00 — ${n} appointment${n === 1 ? "" : "s"}`}
                        className={`h-8 rounded ${pct > 55 ? "text-on-primary" : "text-ink/70"}`}
                        style={{ background: n ? `color-mix(in srgb, var(--brand-primary) ${pct}%, var(--brand-white))` : "color-mix(in srgb, var(--brand-ink) 4%, transparent)" }}
                      >
                        {n || ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink/65">Darker = busier. Numbers are appointments starting in that hour.</p>
      </Card>
    </>
  );
}

export default function InsightsPage({ searchParams }: PageProps<"/admin/insights">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Insights searchParams={searchParams} />
    </Suspense>
  );
}
