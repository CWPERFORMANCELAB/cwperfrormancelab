"use client";

import dynamic from "next/dynamic";

/**
 * The booking flow renders client-only: it resumes in-progress holds from sessionStorage and has no SEO value,
 * while the page around it (heading, trust signals) is still server-rendered.
 */
export const BookingFlowClient = dynamic(() => import("./flow").then((m) => m.BookingFlow), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-white/5" aria-label="Loading booking" />,
});
