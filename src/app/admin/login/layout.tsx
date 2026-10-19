import { business } from "@config/business";

export const metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/admin/login">) {
  return (
    <main className="admin-theme grid min-h-dvh place-items-center bg-bone px-4 py-10 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mark.svg" alt={business.name} className="h-9 w-auto invert" />
        </div>
        <div className="rounded-2xl bg-white p-7 shadow-xl">{children}</div>
      </div>
    </main>
  );
}
