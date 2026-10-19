import { business, hasBasrat } from "@config/business";
import { copy } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { Calendar, Car, CreditCard, Shield } from "@/components/icons";

const icons = { shield: Shield, car: Car, card: CreditCard, calendar: Calendar };

/** Trust signals placed beside booking CTAs. The cancellation line is rendered from live policy settings. */
export async function TrustRow({ tone = "dark", className = "" }: { tone?: "dark" | "light"; className?: string }) {
  const { policy } = await getCatalog();
  const items = copy.trust.map((t) =>
    t.icon === "calendar" ? { ...t, text: `Free cancellation ${policy.freeCancelHours}h+ before` } : t,
  );
  const muted = tone === "dark" ? "text-bone/65" : "text-ink/60";
  const ic = tone === "dark" ? "text-primary-light" : "text-primary-strong";
  return (
    <ul className={`flex flex-wrap gap-x-6 gap-y-2.5 text-sm ${muted} ${className}`}>
      {items.map((t) => {
        const Icon = icons[t.icon as keyof typeof icons] ?? Shield;
        return (
          <li key={t.text} className="flex items-center gap-2">
            <Icon className={`size-4 shrink-0 ${ic}`} /> {t.text}
          </li>
        );
      })}
      {hasBasrat() && (
        <li className="flex items-center gap-2">
          <Shield className={`size-4 shrink-0 ${ic}`} /> BASRaT registered ({business.practitioner.basratNumber})
        </li>
      )}
    </ul>
  );
}
