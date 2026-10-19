"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "@/app/admin/(dash)/actions";

/** Inline result message after an admin action. */
export function useAction() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setResult(r);
    });
  const msg = result ? (
    <p className={`mt-2 text-sm ${result.ok ? "text-success" : "text-danger"}`} role={result.ok ? "status" : "alert"}>
      {result.ok ? result.message ?? "Done." : result.error}
    </p>
  ) : null;
  return { pending, run, result, msg };
}

export function ActionButton({
  action,
  children,
  className = "btn-dark btn-sm",
  confirm,
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const { pending, run, msg } = useAction();
  return (
    <div>
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          run(action);
        }}
      >
        {pending ? "Working…" : children}
      </button>
      {msg}
    </div>
  );
}
