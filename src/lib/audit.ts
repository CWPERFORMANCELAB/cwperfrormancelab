import type { DbOrTx } from "@/db/client";
import { auditLog } from "@/db/schema";

/** Append-only audit log: every view of / change to client records, bookings, payments and settings. */
export async function audit(
  db: DbOrTx,
  entry: { actor: string; action: string; entityType: string; entityId?: string | null; meta?: Record<string, unknown>; ip?: string | null },
) {
  try {
    await db.insert(auditLog).values({
      actor: entry.actor,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
    });
  } catch (err) {
    // Auditing must never break the user-facing action, but it must be visible.
    console.error("[audit] failed to write", entry.action, err);
  }
}
