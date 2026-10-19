"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { setSessionValue, useSessionValue } from "@/lib/use-browser";
import { Calendar, Chart, Cog, Gift, Inbox, LogOut, Menu, Pound, Sparkle, Users, X } from "@/components/icons";

const items = [
  { href: "/admin", label: "Overview", Icon: Sparkle, exact: true },
  { href: "/admin/bookings", label: "Bookings", Icon: Calendar },
  { href: "/admin/clients", label: "Clients", Icon: Users },
  { href: "/admin/enquiries", label: "Enquiries", Icon: Inbox },
  { href: "/admin/payments", label: "Payments", Icon: Pound },
  { href: "/admin/vouchers", label: "Vouchers", Icon: Gift },
  { href: "/admin/insights", label: "Insights", Icon: Chart },
  { href: "/admin/settings", label: "Settings", Icon: Cog },
];

export function AdminNav({ logout, newEnquiries }: { logout: () => Promise<void>; newEnquiries: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string, exact?: boolean) => (exact ? path === href : path === href || path?.startsWith(`${href}/`));

  const links = (
    <ul className="space-y-0.5">
      {items.map(({ href, label, Icon, exact }) => (
        <li key={href}>
          <Link
            href={href}
            aria-current={isActive(href, exact) ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${isActive(href, exact) ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
          >
            <Icon className={`size-[18px] ${isActive(href, exact) ? "text-primary" : ""}`} />
            <span className="flex-1">{label}</span>
            {label === "Enquiries" && newEnquiries > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold text-on-primary">{newEnquiries}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink px-3 py-5 lg:flex">
        <Link href="/admin" className="mb-6 flex items-center gap-2 px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt="" className="h-6 w-auto" />
          <span className="text-xs font-semibold tracking-[0.2em] text-white/70">ADMIN</span>
        </Link>
        <nav aria-label="Dashboard">{links}</nav>
        <div className="mt-auto space-y-1">
          <Link href="/" target="_blank" className="block rounded-lg px-3 py-2 text-sm text-white/70 hover:text-white">
            View website ↗
          </Link>
          <form action={logout}>
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white">
              <LogOut className="size-[18px]" /> Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt="Dashboard home" className="h-6 w-auto" />
        </Link>
        <button type="button" onClick={() => setOpen((o) => !o)} className="grid size-10 place-items-center rounded-lg text-white" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open}>
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 top-14 z-40 bg-ink px-3 py-4 lg:hidden">
          <nav aria-label="Dashboard">{links}</nav>
          <form action={logout} className="mt-4 border-t border-white/10 pt-4">
            <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/65">
              <LogOut className="size-[18px]" /> Sign out
            </button>
          </form>
        </div>
      )}

      {/* Mobile bottom tabs for the 4 most-used areas */}
      <nav aria-label="Quick" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink/10 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {items.slice(0, 4).map(({ href, label, Icon, exact }) => (
          <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(href, exact) ? "font-semibold text-primary-strong" : "text-ink/65"}`}>
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

export function PlaceholderBanner({ count }: { count: number }) {
  const dismissed = useSessionValue("cw-hide-placeholders");
  if (!count || dismissed === String(count)) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">
      <span className="flex-1">
        <strong>{count} settings still use placeholder values.</strong>{" "}
        <Link href="/admin/settings/placeholders" className="underline underline-offset-2">
          See the list
        </Link>
      </span>
      <button type="button" className="text-ink/65 hover:text-ink" aria-label="Dismiss" onClick={() => setSessionValue("cw-hide-placeholders", String(count))}>
        <X className="size-4" />
      </button>
    </div>
  );
}
