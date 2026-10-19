import { eq, sql } from "drizzle-orm";
import { Suspense } from "react";
import { seedServices, seedSettings } from "@config/seed-settings";
import { AdminNav, PlaceholderBanner } from "@/components/admin/nav";
import { getDb } from "@/db/client";
import { enquiries } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dbPlaceholderCount, scanFiles } from "@/lib/placeholders";
import { logoutAction } from "../login/actions";

export const metadata = { title: { default: "Dashboard", template: "%s · Dashboard" }, robots: { index: false, follow: false } };

async function Shell({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const db = await getDb();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(enquiries).where(eq(enquiries.status, "new"));
  // Banner count: DB settings/services still flagged (reflects dashboard edits) + file-level placeholders.
  const dbp = await dbPlaceholderCount(db);
  const fileItems = scanFiles({ settings: [...seedSettings] as never, services: seedServices }).filter((i) => i.area !== "Settings" && i.area !== "Services");
  const count = dbp.settings.length + dbp.services.length + fileItems.length;
  return (
    <>
      <AdminNav logout={logoutAction} newEnquiries={n} />
      <main className="px-4 pt-5 pb-24 sm:px-6 lg:ml-60 lg:px-10 lg:pt-8 lg:pb-12">
        <div className="mx-auto max-w-6xl">
          <PlaceholderBanner count={count} />
          {children}
        </div>
      </main>
    </>
  );
}

export default function DashLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-theme min-h-dvh bg-paper text-ink">
      <Suspense fallback={<div className="p-10 text-sm text-ink/65">Loading…</div>}>
        <Shell>{children}</Shell>
      </Suspense>
    </div>
  );
}
