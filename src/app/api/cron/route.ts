import { connection, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { runJobs } from "@/lib/cron";
import { safeEqual } from "@/lib/crypto";
import { isStrict } from "@/lib/env";

/** Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (isStrict() || secret) {
    if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = await getDb();
  const result = await runJobs(db);
  return NextResponse.json({ ok: true, result });
}
