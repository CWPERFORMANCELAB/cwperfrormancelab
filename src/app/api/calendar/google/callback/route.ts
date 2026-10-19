import { cookies } from "next/headers";
import { connection, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { audit } from "@/lib/audit";
import { currentSession } from "@/lib/auth";
import { exchangeCode, syncBusyFromGoogle } from "@/lib/calendar/google";
import { safeEqual } from "@/lib/crypto";
import { siteUrl } from "@/lib/url";

export async function GET(req: NextRequest) {
  await connection();
  const s = await currentSession();
  if (!s?.s.mfaVerified) return NextResponse.redirect(siteUrl("/admin/login"));
  const jar = await cookies();
  const expected = jar.get("cw_gstate")?.value ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code");
  jar.delete("cw_gstate");
  if (!code || !expected || !safeEqual(state, expected)) return NextResponse.redirect(siteUrl("/admin/settings/calendar?error=state"));
  const db = await getDb();
  await exchangeCode(db, code);
  await syncBusyFromGoogle(db);
  await audit(db, { actor: s.u.email, action: "calendar.connect", entityType: "calendar" });
  return NextResponse.redirect(siteUrl("/admin/settings/calendar"));
}
