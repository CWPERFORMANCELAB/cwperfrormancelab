import { connection, NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { listClients, toCsv } from "@/lib/admin/clients";
import { audit } from "@/lib/audit";
import { currentSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await connection();
  const s = await currentSession();
  if (!s || !s.s.mfaVerified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const db = await getDb();
  const rows = await listClients(db, {
    q: p.get("q") ?? undefined,
    tag: p.get("tag") ?? undefined,
    consent: (p.get("consent") as "yes" | "no" | null) ?? undefined,
    segment: (p.get("segment") as "new" | "lapsed" | "regular" | null) ?? undefined,
    limit: 10_000,
  });
  await audit(db, { actor: s.u.email, action: "client.export_csv", entityType: "client", meta: { count: rows.length } });
  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
