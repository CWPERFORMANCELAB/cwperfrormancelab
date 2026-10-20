import { asc, gte } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { RemoveTimeOff, TimeOffForm } from "@/components/admin/forms";
import { Card, Empty, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { blockedTimes } from "@/db/schema";
import { formatLocal, todayLocal } from "@/lib/time";

async function List() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const rows = await db.select().from(blockedTimes).where(gte(blockedTimes.endsAt, new Date())).orderBy(asc(blockedTimes.startsAt)).limit(200);
  if (!rows.length) return <Empty>No upcoming time off.</Empty>;
  return (
    <ul className="divide-y divide-ink/[0.06]">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span>
            <span className="font-medium">{formatLocal(r.startsAt, "EEE d MMM HH:mm")}</span> → {formatLocal(r.endsAt, "EEE d MMM HH:mm")}
            <span className="ml-2 text-ink/65">{r.reason}</span>
            {r.source === "google" && <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-xs">Google Calendar</span>}
          </span>
          {r.source === "manual" && <RemoveTimeOff id={r.id} />}
        </li>
      ))}
    </ul>
  );
}

async function Form() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  return <TimeOffForm today={todayLocal()} />;
}

export default function TimeOffPage() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/bookings" className="text-ink/65 hover:text-ink">← Bookings</Link></p>
      <PageHeader title="Time off & holidays" subtitle={<>Blocked time can&apos;t be booked online. Existing bookings aren&apos;t affected. Move or cancel them separately. Your bookable hours are set in <Link href="/admin/availability" className="underline">Availability</Link>; use this page for one-off blocks inside them.</>} />
      <Card title="Block out time" className="mb-4">
        <Suspense fallback={<div className="h-20 animate-pulse rounded-lg bg-ink/5" />}>
          <Form />
        </Suspense>
      </Card>
      <Card title="Upcoming">
        <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-ink/5" />}>
          <List />
        </Suspense>
      </Card>
    </>
  );
}
