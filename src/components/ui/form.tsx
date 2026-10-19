"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/** Accessible form primitives: label association, error text linked via aria-describedby. */
export function Field({
  label,
  name,
  error,
  hint,
  children,
  className = "",
  tone = "light",
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className={`mb-1.5 block text-sm font-medium ${tone === "dark" ? "text-bone/85" : "text-ink/80"}`}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${name}-hint`} className={`mt-1 text-xs ${tone === "dark" ? "text-bone/50" : "text-ink/65"}`}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const describe = (name: string, error?: string, hasHint?: boolean) => (error ? `${name}-error` : hasHint ? `${name}-hint` : undefined);

export function Input({ name, error, hasHint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { name: string; error?: string; hasHint?: boolean }) {
  return <input id={name} name={name} aria-invalid={!!error} aria-describedby={describe(name, error, hasHint)} className="field" {...rest} />;
}

export function Textarea({ name, error, hasHint, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string; error?: string; hasHint?: boolean }) {
  return <textarea id={name} name={name} aria-invalid={!!error} aria-describedby={describe(name, error, hasHint)} className="field min-h-28" {...rest} />;
}

export function Select({ name, error, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { name: string; error?: string }) {
  return (
    <select id={name} name={name} aria-invalid={!!error} aria-describedby={describe(name, error)} className="field appearance-none bg-white" {...rest}>
      {children}
    </select>
  );
}

export function SubmitButton({ children, className = "btn-primary w-full", pendingText = "Sending…" }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** Invisible to humans, irresistible to bots. */
export function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Company
        <input type="text" name="company" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

/** Cloudflare Turnstile widget, rendered only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */
export function Turnstile() {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!key) return null;
  return (
    <>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div className="cf-turnstile" data-sitekey={key} data-theme="light" />
    </>
  );
}
