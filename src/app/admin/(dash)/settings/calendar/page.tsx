import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { ActionButton } from "@/components/admin/client";
import { Card, PageHeader } from "@/components/admin/ui";
import { getDb } from "@/db/client";
import { calendarConnections } from "@/db/schema";
import { googleConfigured } from "@/lib/calendar/google";
import { formatLocal } from "@/lib/time";
import { disconnectCalendarAction } from "../../actions";

async function Status() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const [c] = await db.select().from(calendarConnections).limit(1);
  if (!googleConfigured())
    return <p className="text-sm text-ink/65">Google sync isn&apos;t configured on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). The booking system works fine without it.</p>;
  if (!c)
    return (
      <div className="space-y-3 text-sm">
        <p className="text-ink/65">Connect your Google Calendar so personal events block booking slots, and new bookings appear in your calendar automatically.</p>
        <a href="/api/calendar/google/connect" className="btn-primary btn-sm">Connect Google Calendar</a>
      </div>
    );
  return (
    <div className="space-y-3 text-sm">
      <p>Connected to <strong>{c.accountEmail ?? "Google"}</strong> ({c.calendarId}).</p>
      <p className="text-ink/60">Last synced: {c.lastSyncedAt ? formatLocal(c.lastSyncedAt, "d MMM HH:mm") : "not yet"}{c.lastError && <span className="block text-danger">Last error: {c.lastError}</span>}</p>
      <ActionButton action={disconnectCalendarAction} className="btn-ghost-dark btn-sm" confirm="Disconnect Google Calendar?">Disconnect</ActionButton>
    </div>
  );
}

export default function CalendarSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Google Calendar" subtitle="Two-way sync. Busy events from your calendar block slots; bookings are added to your calendar (no health details are sent to Google)." />
      <Card><Suspense fallback={null}><Status /></Suspense></Card>
    </>
  );
}
