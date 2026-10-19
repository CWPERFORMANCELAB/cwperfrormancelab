import { eq } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { bookings, clients, intakeForms, payments } from "@/db/schema";
import { audit } from "@/lib/audit";
import { currentSession } from "@/lib/auth";
import { decryptJson, decrypt } from "@/lib/crypto";

/** UK GDPR subject access / portability: everything held about one client, decrypted, as JSON. */
export async function GET(_: Request, ctx: RouteContext<"/api/admin/clients/[id]/export">) {
  await connection();
  const s = await currentSession();
  if (!s || !s.s.mfaVerified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const db = await getDb();
  const [c] = await db.select().from(clients).where(eq(clients.id, id));
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [bk, pay, intake] = await Promise.all([
    db.select().from(bookings).where(eq(bookings.clientId, id)),
    db.select().from(payments).where(eq(payments.clientId, id)),
    db.select().from(intakeForms).where(eq(intakeForms.clientId, id)),
  ]);
  const data = {
    exportedAt: new Date().toISOString(),
    client: {
      ...c,
      emergencyContactEnc: undefined,
      adminNotesEnc: undefined,
      emergencyContact: decryptJson(c.emergencyContactEnc),
      practitionerNotes: c.adminNotesEnc ? decrypt(c.adminNotesEnc) : null,
    },
    bookings: bk.map((b) => ({
      id: b.id,
      serviceId: b.serviceId,
      status: b.status,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      locationType: b.locationType,
      pricePence: b.pricePence,
      paidPence: b.paidPence,
      clientNotes: b.clientNotes,
      clinicalNotes: b.clinicalNotesEnc ? decrypt(b.clinicalNotesEnc) : null,
    })),
    payments: pay.map((p) => ({ id: p.id, kind: p.kind, amountPence: p.amountPence, refundedPence: p.refundedPence, status: p.status, createdAt: p.createdAt, receiptNumber: p.receiptNumber })),
    intakeForms: intake.map((i) => ({ createdAt: i.createdAt, consents: i.consents, guardianConsent: i.guardianConsent, answers: decryptJson(i.dataEnc) })),
  };
  await audit(db, { actor: s.u.email, action: "client.export_data", entityType: "client", entityId: id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="client-${id}.json"`,
      "cache-control": "no-store",
    },
  });
}
