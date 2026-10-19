"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/lib/use-browser";
import type { MediaSlot } from "@/lib/content";

/**
 * Renders a content/media.json slot. Slots still awaiting their ideal shot show a fallback real photo; a labelled
 * box only appears if a slot has neither a file nor a fallback.
 */
export function MediaImage({
  slot,
  sizes,
  priority,
  className = "",
  rounded = "rounded-xl",
  showLabel = true,
}: {
  slot: MediaSlot & { id: string };
  sizes: string;
  priority?: boolean;
  className?: string;
  rounded?: string;
  showLabel?: boolean;
}) {
  // Missing shot: show the fallback real photo; the labelled box is a last resort (never shown when a fallback exists).
  const src = slot.placeholder ? slot.fallback : slot.file;
  if (!src) return <Placeholder slot={slot} className={className} rounded={rounded} showLabel={showLabel} />;
  return (
    <div className={`relative overflow-hidden bg-graphite ${rounded} ${className}`}>
      <Image src={src} alt={slot.alt} fill sizes={sizes} priority={priority} quality={slot.placeholder ? undefined : slot.quality} className="object-cover" />
    </div>
  );
}

function Placeholder({ slot, className, rounded, showLabel }: { slot: MediaSlot & { id: string }; className: string; rounded: string; showLabel: boolean }) {
  return (
    <div
      className={`relative grid place-items-center overflow-hidden bg-graphite ${rounded} ${className}`}
      role="img"
      aria-label={slot.alt}
      data-placeholder-slot={slot.id}
    >
      <div aria-hidden className="absolute inset-0 opacity-40 [background:repeating-linear-gradient(135deg,transparent_0_14px,color-mix(in_srgb,var(--brand-mist)_14%,transparent)_14px_15px)]" />
      {showLabel && (
        <div className="relative max-w-[80%] rounded-md bg-ink/70 px-3 py-2 text-center text-[11px] leading-snug text-mist backdrop-blur">
          <p className="font-semibold uppercase tracking-wider text-bone/80">Photo coming soon</p>
          <p className="mt-0.5 font-mono">{slot.file.replace("/media/", "")}</p>
        </div>
      )}
    </div>
  );
}

/** Short, muted, looping clip that only loads when on screen (and never autoplays with reduced motion). */
export function MediaVideo({ slot, className = "", rounded = "rounded-xl" }: { slot: MediaSlot & { id: string }; className?: string; rounded?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (e.isIntersecting) el.play().catch(() => {});
      else el.pause();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // No video yet: show the fallback still instead of an empty box.
  if (slot.placeholder) return <MediaImage slot={slot} sizes="(min-width:1024px) 25vw, 45vw" className={className} rounded={rounded} />;
  return (
    <div className={`relative overflow-hidden bg-graphite ${rounded} ${className}`}>
      <video
        ref={ref}
        className="absolute inset-0 size-full object-cover"
        poster={slot.poster}
        muted
        loop
        playsInline
        preload="none"
        autoPlay={!reduced}
        aria-label={slot.alt}
      >
        {visible && <source src={slot.file} type="video/mp4" />}
      </video>
    </div>
  );
}
