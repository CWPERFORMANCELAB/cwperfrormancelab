import { connection, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { checkHealth } from "@/lib/health";
import { getPaymentProvider } from "@/lib/payments/provider";

/** Uptime check: 200 when the database, Stripe and the scheduler are all healthy, otherwise 503. See RUNBOOK.md. */
export async function GET() {
  await connection();
  const report = await checkHealth({ getDb, getProvider: getPaymentProvider });
  return NextResponse.json(report, { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
