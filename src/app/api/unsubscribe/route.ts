import { eq } from "drizzle-orm";
import { connection, NextResponse, type NextRequest } from "next/server";
import { business } from "@config/business";
import { getDb } from "@/db/client";
import { clients } from "@/db/schema";
import { audit } from "@/lib/audit";
import { verifyUnsubscribe } from "@/lib/unsubscribe";

/** One-click unsubscribe from marketing (PECR). Booking emails are unaffected. */
export async function GET(req: NextRequest) {
  await connection();
  const id = verifyUnsubscribe(req.nextUrl.searchParams.get("t") ?? "");
  if (id) {
    const db = await getDb();
    await db.update(clients).set({ marketingOptIn: false, marketingOptInAt: null }).where(eq(clients.id, id));
    await audit(db, { actor: "client", action: "client.unsubscribe", entityType: "client", entityId: id });
  }
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><title>Unsubscribed</title><body style="font-family:system-ui;padding:3rem;max-width:32rem;margin:auto"><h1>You're unsubscribed</h1><p>You won't receive marketing emails from ${business.name}. You'll still get emails about any bookings you make.</p><p><a href="/">Back to the site</a></p></body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
