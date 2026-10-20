import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { business } from "@config/business";
import { AvailabilityCalendar } from "@/components/admin/availability-calendar";
import { PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { calendarRange } from "@/lib/availability/plan";
import { requireAdmin } from "@/lib/auth";
import { todayLocal } from "@/lib/time";

type SP = Record<string, string | string[] | undefined>;
const MONTHS = 2;

/** "2026-10" + n months. */
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

async function Calendar({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const sp = await searchParams;
  const today = todayLocal();
  const thisMonth = today.slice(0, 7);
  const start = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) && sp.month >= thisMonth ? sp.month : thisMonth;
  const months = Array.from({ length: MONTHS }, (_, i) => addMonths(start, i));
  const from = `${months[0]}-01`;
  const to = `${addMonths(start, MONTHS)}-01`;
  const db = await getDb();
  const days = await calendarRange(db, business.practitioner.id, from, daysBetween(from, to));
  const nav = (ym: string) => `/admin/availability?month=${ym}`;
  return <AvailabilityCalendar key={start} months={months} days={days} today={today} prevHref={start > thisMonth ? nav(addMonths(start, -1)) : null} nextHref={nav(addMonths(start, 1))} />;
}

export default function AvailabilityPage({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/bookings" className="text-ink/65 hover:text-ink">← Bookings</Link></p>
      <PageHeader
        title="Availability"
        subtitle="Set your hours, pick the days they apply to, and save. Clients can only book days you've made available, and changes show on the booking page straight away."
        actions={<Link href="/admin/bookings/time-off" className="btn-ghost-dark btn-sm whitespace-nowrap">Time off</Link>}
      />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </>
  );
}
