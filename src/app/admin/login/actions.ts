"use server";

import { redirect } from "next/navigation";
import { login, logout, verifyTotp } from "@/lib/auth";

export type AuthState = { error?: string; recoveryCodes?: string[] };

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const r = await login(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  redirect(r.needsEnrol ? "/admin/login/setup-2fa" : "/admin/login/2fa");
}

export async function verifyAction(_: AuthState, form: FormData): Promise<AuthState> {
  const r = await verifyTotp(String(form.get("code") ?? ""), { enrol: false });
  if (!r.ok) return { error: r.error };
  redirect("/admin");
}

export async function enrolAction(_: AuthState, form: FormData): Promise<AuthState> {
  const r = await verifyTotp(String(form.get("code") ?? ""), { enrol: true });
  if (!r.ok) return { error: r.error };
  return { recoveryCodes: r.recoveryCodes };
}

export async function logoutAction() {
  await logout();
  redirect("/admin/login");
}
