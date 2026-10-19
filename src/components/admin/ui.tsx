import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className = "", padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-xl border border-ink/[0.08] bg-white ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-5 py-3.5">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/** Stat tile: hero number + delta vs previous period. Delta is text + arrow, never colour alone. */
export function Stat({ label, value, delta, hint }: { label: string; value: string; delta?: number | null; hint?: string }) {
  const up = (delta ?? 0) > 0;
  const flat = delta === null || delta === undefined || !Number.isFinite(delta) || Math.abs(delta) < 0.005;
  return (
    <div className="rounded-xl border border-ink/[0.08] bg-white p-4 sm:p-5">
      <p className="text-xs font-medium text-ink/65">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem]">{value}</p>
      {!flat ? (
        <p className={`mt-1 text-xs font-medium ${up ? "text-success" : "text-danger"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta! * 100).toFixed(0)}% <span className="font-normal text-ink/65">vs previous</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink/65">{hint}</p>
      ) : (
        <p className="mt-1 text-xs text-ink/65">No change vs previous</p>
      )}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary-strong",
  pending_payment: "bg-warning/15 text-ink",
  attended: "bg-success/15 text-ink",
  no_show: "bg-danger/12 text-danger",
  late_cancelled: "bg-danger/12 text-danger",
  cancelled: "bg-ink/8 text-ink/60",
  succeeded: "bg-success/15 text-ink",
  refunded: "bg-ink/8 text-ink/60",
  partially_refunded: "bg-warning/15 text-ink",
  failed: "bg-danger/12 text-danger",
  pending: "bg-warning/15 text-ink",
  active: "bg-success/15 text-ink",
  redeemed: "bg-ink/8 text-ink/60",
  expired: "bg-ink/8 text-ink/60",
  void: "bg-ink/8 text-ink/60",
  new: "bg-primary/10 text-primary-strong",
  quoted: "bg-warning/15 text-ink",
  booked: "bg-success/15 text-ink",
  closed: "bg-ink/8 text-ink/60",
};
const statusLabels: Record<string, string> = { pending_payment: "Awaiting payment", no_show: "No-show", late_cancelled: "Late cancel", partially_refunded: "Part refunded" };

export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap capitalize ${statusStyles[status] ?? "bg-ink/8 text-ink/70"}`}>
      {statusLabels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink/65">{children}</p>;
}

/** Horizontal single-series bar list: values labelled directly, one hue, hover shows exact value. */
export function BarList({ rows, format }: { rows: { label: string; value: number; sub?: string; href?: string }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>No data for this period.</Empty>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.href ? <Link href={r.href} className="hover:underline">{r.label}</Link> : r.label}</span>
            <span className="shrink-0 font-medium tabular-nums">
              {format(r.value)}
              {r.sub && <span className="ml-1.5 font-normal text-ink/65">{r.sub}</span>}
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-ink/[0.05]">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-ink/[0.08] text-xs text-ink/65">
            {head.map((h, i) => (
              <th key={i} className="px-5 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/[0.06]">{children}</tbody>
      </table>
      {empty && <Empty>Nothing here yet.</Empty>}
    </div>
  );
}

export function Td({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-5 py-3 align-top ${className}`}>{children}</td>;
}

export function Segmented({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="inline-flex rounded-lg border border-ink/10 bg-white p-0.5 text-sm">
      {items.map((i) => (
        <Link key={i.key} href={i.href} className={`rounded-md px-3 py-1.5 ${active === i.key ? "bg-ink text-white" : "text-ink/65 hover:text-ink"}`} aria-current={active === i.key ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
