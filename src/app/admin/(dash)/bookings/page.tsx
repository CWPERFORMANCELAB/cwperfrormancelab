import { and, desc, eq, gte, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { Badge, Card, PageHeader, Segmented, Table, Td } from "@/components/admin/ui";
import { ChevronLeft, ChevronRight, Plus } from "@/components/icons";
import { getDb } from "@/db/client";
import { blockedTimes, bookings, clients, services } from "@/db/schema";
import { formatPence } from "@/lib/money";
import { loadSettings } from "@/lib/settings";
import { addDaysIso, formatLocal, formatTime, localDateOf, localDayBounds, localWeekday, todayLocal } from "@/lib/time";

type SP = Record<string, string | string[] | undefined>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const STATUSES = ["confirmed", "pending_payment", "attended", "no_show", "late_cancelled", "cancelled"] as const;

async function Bookings({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const sp = await searchParams;
  const view = (["list", "day", "week"] as const).find((v) => v === sp.view) ?? "list";
  const date = str(sp.date) ?? todayLocal();
  const db = await getDb();
  const svcList = await db.select({ id: services.id, name: services.shortName }).from(services);

  const views = (["list", "day", "week"] as const).map((v) => ({ key: v, label: v[0].toUpperCase() + v.slice(1), href: `/admin/bookings?view=${v}&date=${date}` }));
  const header = (
    <PageHeader
      title="Bookings"
      actions={
        <>
          <Segmented items={views} active={view} />
          <Link href="/admin/bookings/time-off" className="btn-ghost-dark btn-sm">
            Time off
          </Link>
          <Link href="/admin/bookings/new" className="btn-primary btn-sm">
            <Plus className="size-4" /> New booking
          </Link>
        </>
      }
    />
  );

  if (view !== "list") {
    const startIso = view === "week" ? addDaysIso(date, -((localWeekday(date) + 6) % 7)) : date;
    const days = view === "week" ? 7 : 1;
    const range = { start: localDayBounds(startIso).start, end: localDayBounds(addDaysIso(startIso, days)).start };
    const settings = await loadSettings(db);
    const rows = await db
      .select({ b: bookings, s: services, c: clients })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .leftJoin(clients, eq(clients.id, bookings.clientId))
      .where(and(inArray(bookings.status, ["confirmed", "pending_payment", "attended", "no_show", "late_cancelled"]), gte(bookings.startsAt, range.start), lt(bookings.startsAt, range.end)))
      .orderBy(bookings.startsAt);
    const blocks = await db.select().from(blockedTimes).where(and(lt(blockedTimes.startsAt, range.end), gte(blockedTimes.endsAt, range.start)));
    const H0 = 7;
    const H1 = 21;
    const pxPerMin = 1.1;
    const dayIsos = Array.from({ length: days }, (_, i) => addDaysIso(startIso, i));
    const top = (d: Date, dayIso: string) => Math.max(0, (d.getTime() - localDayBounds(dayIso).start.getTime()) / 60000 - H0 * 60) * pxPerMin;
    const step = view === "week" ? 7 : 1;
    return (
      <>
        {header}
        <div className="mb-3 flex items-center gap-2">
          <Link href={`/admin/bookings?view=${view}&date=${addDaysIso(startIso, -step)}`} className="grid size-9 place-items-center rounded-lg border border-ink/10 bg-white" aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={`/admin/bookings?view=${view}&date=${todayLocal()}`} className="rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-sm">
            Today
          </Link>
          <Link href={`/admin/bookings?view=${view}&date=${addDaysIso(startIso, step)}`} className="grid size-9 place-items-center rounded-lg border border-ink/10 bg-white" aria-label="Next">
            <ChevronRight className="size-4" />
          </Link>
          <p className="ml-2 font-medium">
            {formatLocal(new Date(`${startIso}T12:00:00Z`), view === "week" ? "d MMM" : "EEEE d MMMM yyyy")}
            {view === "week" && ` – ${formatLocal(new Date(`${addDaysIso(startIso, 6)}T12:00:00Z`), "d MMM yyyy")}`}
          </p>
        </div>
        <Card padded={false}>
          <div className="overflow-x-auto">
            <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.5rem repeat(${days}, minmax(0, 1fr))` }}>
              <div />
              {dayIsos.map((d) => {
                const cap = settings.dailyCaps[localWeekday(d) as 0];
                const n = rows.filter((r) => localDateOf(r.b.startsAt) === d).length;
                return (
                  <Link key={d} href={`/admin/bookings?view=day&date=${d}`} className={`border-b border-l border-ink/[0.06] px-2 py-2 text-center text-xs ${d === todayLocal() ? "bg-primary/5 font-semibold" : ""}`}>
                    {formatLocal(new Date(`${d}T12:00:00Z`), "EEE d")}
                    <span className="block text-[10px] text-ink/65">{cap ? `${n}/${cap}` : "Closed"}</span>
                  </Link>
                );
              })}
              <div className="relative" style={{ height: (H1 - H0) * 60 * pxPerMin }}>
                {Array.from({ length: H1 - H0 }, (_, i) => (
                  <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-ink/65" style={{ top: i * 60 * pxPerMin }}>
                    {String(H0 + i).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {dayIsos.map((d) => (
                <div key={d} className="relative border-l border-ink/[0.06]" style={{ height: (H1 - H0) * 60 * pxPerMin }}>
                  {Array.from({ length: H1 - H0 }, (_, i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-ink/[0.05]" style={{ top: i * 60 * pxPerMin }} />
                  ))}
                  {blocks
                    .filter((bl) => localDateOf(bl.startsAt) <= d && localDateOf(new Date(bl.endsAt.getTime() - 1)) >= d)
                    .map((bl) => {
                      const s = bl.startsAt < localDayBounds(d).start ? localDayBounds(d).start : bl.startsAt;
                      const e = bl.endsAt > localDayBounds(d).end ? localDayBounds(d).end : bl.endsAt;
                      return (
                        <div key={bl.id + d} className="absolute inset-x-0.5 rounded bg-ink/[0.07] p-1 text-[10px] text-ink/65 [background-image:repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_srgb,currentColor_8%,transparent)_6px_7px)]" style={{ top: top(s, d), height: Math.max(14, top(e, d) - top(s, d)) }}>
                          {bl.reason ?? "Blocked"}
                        </div>
                      );
                    })}
                  {rows
                    .filter((r) => localDateOf(r.b.startsAt) === d)
                    .map(({ b, s, c }) => (
                      <Link
                        key={b.id}
                        href={`/admin/bookings/${b.id}`}
                        title={`${formatTime(b.startsAt)} ${s.shortName}${c ? ` · ${c.firstName} ${c.lastName}` : ""}`}
                        className={`absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-[11px] leading-tight shadow-sm ${b.status === "pending_payment" ? "border-warning bg-warning/15" : b.status === "no_show" || b.status === "late_cancelled" ? "border-danger bg-danger/10" : "border-primary bg-primary/10"}`}
                        style={{ top: top(b.startsAt, d), height: Math.max(22, ((b.endsAt.getTime() - b.startsAt.getTime()) / 60000) * pxPerMin - 2) }}
                      >
                        <span className="font-semibold">{formatTime(b.startsAt)}</span> {c ? `${c.firstName} ${c.lastName.charAt(0)}.` : ""}
                        <span className="block truncate text-ink/60">{s.shortName}</span>
                      </Link>
                    ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </>
    );
  }

  // List view with filters
  const status = str(sp.status);
  const serviceId = str(sp.service);
  const q = str(sp.q)?.trim();
  const from = str(sp.from);
  const to = str(sp.to);
  const scope = str(sp.scope) ?? "upcoming";
  const where: SQL[] = [];
  if (status && (STATUSES as readonly string[]).includes(status)) where.push(eq(bookings.status, status as (typeof STATUSES)[number]));
  else where.push(inArray(bookings.status, ["confirmed", "pending_payment", "attended", "no_show", "late_cancelled", "cancelled"]));
  if (serviceId) where.push(eq(bookings.serviceId, serviceId));
  if (q) where.push(or(ilike(clients.firstName, `%${q}%`), ilike(clients.lastName, `%${q}%`), ilike(clients.email, `%${q}%`))!);
  if (from) where.push(gte(bookings.startsAt, localDayBounds(from).start));
  if (to) where.push(lt(bookings.startsAt, localDayBounds(to).end));
  if (!from && !to && scope === "upcoming") where.push(gte(bookings.startsAt, localDayBounds(todayLocal()).start));
  const rows = await db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(and(...where))
    .orderBy(scope === "upcoming" && !from ? bookings.startsAt : desc(bookings.startsAt))
    .limit(200);

  return (
    <>
      {header}
      <Card>
        <form className="mb-4 grid gap-2 sm:grid-cols-6" action="/admin/bookings">
          <input name="q" defaultValue={q} placeholder="Search client" className="field py-2 sm:col-span-2" aria-label="Search client" />
          <select name="status" defaultValue={status ?? ""} className="field py-2" aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select name="service" defaultValue={serviceId ?? ""} className="field py-2" aria-label="Service">
            <option value="">All services</option>
            {svcList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="scope" defaultValue={scope} className="field py-2" aria-label="When">
            <option value="upcoming">Upcoming</option>
            <option value="all">All dates</option>
          </select>
          <button className="btn-dark btn-sm">Filter</button>
          <input type="date" name="from" defaultValue={from} className="field py-2" aria-label="From date" />
          <input type="date" name="to" defaultValue={to} className="field py-2" aria-label="To date" />
        </form>
        <Table head={["When", "Client", "Service", "Status", "Paid"]} empty={rows.length === 0}>
          {rows.map(({ b, s, c }) => (
            <tr key={b.id} className="hover:bg-ink/[0.02]">
              <Td>
                <Link href={`/admin/bookings/${b.id}`} className="font-medium hover:underline">
                  {formatLocal(b.startsAt, "EEE d MMM yyyy, HH:mm")}
                </Link>
              </Td>
              <Td>{c ? <Link href={`/admin/clients/${c.id}`} className="hover:underline">{`${c.firstName} ${c.lastName}`}</Link> : "—"}</Td>
              <Td>
                {s.shortName}
                {b.locationType === "home" && <span className="ml-1 text-xs text-ink/65">(home)</span>}
              </Td>
              <Td>
                <Badge status={b.status} />
              </Td>
              <Td className="tabular-nums">{formatPence(b.paidPence + b.voucherPence)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

export default function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}
