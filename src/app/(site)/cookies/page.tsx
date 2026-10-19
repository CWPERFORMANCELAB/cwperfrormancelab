import type { Metadata } from "next";
import { business } from "@config/business";
import Body from "@content/policies/cookies.mdx";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Cookie policy", description: `Cookie policy for ${business.name}.`, alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return <LegalPage title="Cookie policy" Body={Body} />;
}
