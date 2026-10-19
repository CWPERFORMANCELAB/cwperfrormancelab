"use client";

import { useSyncExternalStore } from "react";

/** Subscribe to a media query without setState-in-effect (SSR snapshot = false). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Read a sessionStorage key reactively (updates when `notifySession(key)` is called). SSR snapshot = null. */
export function useSessionValue(key: string): string | null {
  return useSyncExternalStore(
    (cb) => {
      const h = (e: Event) => (e as CustomEvent).detail === key && cb();
      window.addEventListener("cw-session", h);
      return () => window.removeEventListener("cw-session", h);
    },
    () => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );
}

export function setSessionValue(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {}
  window.dispatchEvent(new CustomEvent("cw-session", { detail: key }));
}
