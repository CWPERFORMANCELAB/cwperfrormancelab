"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/form";
import { enrolAction, loginAction, verifyAction, type AuthState } from "./actions";

const init: AuthState = {};

function Err({ s }: { s: AuthState }) {
  return s.error ? (
    <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
      {s.error}
    </p>
  ) : null;
}

export function LoginForm() {
  const [s, action] = useActionState(loginAction, init);
  return (
    <form action={action} className="grid gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">Email</span>
        <input name="email" type="email" autoComplete="username" required className="field" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="field" />
      </label>
      <Err s={s} />
      <SubmitButton className="btn-dark w-full" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}

export function CodeForm() {
  const [s, action] = useActionState(verifyAction, init);
  return (
    <form action={action} className="grid gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">6-digit code (or a recovery code)</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus className="field text-center text-xl tracking-[0.3em]" />
      </label>
      <Err s={s} />
      <SubmitButton className="btn-dark w-full" pendingText="Checking…">
        Verify
      </SubmitButton>
    </form>
  );
}

export function EnrolForm() {
  const [s, action] = useActionState(enrolAction, init);
  if (s.recoveryCodes) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-ink/70">
          2FA is on. Save these one-time <strong>recovery codes</strong> somewhere safe (e.g. your password manager). Each works once if you lose your phone. They won&apos;t be shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-ink/5 p-4 font-mono text-sm">
          {s.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Link href="/admin" className="btn-dark w-full">
          I&apos;ve saved them. Go to dashboard
        </Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink/80">Enter the 6-digit code from your app</span>
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required className="field text-center text-xl tracking-[0.3em]" />
      </label>
      <Err s={s} />
      <SubmitButton className="btn-dark w-full" pendingText="Checking…">
        Turn on 2FA
      </SubmitButton>
    </form>
  );
}
