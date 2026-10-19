"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, X } from "@/components/icons";

type Props = {
  nav: { href: string; label: string }[];
  bookLabel: string;
  fromLabel: string;
  fromPrice: string;
  logo: React.ReactNode;
};

export function SiteHeader({ nav, bookLabel, fromLabel, fromPrice, logo }: Props) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [past, setPast] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 16);
      setPast(window.scrollY > 480);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onBookPage = pathname?.startsWith("/book");

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-bone focus:px-4 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled || open ? "border-b border-white/[0.07] bg-ink/85 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <div className="container-x flex h-16 items-center justify-between gap-4 lg:h-[72px]">
          {logo}
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
            {nav.map((n) => {
              const active = pathname === n.href || pathname?.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-2 text-sm transition hover:bg-white/5 hover:text-bone ${active ? "text-bone" : "text-bone/65"}`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {!onBookPage && (
              <Link href="/book" className="btn-primary btn-sm hidden sm:inline-flex">
                {bookLabel}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="grid size-11 place-items-center rounded-full border border-white/15 lg:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-nav"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div id="mobile-nav" className="fixed inset-0 top-16 z-40 flex flex-col overflow-y-auto bg-ink px-4 pt-4 pb-8 animate-fade lg:hidden">
          <nav aria-label="Mobile">
            {nav.map((n, i) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between border-b border-white/[0.07] py-4 font-display text-2xl font-medium tracking-tight animate-rise"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                {n.label}
                <ArrowRight className="size-5 text-bone/65" />
              </Link>
            ))}
          </nav>
          <Link href="/book" className="btn-primary mt-auto w-full" onClick={() => setOpen(false)}>
            {bookLabel}
          </Link>
        </div>
      )}

      {/* Mobile sticky booking bar — most traffic is Instagram link-in-bio on phones. */}
      {!onBookPage && (
        <div
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-transform duration-300 sm:hidden ${
            past && !open ? "translate-y-0" : "translate-y-full"
          }`}
          aria-hidden={!past || open}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs text-bone/65">{fromLabel}</p>
              <p className="font-display text-lg font-semibold">{fromPrice}</p>
            </div>
            <Link href="/book" className="btn-primary" tabIndex={past ? 0 : -1}>
              {bookLabel} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

/** Static shell rendered while the interactive header streams in (keeps routes prerenderable). */
export function HeaderFallback({ logo, bookLabel }: { logo: React.ReactNode; bookLabel: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-transparent">
      <div className="container-x flex h-16 items-center justify-between gap-4 lg:h-[72px]">
        {logo}
        <Link href="/book" className="btn-primary btn-sm hidden sm:inline-flex">
          {bookLabel}
        </Link>
      </div>
    </header>
  );
}
