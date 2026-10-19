/**
 * Scheduled jobs. Run every 5 minutes by Vercel Cron (vercel.json) → /api/cron, or locally with `npm run cron`.
 * Each job is idempotent and safe to run more often than scheduled.
 *
 * Requires the Vercel **Pro** plan (or higher): Hobby only allows once-a-day cron jobs and rejects an every-5-minutes schedule
 * at deploy time. Slot-hold release, reminders and payment reconciliation all depend on this running.
 * Every run is recorded in `system_status` (key "cron"); the dashboard and /api/health flag it when it goes stale.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { paymentLinks, systemStatus } from "@/db/schema";
import { isStrict } from "@/lib/env";
import { releaseExpiredHolds } from "@/lib/availability";
import { syncBusyFromGoogle } from "@/lib/calendar/google";
import { enqueue } from "@/lib/notifications/queue";
import { dispatchDue } from "@/lib/notifications/queue";
import { reconcilePendingPayments } from "@/lib/payments/handlers";
import { reportError } from "@/lib/monitoring";
import { loadSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/url";
import { signUnsubscribe } from "@/lib/unsubscribe";
import { expireVouchers } from "@/lib/vouchers";

export async function runJobs(db: Db, now = new Date()) {
  const out: Record<string, unknown> = {};
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      out[name] = await fn();
    } catch (err) {
      console.error(`[cron] ${name} failed`, err);
      reportError(err, { area: "cron", step: name });
      out[name] = { error: String(err) };
    }
  };
  await step("releaseHolds", async () => (await releaseExpiredHolds(db, now)).length);
  await step("expirePaymentLinks", async () =>
    (await db.update(paymentLinks).set({ status: "expired" }).where(and(eq(paymentLinks.status, "open"), lt(paymentLinks.expiresAt, now))).returning({ id: paymentLinks.id })).length,
  );
  await step("reconcilePayments", () => reconcilePendingPayments(db, now));
  await step("expireVouchers", async () => (await expireVouchers(db, now)).length);
  await step("googleCalendar", () => syncBusyFromGoogle(db, now));
  await step("lapsedClients", () => queueLapsedClients(db, now));
  await step("dispatch", async () => (await dispatchDue(db, now, 100)).length);
  await recordCronRun(db, out, now);
  return out;
}

export const CRON_STALE_MINUTES = 15;
type CronStatus = { lastRunAt?: string; lastSuccessAt?: string; lastErrors?: string[] };

/** Record this run. `lastSuccessAt` only moves when every step succeeded. */
export async function recordCronRun(db: Db, out: Record<string, unknown>, now = new Date()) {
  const errors = Object.entries(out)
    .filter(([, v]) => v && typeof v === "object" && "error" in (v as object))
    .map(([k]) => k);
  const [prev] = await db.select().from(systemStatus).where(eq(systemStatus.key, "cron"));
  const value: CronStatus = {
    lastRunAt: now.toISOString(),
    lastSuccessAt: errors.length ? (prev?.value as CronStatus | undefined)?.lastSuccessAt : now.toISOString(),
    lastErrors: errors,
  };
  await db.insert(systemStatus).values({ key: "cron", value }).onConflictDoUpdate({ target: systemStatus.key, set: { value, updatedAt: now } });
}

/**
 * Is the scheduler healthy? Stale when the last successful run is older than 15 minutes. In production/preview a
 * missing record also counts as stale (the cron has never succeeded); locally it's simply "not running".
 */
export async function cronHealth(db: Db, now = new Date(), strict = isStrict()) {
  const [row] = await db.select().from(systemStatus).where(eq(systemStatus.key, "cron"));
  const v = (row?.value ?? {}) as CronStatus;
  const last = v.lastSuccessAt ? new Date(v.lastSuccessAt) : null;
  const ageMinutes = last ? Math.floor((now.getTime() - last.getTime()) / 60_000) : null;
  const stale = last ? ageMinutes! > CRON_STALE_MINUTES : strict;
  return { lastSuccessAt: last, lastRunAt: v.lastRunAt ? new Date(v.lastRunAt) : null, ageMinutes, stale, lastErrors: v.lastErrors ?? [] };
}

/** Marketing opt-ins only (PECR): clients whose last visit is older than lapsedClientDays and have nothing booked. */
export async function queueLapsedClients(db: Db, now = new Date()) {
  const settings = await loadSettings(db);
  const cutoff = new Date(now.getTime() - settings.notifications.lapsedClientDays * 86_400_000);
  const rows = (await db.execute(sql`
    select c.id, c.email, c.first_name
    from clients c
    where c.marketing_opt_in = true and c.archived_at is null
      and (select max(b.starts_at) from bookings b where b.client_id = c.id and b.status in ('attended','confirmed')) < ${cutoff}
      and not exists (select 1 from bookings b where b.client_id = c.id and b.status in ('confirmed','pending_payment') and b.starts_at > ${now})
    limit 50
  `)) as unknown as { rows: { id: string; email: string; first_name: string }[] };
  const list = Array.isArray(rows) ? (rows as unknown as { id: string; email: string; first_name: string }[]) : rows.rows;
  // One reactivation per client per lapse period.
  const period = Math.floor(now.getTime() / (settings.notifications.lapsedClientDays * 86_400_000));
  for (const c of list) {
    await enqueue(db, {
      templateKey: "lapsed_client",
      to: c.email,
      clientId: c.id,
      vars: { clientFirstName: c.first_name, unsubscribeUrl: siteUrl(`/api/unsubscribe?t=${encodeURIComponent(signUnsubscribe(c.id))}`) },
      dedupeKey: `lapsed:${c.id}:${period}`,
    });
  }
  return list.length;
}


