import type { Metadata } from "next";
import { business } from "@config/business";
import Body from "@content/policies/terms.mdx";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Terms & cancellation policy", description: `Terms & cancellation policy for ${business.name}.`, alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <LegalPage title="Terms & cancellation policy" Body={Body} />;
}
