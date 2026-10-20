import { and, eq, gt, gte, inArray, lt, or, sql } from "drizzle-orm";
import { business } from "@config/business";
import type { DbOrTx } from "@/db/client";
import { availabilityDays, blockedTimes, bookings, type Service } from "@/db/schema";
import type { Settings } from "@/lib/settings-schema";
import { addDaysIso, localDateOf, localDayBounds } from "@/lib/time";
import { slotsForDay, type DayAvailability, type DayResult, type Interval } from "./engine";

/** Statuses that hold the practitioner's time (mirrors the DB exclusion constraint). */
export const ACTIVE_STATUSES = ["pending_payment", "confirmed", "attended"] as const;
/** Statuses that count towards the daily cap. */
const CAP_STATUSES = ["pending_payment", "confirmed", "attended", "no_show", "late_cancelled"] as const;

type Range = { start: Date; end: Date };

/** Load busy intervals + per-day counts for a date range in one round trip each. */
export async function loadBusy(db: DbOrTx, practitionerId: string, range: Range, opts: { excludeBookingId?: string; now: Date }) {
  const now = opts.now;
  const rows = await db
    .select({
      id: bookings.id,
      startsAt: bookings.startsAt,
      occupiedUntil: bookings.occupiedUntil,
      status: bookings.status,
      blocksTime: bookings.blocksTime,
      holdExpiresAt: bookings.holdExpiresAt,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.practitionerId, practitionerId),
        inArray(bookings.status, [...CAP_STATUSES]),
        lt(bookings.startsAt, range.end),
        gt(bookings.occupiedUntil, range.start),
      ),
    );

  const live = rows.filter(
    (b) => b.id !== opts.excludeBookingId && !(b.status === "pending_payment" && b.holdExpiresAt && b.holdExpiresAt <= now),
  );

  const blocks = await db
    .select({ startsAt: blockedTimes.startsAt, endsAt: blockedTimes.endsAt })
    .from(blockedTimes)
    .where(and(eq(blockedTimes.practitionerId, practitionerId), lt(blockedTimes.startsAt, range.end), gt(blockedTimes.endsAt, range.start)));

  const busy: Interval[] = [
    ...live
      .filter((b) => b.blocksTime && (ACTIVE_STATUSES as readonly string[]).includes(b.status))
      .map((b) => ({ start: b.startsAt, end: b.occupiedUntil })),
    ...blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  ];

  const countsByDay = new Map<string, number>();
  for (const b of live) {
    const d = localDateOf(b.startsAt);
    countsByDay.set(d, (countsByDay.get(d) ?? 0) + 1);
  }
  return { busy, countsByDay };
}

/** Hours entered per date (availability_days) for [fromIso, toIso), keyed by date. */
export async function loadDayHours(db: DbOrTx, practitionerId: string, fromIso: string, toIso: string): Promise<Map<string, DayAvailability>> {
  const rows = await db
    .select()
    .from(availabilityDays)
    .where(and(eq(availabilityDays.practitionerId, practitionerId), gte(availabilityDays.date, fromIso), lt(availabilityDays.date, toIso)));
  return new Map(rows.map((r) => [r.date, { ranges: r.ranges, cap: r.cap }]));
}

export async function availabilityForRange(
  db: DbOrTx,
  args: {
    service: Pick<Service, "durationMin" | "bufferMin" | "runsConcurrently">;
    settings: Pick<Settings, "dailyCaps" | "bookingRules">;
    fromIso: string;
    days: number;
    now?: Date;
    practitionerId?: string;
    excludeBookingId?: string;
  },
): Promise<DayResult[]> {
  const now = args.now ?? new Date();
  const practitionerId = args.practitionerId ?? business.practitioner.id;
  const toIso = addDaysIso(args.fromIso, args.days);
  const range = { start: localDayBounds(args.fromIso).start, end: localDayBounds(toIso).start };
  const { busy, countsByDay } = await loadBusy(db, practitionerId, range, { excludeBookingId: args.excludeBookingId, now });
  const entered = await loadDayHours(db, practitionerId, args.fromIso, toIso);

  const out: DayResult[] = [];
  for (let i = 0; i < args.days; i++) {
    const dateIso = addDaysIso(args.fromIso, i);
    const bounds = localDayBounds(dateIso);
    out.push(
      slotsForDay({
        dateIso,
        service: args.service,
        dailyCaps: args.settings.dailyCaps,
        hours: entered.get(dateIso),
        rules: args.settings.bookingRules,
        busy: busy.filter((b) => b.start < bounds.end && b.end > bounds.start),
        bookingsOnDay: countsByDay.get(dateIso) ?? 0,
        now,
      }),
    );
  }
  return out;
}

/** Cancel holds whose checkout window has passed so they stop blocking the slot (and the constraint). */
export async function releaseExpiredHolds(db: DbOrTx, now = new Date()) {
  return db
    .update(bookings)
    .set({ status: "cancelled", cancelledAt: now, cancelReason: "checkout_expired", updatedAt: now })
    .where(and(eq(bookings.status, "pending_payment"), lt(bookings.holdExpiresAt, now)))
    .returning({ id: bookings.id });
}

/** Postgres advisory lock scoped to the transaction: serialises cap/blocked-time checks per practitioner. */
export async function lockPractitioner(tx: DbOrTx, practitionerId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"booking:" + practitionerId}))`);
}

export { or };
