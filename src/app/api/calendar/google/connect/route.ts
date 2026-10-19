import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";
import { googleAuthUrl, googleConfigured } from "@/lib/calendar/google";
import { randomToken } from "@/lib/crypto";

/** Starts Google OAuth. CSRF-protected with a state cookie. */
export async function GET() {
  await connection();
  const s = await currentSession();
  if (!s?.s.mfaVerified) return NextResponse.redirect(new URL("/admin/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  if (!googleConfigured()) return NextResponse.json({ error: "Google not configured" }, { status: 503 });
  const state = randomToken(16);
  (await cookies()).set("cw_gstate", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return NextResponse.redirect(googleAuthUrl(state));
}
