import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { PasswordForm } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/auth";
import { formatLocal } from "@/lib/time";

async function Info() {
  await connection();
  const u = await requireAdmin();
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-3">
      <div><dt className="text-xs text-ink/65">Email</dt><dd>{u.email}</dd></div>
      <div><dt className="text-xs text-ink/65">Two-factor</dt><dd>{u.totpEnabled ? `On · ${u.recoveryCodesHash.length} recovery codes left` : "Off"}</dd></div>
      <div><dt className="text-xs text-ink/65">Last sign in</dt><dd>{u.lastLoginAt ? formatLocal(u.lastLoginAt, "d MMM yyyy HH:mm") : "—"}</dd></div>
    </dl>
  );
}

export default function AccountSettings() {
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/admin/settings" className="text-ink/65 hover:text-ink">← Settings</Link></p>
      <PageHeader title="Account & security" />
      <Card title="Your account" className="mb-4"><Suspense fallback={null}><Info /></Suspense></Card>
      <Card title="Change password"><p className="mb-3 text-xs text-ink/65">You&apos;ll be signed out everywhere afterwards.</p><PasswordForm /></Card>
    </>
  );
}
