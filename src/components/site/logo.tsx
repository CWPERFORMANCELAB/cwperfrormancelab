import Link from "next/link";
import { business } from "@config/business";

/** Brand files live in public/brand (DECISIONS.md #13). Swap the files, not this component. */
export function Logo({ variant = "full", className = "" }: { variant?: "full" | "mark"; className?: string }) {
  return (
    <Link href="/" className={`inline-flex shrink-0 items-center ${className}`} aria-label={`${business.name}, home`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- SVG brand asset, no optimisation needed */}
      <img
        src={variant === "full" ? "/brand/logo.svg" : "/brand/logo-mark.svg"}
        alt=""
        className={variant === "full" ? "h-11 w-auto" : "h-7 w-auto sm:h-8"}
        width={variant === "full" ? 96 : 79}
        height={variant === "full" ? 44 : 28}
      />
    </Link>
  );
}
