import type { Metadata } from "next";
import { business, fullAddress } from "@config/business";
import { PageHero } from "@/components/site/blocks";
import { ContactForm } from "@/components/site/forms";
import { MapEmbed } from "@/components/site/map-embed";
import { ArrowUpRight, Car, Mail, MapPin, Phone, WhatsApp } from "@/components/icons";
import { copy } from "@/lib/content";
import { getCatalog } from "@/lib/data/public";
import { mapsUrl } from "@/lib/url";

export const metadata: Metadata = {
  title: "Contact & Directions: Made Running Hub, Manchester M8",
  description: `Find ${business.name} at ${fullAddress()}. Free parking outside. Call, WhatsApp or send a message.`,
  alternates: { canonical: "/contact" },
};

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function ContactPage() {
  const { workingHours } = await getCatalog();
  const a = business.address;
  const order = [1, 2, 3, 4, 5, 6, 0] as const;
  return (
    <>
      <PageHero eyebrow="Contact" title={copy.contact.title} lede={copy.contact.lede} />
      <section className="pb-24">
        <div className="container-x grid gap-6 lg:grid-cols-2">
          <div className="card overflow-hidden">
            <div className="relative aspect-[16/10] w-full">
              <MapEmbed query={fullAddress()} label={a.venue} />
            </div>
            <div className="p-6 sm:p-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight">{a.venue}</h2>
              <address className="mt-2 not-italic leading-relaxed text-bone/70">
                {a.line1}, {a.locality}
                <br />
                {a.city} {a.postcode}
              </address>
              <p className="mt-4 flex items-start gap-2 text-bone/80">
                <Car className="mt-0.5 size-5 shrink-0 text-primary-light" /> {a.parkingNote}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-bone/60">{a.directions}</p>
              <a href={mapsUrl()} target="_blank" rel="noopener" className="btn-primary mt-6">
                <MapPin className="size-4" /> Get directions
              </a>
              <ul className="mt-8 space-y-1 border-t border-white/[0.08] pt-6">
                {[
                  { Icon: Phone, label: business.contact.phone, href: `tel:${business.contact.phoneE164}` },
                  { Icon: WhatsApp, label: "WhatsApp", href: business.contact.whatsapp },
                  { Icon: Mail, label: business.contact.email, href: `mailto:${business.contact.email}` },
                ].map(({ Icon, label, href }) => (
                  <li key={label}>
                    <a href={href} className="group -mx-3 flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-white/5">
                      <Icon className="size-5 text-bone/60" />
                      <span className="flex-1 truncate">{label}</span>
                      <ArrowUpRight className="size-4 text-bone/30 group-hover:text-bone" />
                    </a>
                  </li>
                ))}
              </ul>
              <div className="mt-6 border-t border-white/[0.08] pt-6">
                <h3 className="eyebrow text-bone/65">Appointment hours</h3>
                <dl className="mt-3 grid gap-1.5 text-sm">
                  {order.map((d) => (
                    <div key={d} className="flex justify-between gap-4">
                      <dt className="text-bone/65">{days[d]}</dt>
                      <dd>{workingHours[d].length ? workingHours[d].map((r) => `${r.open}–${r.close}`).join(", ") : "Closed"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
          <div className="surface-light rounded-card bg-bone p-6 text-ink sm:p-8">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{copy.contact.formTitle}</h2>
            <div className="mt-6">
              <ContactForm success={copy.contact.success} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
