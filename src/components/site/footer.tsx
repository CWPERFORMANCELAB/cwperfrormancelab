import Link from "next/link";
import { business, hasBasrat } from "@config/business";
import { copy } from "@/lib/content";
import { Instagram, Mail, MapPin, Phone, WhatsApp } from "@/components/icons";
import { CookieSettingsLink } from "./cookie-banner";
import { Logo } from "./logo";

export function SiteFooter({ year }: { year: number }) {
  const a = business.address;
  const socials: { href: string; label: string; Icon: typeof Instagram }[] = [];
  if (business.social.instagram) socials.push({ href: business.social.instagram, label: "Instagram", Icon: Instagram });

  return (
    <footer className="border-t border-white/[0.08] pt-14 pb-28 sm:pb-10">
      <div className="container-x">
        <div className="grid gap-10 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
          <div>
            <Logo variant="full" />
            <p className="mt-5 max-w-xs text-sm text-bone/65">{copy.footer.blurb}</p>
            <p className="mt-4 text-xs text-bone/65">
              {business.practitioner.name}, {business.practitioner.title}
              <br />
              {business.practitioner.qualifications[0]}
              {hasBasrat() && (
                <>
                  <br />
                  BASRaT registration {business.practitioner.basratNumber}
                </>
              )}
            </p>
          </div>
          <div>
            <p className="eyebrow text-bone/65">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm text-bone/70">
              {copy.nav.map((n) => (
                <li key={n.href}>
                  <Link href={n.href} className="hover:text-bone">
                    {n.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/testimonials" className="hover:text-bone">
                  Testimonials
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="eyebrow text-bone/65">Visit</p>
            <address className="mt-4 text-sm not-italic leading-relaxed text-bone/70">
              {a.venue}
              <br />
              {a.line1}
              <br />
              {a.city} {a.postcode}
            </address>
            <p className="mt-3 text-sm text-bone/65">{a.parkingNote}</p>
          </div>
          <div>
            <p className="eyebrow text-bone/65">Contact</p>
            <ul className="mt-4 space-y-2.5 text-sm text-bone/70">
              <li>
                <a href={`tel:${business.contact.phoneE164}`} className="inline-flex items-center gap-2 hover:text-bone">
                  <Phone className="size-4" /> {business.contact.phone}
                </a>
              </li>
              <li>
                <a href={business.contact.whatsapp} className="inline-flex items-center gap-2 hover:text-bone">
                  <WhatsApp className="size-4" /> WhatsApp
                </a>
              </li>
              <li>
                <a href={`mailto:${business.contact.email}`} className="inline-flex items-center gap-2 break-all hover:text-bone">
                  <Mail className="size-4 shrink-0" /> Email
                </a>
              </li>
              <li>
                <Link href="/contact" className="inline-flex items-center gap-2 hover:text-bone">
                  <MapPin className="size-4" /> Directions
                </Link>
              </li>
              {socials.map(({ href, label, Icon }) => (
                <li key={label}>
                  <a href={href} className="inline-flex items-center gap-2 hover:text-bone" rel="noopener">
                    <Icon className="size-4" /> {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-14 flex flex-col justify-between gap-4 border-t border-white/[0.08] pt-6 text-xs text-bone/65 sm:flex-row">
          <p>
            © {year} {business.legalName}. All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/privacy" className="hover:text-bone">Privacy</Link>
            <Link href="/terms" className="hover:text-bone">Terms &amp; cancellation</Link>
            <Link href="/cookies" className="hover:text-bone">Cookies</Link>
            <CookieSettingsLink />
          </div>
        </div>
      </div>
    </footer>
  );
}
