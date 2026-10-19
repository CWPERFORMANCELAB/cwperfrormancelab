import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BarList, Badge, Card, Empty, PageHeader, Segmented, Stat } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { availableMinutes, bookingCounts, dayFill, moneyBreakdown, newSince, rangeFor, revenue, revenueByService, upcoming } from "@/lib/admin/stats";
import { currentSession, requireAdmin } from "@/lib/auth";
import { formatPence } from "@/lib/money";
import { loadSettings } from "@/lib/settings";
import { formatLocal, formatTime, todayLocal } from "@/lib/time";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const delta = (a: number, b: number) => (b ? (a - b) / b : a ? 1 : null);

async function Overview({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const sp = await searchParams;
  const period = (["today", "week", "month", "custom"] as const).find((p) => p === sp.period) ?? "week";
  const custom = typeof sp.from === "string" && typeof sp.to === "string" ? { from: sp.from, to: sp.to } : undefined;
  const r = rangeFor(period === "custom" && !custom ? "week" : period, custom);
  const db = await getDb();
  const settings = await loadSettings(db);
  const session = await currentSession();

  const today = rangeFor("today");
  const week = rangeFor("week");
  const [rev, prevRev, bySvc, money, counts, prevCounts, todayList, weekList, fill, fresh] = await Promise.all([
    revenue(db, r),
    revenue(db, r.prev),
    revenueByService(db, r),
    moneyBreakdown(db, r),
    bookingCounts(db, r),
    bookingCounts(db, r.prev),
    upcoming(db, today),
    upcoming(db, week),
    dayFill(db, settings, todayLocal(), 7),
    newSince(db, session?.u.previousLoginAt ?? null),
  ]);
  const avail = availableMinutes(settings.workingHours, r);
  const util = avail ? counts.bookedMinutes / avail : 0;
  const prevAvail = availableMinutes(settings.workingHours, r.prev);
  const prevUtil = prevAvail ? prevCounts.bookedMinutes / prevAvail : 0;

  const periods = [
    { key: "today", label: "Today", href: "/admin?period=today" },
    { key: "week", label: "Week", href: "/admin?period=week" },
    { key: "month", label: "Month", href: "/admin?period=month" },
  ];

  return (
    <>
      <PageHeader
        title={`Hi ${session?.u.name.split(" ")[0] ?? "there"}`}
        subtitle={`${r.label} · ${formatLocal(r.start, "d MMM")} – ${formatLocal(new Date(r.end.getTime() - 1), "d MMM yyyy")}`}
        actions={
          <>
            <Segmented items={periods} active={period} />
            <form className="flex items-center gap-1 text-sm" action="/admin">
              <input type="hidden" name="period" value="custom" />
              <input type="date" name="from" defaultValue={custom?.from} className="rounded-md border border-ink/10 bg-white px-2 py-1.5" aria-label="From" />
              <input type="date" name="to" defaultValue={custom?.to} className="rounded-md border border-ink/10 bg-white px-2 py-1.5" aria-label="To" />
              <button className="rounded-md bg-ink px-3 py-1.5 text-white">Go</button>
            </form>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue (net of refunds)" value={formatPence(rev.net)} delta={delta(rev.net, prevRev.net)} />
        <Stat label="Appointments" value={String(counts.total)} delta={delta(counts.total, prevCounts.total)} />
        <Stat label="Utilisation" value={pct(util)} delta={delta(util, prevUtil)} hint="Booked time ÷ working hours" />
        <Stat label="Cancellations · no-shows" value={`${pct(counts.cancellationRate)} · ${pct(counts.noShowRate)}`} hint={`${counts.cancelled} cancelled, ${counts.noShow} no-show`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Today" action={<Link href="/admin/bookings?view=day" className="text-xs text-primary-strong">Calendar</Link>} className="lg:col-span-2" padded={false}>
          {todayList.length === 0 ? (
            <Empty>No appointments today.</Empty>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {todayList.map(({ b, s, c }) => (
                <li key={b.id}>
                  <Link href={`/admin/bookings/${b.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink/[0.02]">
                    <span className="w-12 font-display font-semibold tabular-nums">{formatTime(b.startsAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c ? `${c.firstName} ${c.lastName}` : "—"}</span>
                      <span className="block truncate text-xs text-ink/65">
                        {s.shortName}
                        {b.locationType === "home" ? " · Home visit" : ""}
                      </span>
                    </span>
                    <Badge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Next 7 days vs daily cap">
          <ul className="space-y-2.5">
            {fill.map((d) => (
              <li key={d.dateIso} className="flex items-center gap-3 text-sm" title={`${d.count} of ${d.cap} booked`}>
                <span className="w-16 shrink-0 text-ink/60">{formatLocal(new Date(`${d.dateIso}T12:00:00Z`), "EEE d")}</span>
                <div className="h-2 flex-1 rounded-full bg-ink/[0.06]">
                  {d.cap > 0 && <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (d.count / d.cap) * 100)}%` }} />}
                </div>
                <span className="w-12 shrink-0 text-right tabular-nums text-ink/70">{d.cap ? `${d.count}/${d.cap}` : "Closed"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Revenue by service" className="lg:col-span-2">
          <BarList rows={bySvc.map((x) => ({ label: x.name, value: x.net, sub: `${x.sessions} sessions` }))} format={formatPence} />
        </Card>
        <Card title="Money in & out">
          <dl className="space-y-3 text-sm">
            {[
              ["Voucher sales", money.voucherSales.v, `${money.voucherSales.n} sold`],
              ["Voucher redemptions", money.voucherRedemptions.v, `${money.voucherRedemptions.n} used`],
              ["Refunds", money.refunds.v, `${money.refunds.n} refunds`],
              ["Outstanding balances", money.outstanding.v, `${money.outstanding.n} bookings`],
            ].map(([k, v, n]) => (
              <div key={k as string} className="flex items-baseline justify-between gap-3">
                <dt className="text-ink/65">{k}</dt>
                <dd className="text-right">
                  <span className="font-semibold tabular-nums">{formatPence(v as number)}</span>
                  <span className="block text-xs text-ink/65">{n}</span>
                </dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={`New since your last login (${fresh.length})`} padded={false}>
          {fresh.length === 0 ? (
            <Empty>Nothing new.</Empty>
          ) : (
            <ul className="divide-y divide-ink/[0.06]">
              {fresh.map(({ b, s, c }) => (
                <li key={b.id}>
                  <Link href={`/admin/bookings/${b.id}`} className="flex justify-between gap-3 px-5 py-3 text-sm hover:bg-ink/[0.02]">
                    <span>
                      <span className="font-medium">{c ? `${c.firstName} ${c.lastName}` : "—"}</span> · {s.shortName}
                    </span>
                    <span className="text-ink/65">{formatLocal(b.startsAt, "EEE d MMM, HH:mm")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={`This week (${weekList.length})`} action={<Link href="/admin/bookings" className="text-xs text-primary-strong">All bookings</Link>} padded={false}>
          {weekList.length === 0 ? (
            <Empty>No bookings this week.</Empty>
          ) : (
            <ul className="max-h-80 divide-y divide-ink/[0.06] overflow-y-auto">
              {weekList.map(({ b, s, c }) => (
                <li key={b.id}>
                  <Link href={`/admin/bookings/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm hover:bg-ink/[0.02]">
                    <span className="w-28 shrink-0 text-ink/60">{formatLocal(b.startsAt, "EEE d, HH:mm")}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {c ? `${c.firstName} ${c.lastName}` : "—"} · {s.shortName}
                    </span>
                    <Badge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export default function AdminHome(props: PageProps<"/admin">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Overview {...props} />
    </Suspense>
  );
}
