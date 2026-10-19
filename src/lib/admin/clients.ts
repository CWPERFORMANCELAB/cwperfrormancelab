import { sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { requireAdmin } from "@/lib/auth";

export type ClientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  sport: string | null;
  referral_source: string | null;
  marketing_opt_in: boolean;
  tags: string[];
  first_visit: string | null;
  last_visit: string | null;
  sessions: number;
  spend: number;
  voucher_balance: number;
  is_demo: boolean;
};

/** CRM list with derived stats in one query. */
export async function listClients(db: Db, opts: { q?: string; tag?: string; consent?: "yes" | "no"; segment?: "new" | "lapsed" | "regular"; limit?: number } = {}) {
  await requireAdmin(); // admin-only data (PRE-DEPLOY-FIXES #2)
  const q = opts.q?.trim() ? `%${opts.q.trim()}%` : null;
  const res = (await db.execute(sql`
    select * from (
      select c.id, c.first_name, c.last_name, c.email, c.phone, c.dob, c.sport, c.referral_source, c.marketing_opt_in, c.tags, c.is_demo,
        (select min(b.starts_at) from bookings b where b.client_id = c.id and b.status in ('attended','confirmed'))::text as first_visit,
        (select max(b.starts_at) from bookings b where b.client_id = c.id and b.status in ('attended','confirmed') and b.starts_at <= now())::text as last_visit,
        (select count(*) from bookings b where b.client_id = c.id and b.status = 'attended')::int as sessions,
        (select coalesce(sum(p.amount_pence - p.refunded_pence), 0) from payments p where p.client_id = c.id and p.status in ('succeeded','partially_refunded'))::int as spend,
        (select coalesce(sum(v.balance_pence), 0) from vouchers v where v.status = 'active' and lower(coalesce(v.recipient_email, v.purchaser_email, '')) = lower(c.email))::int as voucher_balance
      from clients c
      where c.archived_at is null
        and (${q}::text is null or c.first_name ilike ${q} or c.last_name ilike ${q} or c.email ilike ${q} or c.phone ilike ${q})
        and (${opts.tag ?? null}::text is null or c.tags ? ${opts.tag ?? ""})
        and (${opts.consent ?? null}::text is null or c.marketing_opt_in = (${opts.consent ?? ""} = 'yes'))
    ) t
    where (${opts.segment ?? null}::text is null
      or (${opts.segment ?? ""} = 'new' and t.first_visit::timestamptz > now() - interval '30 days')
      or (${opts.segment ?? ""} = 'lapsed' and t.last_visit::timestamptz < now() - interval '90 days')
      or (${opts.segment ?? ""} = 'regular' and t.sessions >= 4))
    order by t.last_visit desc nulls last, t.last_name
    limit ${opts.limit ?? 500}
  `)) as unknown as { rows: ClientRow[] } | ClientRow[];
  return Array.isArray(res) ? res : res.rows;
}

export function toCsv(rows: ClientRow[]): string {
  const cols: (keyof ClientRow)[] = ["first_name", "last_name", "email", "phone", "dob", "sport", "referral_source", "first_visit", "last_visit", "sessions", "spend", "voucher_balance", "marketing_opt_in", "tags"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(";") : String(v);
    // Neutralise spreadsheet formula injection.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = cols.map((c) => (c === "spend" ? "spend_gbp" : c === "voucher_balance" ? "voucher_balance_gbp" : c)).join(",");
  const body = rows.map((r) => cols.map((c) => esc(c === "spend" || c === "voucher_balance" ? ((r[c] as number) / 100).toFixed(2) : r[c])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}
