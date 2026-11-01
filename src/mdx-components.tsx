import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { business, fullAddress } from "@config/business";
import { NoShowText, PolicyText, RetentionText, VoucherSetting } from "@/components/site/policy-text";

/**
 * Components available inside content/*.mdx. Dynamic values are always read from config/settings, never typed
 * into content files.
 */
function Business({ field }: { field: "name" | "practitionerName" | "title" | "address" | "email" | "phone" }) {
  const map = {
    name: business.name,
    practitionerName: business.practitioner.name,
    title: business.practitioner.title,
    address: fullAddress(),
    email: business.contact.email,
    phone: business.contact.phone,
  };
  return <>{map[field]}</>;
}

const components: MDXComponents = {
  Business,
  Policy: PolicyText,
  NoShow: NoShowText,
  Retention: RetentionText,
  Vouchers: VoucherSetting,
  a: ({ href = "", children }) =>
    href.startsWith("/") ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
  table: (props) => (
    <div className="prose-table">
      <table {...props} />
    </div>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
