import type { Metadata } from "next";
import { business } from "@config/business";
import Body from "@content/policies/privacy.mdx";
import { LegalPage } from "@/components/site/legal-page";

export const metadata: Metadata = { title: "Privacy policy", description: `Privacy policy for ${business.name}.`, alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return <LegalPage title="Privacy policy" Body={Body} />;
}
