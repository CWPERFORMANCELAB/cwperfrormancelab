import { LoginForm } from "./forms";

export default function LoginPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard sign in</h1>
      <p className="mt-1 mb-6 text-sm text-ink/60">Protected with two-factor authentication.</p>
      <LoginForm />
    </>
  );
}
