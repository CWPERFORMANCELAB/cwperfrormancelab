import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { Suspense } from "react";
import { SettingForm, WorkingHoursForm } from "@/components/admin/forms";
import { Card, PageHeader } from "@/components/admin/ui";
import { ArrowRight } from "@/components/icons";
import { getDb } from "@/db/client";
import { loadSettings } from "@/lib/settings";
import { settingMeta, type SettingKey } from "@/lib/settings-schema";

const sub = [
  { href: "/admin/settings/services", label: "Services & prices", help: "Prices, durations, buffers, payment model, VAT" },
  { href: "/admin/settings/templates", label: "Emails & SMS", help: "Edit every message clients receive" },
  { href: "/admin/settings/discounts", label: "Discount codes", help: "Create and disable codes" },
  { href: "/admin/settings/calendar", label: "Google Calendar", help: "Two-way sync with your calendar" },
  { href: "/admin/settings/packages", label: "Packages", help: "Multi-session blocks (feature flag)" },
  { href: "/admin/settings/account", label: "Account & security", help: "Password and two-factor" },
  { href: "/admin/settings/placeholders", label: "Placeholder values", help: "What still needs confirming" },
  { href: "/admin/settings/audit", label: "Audit log", help: "Who viewed or changed what" },
];

async function Forms() {
  await connection();
  await requireAdmin(); // every page enforces auth itself (PRE-DEPLOY-FIXES #2)
  const db = await getDb();
  const s = await loadSettings(db);
  const keys: SettingKey[] = ["bookingRules", "cancellationPolicy", "paymentDefaults", "vouchers", "features", "notifications", "compliance"];
  return (
    <div className="space-y-4">
      <Card title={settingMeta.workingHours.label}>
        <p className="mb-3 text-xs text-ink/65">{settingMeta.workingHours.help} Max/day is the daily appointment cap.</p>
        <WorkingHoursForm value={s.workingHours as never} caps={s.dailyCaps as never} />
      </Card>
      {keys.map((k) => (
        <Card key={k} title={settingMeta[k].label}>
          <p className="mb-3 text-xs text-ink/65">{settingMeta[k].help}</p>
          <SettingForm
            settingKey={k}
            value={s[k] as never}
            labels={{
              minNoticeHours: "Minimum notice (hours)",
              maxAdvanceDays: "Booking window (days ahead)",
              slotIntervalMin: "Slot interval (minutes)",
              holdMinutes: "Checkout hold (minutes)",
              defaultBufferMin: "Default buffer (minutes)",
              freeCancelHours: "Free cancellation (hours before)",
              lateCancelFeePercent: "Late cancellation fee (%)",
              noShowFeePercent: "No-show fee (%)",
              rescheduleDeadlineHours: "Reschedule deadline (hours before)",
              model: "Default payment model (full | deposit | card_on_file)",
              defaultTaxRateBp: "Default VAT (basis points, 2000 = 20%)",
              reminderHoursBefore: "Reminders (hours before)",
            }}
          />
        </Card>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" subtitle="Changes apply immediately to the website and booking system." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sub.map((x) => (
          <Link key={x.href} href={x.href} className="group rounded-xl border border-ink/[0.08] bg-white p-4 hover:border-primary/40">
            <p className="flex items-center justify-between font-medium">
              {x.label} <ArrowRight className="size-4 text-ink/30 group-hover:text-primary" />
            </p>
            <p className="mt-0.5 text-xs text-ink/65">{x.help}</p>
          </Link>
        ))}
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-ink/5" />}>
        <Forms />
      </Suspense>
    </>
  );
}
