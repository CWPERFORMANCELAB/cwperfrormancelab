import { CodeForm } from "../forms";

export default function TwoFactorPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Two-factor check</h1>
      <p className="mt-1 mb-6 text-sm text-ink/60">Open your authenticator app and enter the current code.</p>
      <CodeForm />
    </>
  );
}
