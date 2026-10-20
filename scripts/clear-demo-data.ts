/**
 * npm run clear:demo-data — removes everything created by seed:demo-data (rows flagged is_demo = true) and anything
 * that hangs off them. Real clients, bookings and payments are never touched.
 */
import "./env";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../src/db/client";

export async function clearDemoData(db: Db, opts: { quiet?: boolean } = {}) {
  const counts: Record<string, number> = {};
  await db.transaction(async (tx) => {
    const run = async (label: string, q: ReturnType<typeof sql>) => {
      const r = (await tx.execute(q)) as unknown as { affectedRows?: number; rowCount?: number; count?: number };
      counts[label] = r.affectedRows ?? r.rowCount ?? r.count ?? 0;
    };
    const demoBookings = sql`(select id from bookings where is_demo)`;
    const demoClients = sql`(select id from clients where is_demo)`;
    const demoVouchers = sql`(select id from vouchers where is_demo)`;
    await run("voucher_redemptions", sql`delete from voucher_redemptions where booking_id in ${demoBookings} or voucher_id in ${demoVouchers}`);
    await run("refunds", sql`delete from refunds where payment_id in (select id from payments where is_demo)`);
    await run("payments", sql`delete from payments where is_demo`);
    await run("notifications", sql`delete from notifications where booking_id in ${demoBookings} or client_id in ${demoClients}`);
    await run("payment_links", sql`delete from payment_links where booking_id in ${demoBookings} or client_id in ${demoClients}`);
    await run("intake_forms", sql`delete from intake_forms where client_id in ${demoClients} or booking_id in ${demoBookings}`);
    await run("bookings", sql`delete from bookings where is_demo`);
    await run("vouchers", sql`delete from vouchers where is_demo`);
    await run("package_purchases", sql`delete from package_purchases where is_demo`);
    await run("enquiries", sql`delete from enquiries where is_demo`);
    await run("availability_days", sql`delete from availability_days where is_demo`);
    await run("client_otps", sql`delete from client_otps where client_id in ${demoClients}`);
    await run("clients", sql`delete from clients where is_demo and not exists (select 1 from bookings b where b.client_id = clients.id)`);
  });
  if (!opts.quiet) console.log("Demo data removed:", counts);
  return counts;
}

if (process.argv[1]?.includes("clear-demo-data")) {
  getDb()
    .then((db) => clearDemoData(db))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
