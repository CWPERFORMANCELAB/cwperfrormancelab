/**
 * Dashboard + insights queries. Money = net of refunds. All date maths in Europe/London.
 */
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { requireAdmin } from "@/lib/auth";
import { bookings, clients, payments, refunds, services, voucherRedemptions } from "@/db/schema";
import type { Settings } from "@/lib/settings-schema";
import { addDaysIso, localDateOf, localDayBounds, localToUtc, localWeekday, todayLocal } from "@/lib/time";

export type Range = { start: Date; end: Date };

export function rangeFor(kind: "today" | "week" | "month" | "custom", custom?: { from: string; to: string }, now = new Date()): Range & { label: string; prev: Range } {
  const today = todayLocal(now);
  let fromIso: string, toIso: string, label: string;
  if (kind === "today") {
    fromIso = today;
    toIso = addDaysIso(today, 1);
    label = "Today";
  } else if (kind === "week") {
    const dow = (localWeekday(today) + 6) % 7; // Monday = 0
    fromIso = addDaysIso(today, -dow);
    toIso = addDaysIso(fromIso, 7);
    label = "This week";
  } else if (kind === "month") {
    fromIso = `${today.slice(0, 7)}-01`;
    const [y, m] = today.split("-").map(Number);
    toIso = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    label = "This month";
  } else {
    fromIso = custom!.from;
    toIso = addDaysIso(custom!.to, 1);
    label = "Custom range";
  }
  const start = localToUtc(fromIso, "00:00");
  const end = localToUtc(toIso, "00:00");
  const len = end.getTime() - start.getTime();
  // Previous comparable period: same length immediately before (calendar month for "month").
  let prev: Range;
  if (kind === "month") {
    const [y, m] = fromIso.split("-").map(Number);
    const pFrom = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
    prev = { start: localToUtc(pFrom, "00:00"), end: start };
  } else prev = { start: new Date(start.getTime() - len), end: start };
  return { start, end, label, prev };
}

const NET = sql<number>`coalesce(sum(${payments.amountPence} - ${payments.refundedPence}), 0)::int`;
const REVENUE_KINDS = ["payment", "deposit", "fee", "voucher", "package"] as const;

export async function revenue(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const [row] = await db
    .select({ net: NET, gross: sql<number>`coalesce(sum(${payments.amountPence}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(inArray(payments.status, ["succeeded", "partially_refunded", "refunded"]), inArray(payments.kind, [...REVENUE_KINDS]), gte(payments.createdAt, r.start), lt(payments.createdAt, r.end)));
  return row;
}

export async function revenueByService(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  return db
    .select({ serviceId: services.id, name: services.shortName, net: NET, sessions: sql<number>`count(distinct ${bookings.id})::int` })
    .from(payments)
    .innerJoin(bookings, eq(bookings.id, payments.bookingId))
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .where(and(inArray(payments.status, ["succeeded", "partially_refunded", "refunded"]), gte(payments.createdAt, r.start), lt(payments.createdAt, r.end)))
    .groupBy(services.id, services.shortName)
    .orderBy(desc(NET));
}

export async function moneyBreakdown(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const [vSales] = await db
    .select({ v: NET, n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.kind, "voucher"), inArray(payments.status, ["succeeded", "partially_refunded"]), gte(payments.createdAt, r.start), lt(payments.createdAt, r.end)));
  const [vRedeemed] = await db
    .select({ v: sql<number>`coalesce(sum(${voucherRedemptions.amountPence}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(voucherRedemptions)
    .where(and(sql`${voucherRedemptions.reversedAt} is null`, gte(voucherRedemptions.createdAt, r.start), lt(voucherRedemptions.createdAt, r.end)));
  const [ref] = await db
    .select({ v: sql<number>`coalesce(sum(${refunds.amountPence}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(refunds)
    .where(and(gte(refunds.createdAt, r.start), lt(refunds.createdAt, r.end)));
  // Outstanding: confirmed/attended bookings where the agreed price isn't fully covered yet (deposits, card-on-file).
  const [out] = await db
    .select({
      v: sql<number>`coalesce(sum(greatest(0, ${bookings.pricePence} - ${bookings.discountPence} - ${bookings.voucherPence} - ${bookings.paidPence})), 0)::int`,
      n: sql<number>`count(*) filter (where ${bookings.pricePence} - ${bookings.discountPence} - ${bookings.voucherPence} - ${bookings.paidPence} > 0)::int`,
    })
    .from(bookings)
    .where(inArray(bookings.status, ["confirmed", "attended"]));
  return { voucherSales: vSales, voucherRedemptions: vRedeemed, refunds: ref, outstanding: out };
}

export async function bookingCounts(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const [row] = await db
    .select({
      total: sql<number>`count(*) filter (where ${bookings.status} in ('confirmed','attended','no_show','late_cancelled'))::int`,
      attended: sql<number>`count(*) filter (where ${bookings.status} = 'attended')::int`,
      noShow: sql<number>`count(*) filter (where ${bookings.status} = 'no_show')::int`,
      cancelled: sql<number>`count(*) filter (where ${bookings.status} in ('cancelled','late_cancelled') and coalesce(${bookings.cancelReason}, '') not in ('checkout_expired','released_by_client'))::int`,
      bookedMinutes: sql<number>`coalesce(sum(extract(epoch from (${bookings.endsAt} - ${bookings.startsAt})) / 60) filter (where ${bookings.status} in ('confirmed','attended')), 0)::int`,
    })
    .from(bookings)
    .where(and(gte(bookings.startsAt, r.start), lt(bookings.startsAt, r.end)));
  const denom = row.total + row.cancelled;
  return {
    ...row,
    cancellationRate: denom ? row.cancelled / denom : 0,
    noShowRate: row.total ? row.noShow / row.total : 0,
  };
}

/** Bookable minutes in a range from working hours (ignores time off — utilisation of the standard week). */
export function availableMinutes(hours: Settings["workingHours"], r: Range) {
  let mins = 0;
  for (let d = localDateOf(r.start); localToUtc(d, "00:00") < r.end; d = addDaysIso(d, 1)) {
    for (const h of hours[localWeekday(d) as 0]) {
      const [oh, om] = h.open.split(":").map(Number);
      const [ch, cm] = h.close.split(":").map(Number);
      mins += ch * 60 + cm - (oh * 60 + om);
    }
  }
  return mins;
}

export async function dayFill(db: Db, settings: Settings, fromIso: string, days: number) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const start = localDayBounds(fromIso).start;
  const end = localDayBounds(addDaysIso(fromIso, days)).start;
  const rows = await db
    .select({ startsAt: bookings.startsAt })
    .from(bookings)
    .where(and(inArray(bookings.status, ["confirmed", "attended", "pending_payment", "no_show", "late_cancelled"]), gte(bookings.startsAt, start), lt(bookings.startsAt, end)));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(localDateOf(r.startsAt), (counts.get(localDateOf(r.startsAt)) ?? 0) + 1);
  return Array.from({ length: days }, (_, i) => {
    const d = addDaysIso(fromIso, i);
    const cap = settings.dailyCaps[localWeekday(d) as 0];
    return { dateIso: d, count: counts.get(d) ?? 0, cap };
  });
}

export async function upcoming(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  return db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(and(inArray(bookings.status, ["confirmed", "attended", "no_show", "late_cancelled"]), gte(bookings.startsAt, r.start), lt(bookings.startsAt, r.end)))
    .orderBy(bookings.startsAt);
}

export async function newSince(db: Db, since: Date | null) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  if (!since) return [];
  return db
    .select({ b: bookings, s: services, c: clients })
    .from(bookings)
    .innerJoin(services, eq(services.id, bookings.serviceId))
    .leftJoin(clients, eq(clients.id, bookings.clientId))
    .where(and(eq(bookings.status, "confirmed"), gte(bookings.createdAt, since)))
    .orderBy(desc(bookings.createdAt))
    .limit(20);
}

/* ------------------------------------------------------------------ insights */

export async function insights(db: Db, r: Range) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const firstVisits = (await db.execute(sql`
    with firsts as (
      select client_id, min(starts_at) as first_at from bookings
      where status in ('confirmed','attended') and client_id is not null group by client_id
    )
    select
      count(distinct b.client_id) filter (where f.first_at >= ${r.start} and f.first_at < ${r.end})::int as new_clients,
      count(distinct b.client_id) filter (where f.first_at < ${r.start})::int as returning_clients
    from bookings b join firsts f on f.client_id = b.client_id
    where b.status in ('confirmed','attended') and b.starts_at >= ${r.start} and b.starts_at < ${r.end}
  `)) as unknown as { rows: { new_clients: number; returning_clients: number }[] };

  const retention = (await db.execute(sql`
    with visits as (
      select client_id, starts_at, lead(starts_at) over (partition by client_id order by starts_at) as next_at
      from bookings where status in ('attended','confirmed') and client_id is not null
    )
    select count(*) filter (where next_at is not null and next_at - starts_at <= interval '30 days')::int as rebooked,
           count(*)::int as total
    from visits
    where starts_at >= ${r.start} and starts_at < ${r.end}
      -- only judge visits we can judge: 30 days have passed, or they've already rebooked
      and (starts_at < now() - interval '30 days' or next_at is not null)
  `)) as unknown as { rows: { rebooked: number; total: number }[] };

  const ltv = (await db.execute(sql`
    select count(*)::int as clients,
           coalesce(avg(sessions), 0)::float as avg_sessions,
           coalesce(avg(spend), 0)::float as avg_spend
    from (
      select c.id,
        (select count(*) from bookings b where b.client_id = c.id and b.status = 'attended') as sessions,
        (select coalesce(sum(p.amount_pence - p.refunded_pence), 0) from payments p where p.client_id = c.id and p.status in ('succeeded','partially_refunded')) as spend
      from clients c where exists (select 1 from bookings b where b.client_id = c.id and b.status in ('attended','confirmed'))
    ) t
  `)) as unknown as { rows: { clients: number; avg_sessions: number; avg_spend: number }[] };

  const referrals = await db
    .select({ source: sql<string>`coalesce(${clients.referralSource}, 'Not recorded')`, n: sql<number>`count(*)::int` })
    .from(clients)
    .where(and(gte(clients.createdAt, r.start), lt(clients.createdAt, r.end)))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`));

  const heat = (await db.execute(sql`
    select extract(isodow from starts_at at time zone 'Europe/London')::int as dow,
           extract(hour from starts_at at time zone 'Europe/London')::int as hour,
           count(*)::int as n
    from bookings where status in ('confirmed','attended','no_show','late_cancelled') and starts_at >= ${r.start} and starts_at < ${r.end}
    group by 1, 2
  `)) as unknown as { rows: { dow: number; hour: number; n: number }[] };

  const rows = <T,>(x: { rows: T[] } | T[]) => (Array.isArray(x) ? x : x.rows);
  return {
    clients: rows(firstVisits)[0] ?? { new_clients: 0, returning_clients: 0 },
    retention: rows(retention)[0] ?? { rebooked: 0, total: 0 },
    ltv: rows(ltv)[0] ?? { clients: 0, avg_sessions: 0, avg_spend: 0 },
    referrals,
    heat: rows(heat),
    byService: await revenueByService(db, r),
  };
}
