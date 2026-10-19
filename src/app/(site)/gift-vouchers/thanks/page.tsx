import Link from "next/link";
import { PageHero } from "@/components/site/blocks";

export const metadata = { title: "Thank you", robots: { index: false } };

export default function VoucherThanks() {
  return (
    <PageHero
      eyebrow="Gift vouchers"
      title="Thank you, your voucher is on its way."
      lede="We've emailed the e-voucher with its unique code. If you added the recipient's email, they've received a copy too. It can take a minute or two to arrive; check your spam folder if you can't see it."
    >
      <Link href="/" className="btn-ghost">
        Back to home
      </Link>
    </PageHero>
  );
}
