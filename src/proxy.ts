import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap gate for /admin: no session cookie → login page. Real verification (session in DB, 2FA complete) happens
 * server-side in requireAdmin() on every admin page and server action (DECISIONS.md #10).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !request.cookies.get("cw_admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // Admin and booking-management pages must never be cached or indexed.
  if (pathname.startsWith("/admin") || pathname.startsWith("/manage") || pathname.startsWith("/pay")) {
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/manage/:path*", "/pay/:path*"],
};
