/**
 * apply:client-details — re-applies config/seed-settings.ts to the database.
 *
 *  - Settings: upsert by key (value + placeholder flag).
 *  - Services: upsert by stable ID; services no longer in the seed are ARCHIVED (never deleted) so historic
 *    bookings and payments keep their references. A re-added ID is un-archived.
 *  - Practitioner: upsert.
 *  - Notification templates: inserted if missing only (dashboard edits are preserved).
 *  - Never touches bookings, clients, payments, vouchers or any other operational table.
 */
import { and, isNull, notInArray, sql } from "drizzle-orm";
import { seedPractitioner, seedServices, seedSettings } from "@config/seed-settings";
import type { Db } from "@/db/client";
import { notificationTemplates, practitioners, services, settings } from "@/db/schema";
import { defaultTemplates } from "@/lib/notifications/defaults";
import { seedServiceSchema, settingsSchemas, type SettingKey } from "@/lib/settings-schema";

export type ApplyReport = {
  settings: string[];
  servicesUpserted: string[];
  servicesArchived: string[];
  templatesAdded: string[];
};

export async function applyClientDetails(db: Db, opts: { onlyIfEmpty?: boolean } = {}): Promise<ApplyReport> {
  // Validate everything first so a typo in the config can't half-apply.
  for (const s of seedSettings) settingsSchemas[s.key as SettingKey].parse(s.value);
  const svc = seedServices.map((s) => seedServiceSchema.parse(s));
  const ids = svc.map((s) => s.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate service IDs in config/seed-settings.ts");
  const slugs = svc.map((s) => s.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error("Duplicate service slugs in config/seed-settings.ts");

  const report: ApplyReport = { settings: [], servicesUpserted: [], servicesArchived: [], templatesAdded: [] };

  await db.transaction(async (tx) => {
    if (opts.onlyIfEmpty) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(settings);
      if (n > 0) return;
    }

    await tx
      .insert(practitioners)
      .values(seedPractitioner)
      .onConflictDoUpdate({ target: practitioners.id, set: { name: seedPractitioner.name, title: seedPractitioner.title } });

    for (const s of seedSettings) {
      const row = { key: s.key, value: s.value, placeholder: s.placeholder, placeholderNote: "placeholderNote" in s ? s.placeholderNote ?? null : null };
      await tx
        .insert(settings)
        .values({ ...row, updatedAt: new Date() })
        .onConflictDoUpdate({ target: settings.key, set: { value: row.value, placeholder: row.placeholder, placeholderNote: row.placeholderNote, updatedAt: new Date() } });
      report.settings.push(s.key);
    }

    for (const s of svc) {
      const values = {
        id: s.id,
        name: s.name,
        shortName: s.shortName,
        slug: s.slug,
        category: s.category,
        pricePence: s.pricePence,
        durationMin: s.durationMin,
        bufferMin: s.bufferMin,
        active: s.active,
        runsConcurrently: s.runsConcurrently,
        paymentModel: s.paymentModel,
        depositPercent: s.depositPercent,
        taxRateBp: s.taxRateBp,
        requiredConsents: s.requiredConsents,
        availableAtHome: s.availableAtHome,
        featured: s.featured,
        sortOrder: s.sortOrder,
        placeholder: s.placeholder,
        placeholderNote: s.placeholderNote ?? null,
        archivedAt: null,
        updatedAt: new Date(),
      };
      const { id: _id, ...update } = values;
      void _id;
      await tx.insert(services).values(values).onConflictDoUpdate({ target: services.id, set: update });
      report.servicesUpserted.push(s.id);
    }

    const archived = await tx
      .update(services)
      .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
      .where(and(notInArray(services.id, ids), isNull(services.archivedAt)))
      .returning({ id: services.id });
    report.servicesArchived = archived.map((a) => a.id);

    const added = await tx
      .insert(notificationTemplates)
      .values(defaultTemplates.map((t) => ({ key: t.key, channel: t.channel, name: t.name, subject: t.subject ?? null, body: t.body })))
      .onConflictDoNothing()
      .returning({ key: notificationTemplates.key });
    report.templatesAdded = added.map((a) => a.key);
  });

  return report;
}
