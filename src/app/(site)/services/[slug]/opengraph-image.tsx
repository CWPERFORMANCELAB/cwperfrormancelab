import { ImageResponse } from "next/og";
import { business } from "@config/business";
import { seedServices } from "@config/seed-settings";
import { getServiceBySlug } from "@/lib/data/public";
import { formatPence } from "@/lib/money";
import { themeTokens } from "@/lib/theme-tokens";

export const alt = `${business.name} service`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return seedServices.map((s) => ({ slug: s.slug }));
}

/** Per-service Open Graph image: brand colours from config/theme.css, live price from settings. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = await getServiceBySlug(slug);
  const t = themeTokens();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: t.ink, color: t.bone, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: t.primary }}>{business.name.toUpperCase()}</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>{s?.name ?? business.name}</div>
          <div style={{ display: "flex", marginTop: 24, fontSize: 34, color: t.mist }}>
            {`${s ? `${formatPence(s.pricePence)} · ${s.durationMin} min · ` : ""}${business.address.venue}, ${business.address.city}`}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: t.mist }}>{`${business.practitioner.name} · ${business.practitioner.title}`}</div>
      </div>
    ),
    size,
  );
}
