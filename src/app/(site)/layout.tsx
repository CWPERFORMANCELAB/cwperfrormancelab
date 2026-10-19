import { CookieBanner } from "@/components/site/cookie-banner";
import { SiteFooter } from "@/components/site/footer";
import { HeaderFallback, SiteHeader } from "@/components/site/header";
import { Suspense } from "react";
import { businessJsonLd, JsonLd } from "@/components/site/json-ld";
import { Logo } from "@/components/site/logo";
import { copy } from "@/lib/content";
import { fromPrice, getCatalog } from "@/lib/data/public";
import { formatPence } from "@/lib/money";

async function currentYear() {
  "use cache";
  return new Date().getFullYear();
}

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const [catalog, year] = await Promise.all([getCatalog(), currentYear()]);
  return (
    <>
      <Suspense fallback={<HeaderFallback logo={<Logo variant="mark" />} bookLabel={copy.cta.book} />}>
        <SiteHeader
          nav={copy.nav}
          bookLabel={copy.cta.book}
          fromLabel={copy.cta.fromPrefix}
          fromPrice={formatPence(fromPrice(catalog.services))}
          logo={<Logo variant="mark" />}
        />
      </Suspense>
      <main id="main">{children}</main>
      <SiteFooter year={year} />
      <CookieBanner />
      <JsonLd data={businessJsonLd(catalog.services, catalog.workingHours)} />
    </>
  );
}
