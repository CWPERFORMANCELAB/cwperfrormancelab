"use client";

import { useState } from "react";
import { MapPin } from "@/components/icons";

/** Google Maps only loads on request (no third-party cookies before the visitor opts in). */
export function MapEmbed({ query, label }: { query: string; label: string }) {
  const [show, setShow] = useState(false);
  if (show) {
    return (
      <iframe
        title={`Map: ${label}`}
        src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="absolute inset-0 size-full border-0 grayscale-[0.4]"
      />
    );
  }
  return (
    <button type="button" onClick={() => setShow(true)} className="absolute inset-0 grid place-items-center bg-graphite text-bone/80 transition hover:text-bone">
      <span className="flex flex-col items-center gap-3">
        <span className="grid size-14 place-items-center rounded-full bg-primary text-on-primary">
          <MapPin className="size-6" />
        </span>
        <span className="font-medium">Show map</span>
        <span className="max-w-xs px-6 text-center text-xs text-bone/65">Loads Google Maps, which may set its own cookies.</span>
      </span>
    </button>
  );
}
