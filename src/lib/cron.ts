/**
 * Scheduled jobs. Run every 5 minutes by Vercel Cron (vercel.json) → /api/cron, or locally with `npm run cron`.
 * Each job is idempotent and safe to run more often than scheduled.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { paymentLinks } from "@/db/schema";
import { releaseExpiredHolds } from "@/lib/availability";
import { syncBusyFromGoogle } from "@/lib/calendar/google";
import { enqueue } from "@/lib/notifications/queue";
import { dispatchDue } from "@/lib/notifications/queue";
import { reconcilePendingPayments } from "@/lib/payments/handlers";
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
  return out;
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


