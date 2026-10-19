import QRCode from "qrcode";
import { connection } from "next/server";
import { Suspense } from "react";
import { startTotpEnrolment } from "@/lib/auth";
import { EnrolForm } from "../forms";

async function Enrol() {
  await connection();
  const { uri, secret } = await startTotpEnrolment();
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return (
    <>
      <ol className="mb-5 list-decimal space-y-1 pl-5 text-sm text-ink/70">
        <li>Install an authenticator app (Google Authenticator, 1Password, Authy…).</li>
        <li>Scan this QR code.</li>
        <li>Enter the 6-digit code it shows.</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mx-auto rounded-lg" />
      <p className="mt-3 text-center text-xs text-ink/65">
        Can&apos;t scan? Enter this key: <span className="font-mono break-all select-all">{secret}</span>
      </p>
      <div className="mt-6">
        <EnrolForm />
      </div>
    </>
  );
}

export default function SetupTwoFactorPage() {
  return (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Set up two-factor sign in</h1>
      <p className="mt-1 mb-5 text-sm text-ink/60">Required to protect client health records.</p>
      <Suspense fallback={<div className="mx-auto size-[220px] animate-pulse rounded-lg bg-ink/5" />}>
        <Enrol />
      </Suspense>
    </>
  );
}
