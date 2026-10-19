"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * PECR-compliant banner: only essential cookies until the visitor chooses. Choice stored in `cw_consent`.
 * Optional scripts (analytics) must check `hasConsent()` before loading.
 */
const COOKIE = "cw_consent";

export function readConsent(): "all" | "essential" | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
  return (m?.[1] as "all" | "essential" | undefined) ?? null;
}
export const hasConsent = () => readConsent() === "all";

function save(v: "all" | "essential") {
  document.cookie = `${COOKIE}=${v}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  window.dispatchEvent(new CustomEvent("cw-consent", { detail: v }));
}

function subscribe(cb: () => void) {
  window.addEventListener("cw-consent", cb);
  return () => window.removeEventListener("cw-consent", cb);
}

export function CookieBanner() {
  // Server snapshot "essential" = don't render the banner in SSR HTML; it appears after hydration if needed.
  const consent = useSyncExternalStore(subscribe, readConsent, () => "essential" as const);
  const [reopened, setReopened] = useState(false);
  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener("cw-open-cookie-settings", open);
    return () => window.removeEventListener("cw-open-cookie-settings", open);
  }, []);
  if (consent !== null && !reopened) return null;
  const choose = (v: "all" | "essential") => {
    save(v);
    setReopened(false);
  };
  return (
    <div role="region" aria-label="Cookie preferences" className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-white/10 bg-coal/95 p-5 shadow-2xl backdrop-blur-xl animate-rise sm:bottom-5">
      <p className="text-sm leading-relaxed text-bone/80">
        We use essential cookies to make this site work. With your permission we&apos;d also use privacy-friendly analytics to improve it.{" "}
        <Link href="/cookies" className="underline underline-offset-2">
          Cookie policy
        </Link>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-light btn-sm flex-1" onClick={() => choose("all")}>
          Accept all
        </button>
        <button type="button" className="btn-ghost btn-sm flex-1" onClick={() => choose("essential")}>
          Essential only
        </button>
      </div>
    </div>
  );
}

export function CookieSettingsLink() {
  return (
    <button type="button" className="hover:text-bone" onClick={() => window.dispatchEvent(new Event("cw-open-cookie-settings"))}>
      Cookie settings
    </button>
  );
}
