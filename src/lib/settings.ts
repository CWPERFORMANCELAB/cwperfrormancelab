import { asc, eq, isNull } from "drizzle-orm";
import { seedSettings } from "@config/seed-settings";
import type { DbOrTx } from "@/db/client";
import { services, settings } from "@/db/schema";
import { settingKeys, settingsSchemas, type SettingKey, type Settings } from "@/lib/settings-schema";

const defaults = Object.fromEntries(seedSettings.map((s) => [s.key, s.value])) as unknown as Settings;

/** All settings, validated. Missing/invalid keys fall back to the seed value (and log) so the site never breaks. */
export async function loadSettings(db: DbOrTx): Promise<Settings> {
  const rows = await db.select().from(settings);
  const out = { ...defaults } as Record<SettingKey, unknown>;
  for (const row of rows) {
    if (!(row.key in settingsSchemas)) continue;
    const key = row.key as SettingKey;
    const parsed = settingsSchemas[key].safeParse(row.value);
    if (parsed.success) out[key] = parsed.data;
    else console.error(`[settings] invalid value for "${key}", using default`, parsed.error.issues);
  }
  return out as Settings;
}

export async function loadSetting<K extends SettingKey>(db: DbOrTx, key: K): Promise<Settings[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  const parsed = row ? settingsSchemas[key].safeParse(row.value) : null;
  return (parsed?.success ? parsed.data : defaults[key]) as Settings[K];
}

/** Validates, saves and clears the placeholder flag (an edit in the dashboard = a confirmed value). */
export async function saveSetting<K extends SettingKey>(db: DbOrTx, key: K, value: unknown): Promise<Settings[K]> {
  const parsed = settingsSchemas[key].parse(value) as Settings[K];
  await db
    .insert(settings)
    .values({ key, value: parsed, placeholder: false, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, placeholder: false, placeholderNote: null, updatedAt: new Date() } });
  return parsed;
}

export async function listServices(db: DbOrTx, opts: { includeInactive?: boolean } = {}) {
  const rows = await db.select().from(services).where(isNull(services.archivedAt)).orderBy(asc(services.sortOrder));
  return opts.includeInactive ? rows : rows.filter((s) => s.active);
}

export async function getService(db: DbOrTx, id: string) {
  const [row] = await db.select().from(services).where(eq(services.id, id));
  return row ?? null;
}

export { settingKeys };
