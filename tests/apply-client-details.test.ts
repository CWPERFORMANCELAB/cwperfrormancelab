import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { bookings, clients, payments, services, settings } from "@/db/schema";
import { confirmBooking, createHold, submitDetails } from "@/lib/booking/service";
import { applyClientDetails } from "@/lib/seed/apply";
import { loadSettings } from "@/lib/settings";
import { freshDb, MON } from "./helpers";
import { at, details, NOW } from "./fixtures";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedOperationalData() {
  const { booking, holdToken } = await createHold(db, { serviceId: "sports-massage", startsAt: at(MON, "10:00"), now: NOW });
  await submitDetails(db, booking.id, holdToken, details(), NOW);
  await confirmBooking(db, booking.id, { paidPence: 6000, now: NOW });
  await db.insert(payments).values({ bookingId: booking.id, provider: "manual", amountPence: 6000, status: "succeeded" });
  return booking;
}

const counts = async () => {
  const r = (await db.execute(
    sql`select (select count(*) from bookings)::int b, (select count(*) from clients)::int c, (select count(*) from payments)::int p, (select count(*) from intake_forms)::int i`,
  )) as unknown as { rows: { b: number; c: number; p: number; i: number }[] };
  return r.rows[0];
};

describe("apply:client-details", () => {
  it("is idempotent and never touches bookings, clients or payments", async () => {
    const booking = await seedOperationalData();
    const before = await counts();
    const [bBefore] = await db.select().from(bookings).where(eq(bookings.id, booking.id));

    await applyClientDetails(db);
    await applyClientDetails(db);

    expect(await counts()).toEqual(before);
    const [bAfter] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
    expect(bAfter).toEqual(bBefore);
  });

  it("updates service prices/durations in place by stable ID; existing bookings keep their price", async () => {
    const booking = await seedOperationalData();
    const mod = await import("@config/seed-settings");
    const original = structuredClone(mod.seedServices);
    const massage = mod.seedServices.find((s) => s.id === "sports-massage")!;
    massage.pricePence = 6500;
    massage.durationMin = 50;
    massage.placeholder = false;
    try {
      await applyClientDetails(db);
      const [svc] = await db.select().from(services).where(eq(services.id, "sports-massage"));
      expect(svc).toMatchObject({ pricePence: 6500, durationMin: 50, placeholder: false });
      const [b] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(b.pricePence).toBe(6000);
    } finally {
      mod.seedServices.splice(0, mod.seedServices.length, ...original);
    }
  });

  it("archives (never deletes) services removed from the config, and restores them if re-added", async () => {
    await seedOperationalData();
    const mod = await import("@config/seed-settings");
    const original = structuredClone(mod.seedServices);
    try {
      mod.seedServices.splice(mod.seedServices.findIndex((s) => s.id === "sports-massage"), 1);
      const report = await applyClientDetails(db);
      expect(report.servicesArchived).toEqual(["sports-massage"]);
      const [svc] = await db.select().from(services).where(eq(services.id, "sports-massage"));
      expect(svc.archivedAt).toBeTruthy();
      expect(svc.active).toBe(false);
      expect((await counts()).b).toBe(1); // booking still references it

      mod.seedServices.splice(0, mod.seedServices.length, ...original);
      await applyClientDetails(db);
      const [restored] = await db.select().from(services).where(eq(services.id, "sports-massage"));
      expect(restored.archivedAt).toBeNull();
    } finally {
      mod.seedServices.splice(0, mod.seedServices.length, ...original);
    }
  });

  it("updates settings and their placeholder flags", async () => {
    const mod = await import("@config/seed-settings");
    const policy = mod.seedSettings.find((s) => s.key === "cancellationPolicy")! as unknown as { value: Record<string, number>; placeholder: boolean };
    const original = structuredClone(policy);
    try {
      policy.value.freeCancelHours = 48;
      policy.placeholder = false;
      await applyClientDetails(db);
      expect((await loadSettings(db)).cancellationPolicy.freeCancelHours).toBe(48);
      const [row] = await db.select().from(settings).where(eq(settings.key, "cancellationPolicy"));
      expect(row.placeholder).toBe(false);
    } finally {
      Object.assign(policy, original);
    }
  });

  it("rejects an invalid config without applying anything", async () => {
    const mod = await import("@config/seed-settings");
    const svc = mod.seedServices[0];
    const price = svc.pricePence;
    try {
      svc.pricePence = -5;
      await expect(applyClientDetails(db)).rejects.toThrow();
      const [row] = await db.select().from(services).where(eq(services.id, svc.id));
      expect(row.pricePence).toBe(price);
    } finally {
      svc.pricePence = price;
    }
  });

  it("does not overwrite dashboard edits to notification templates", async () => {
    await db.execute(sql`update notification_templates set body = 'custom' where key = 'booking_confirmed'`);
    await applyClientDetails(db);
    const r = (await db.execute(sql`select body from notification_templates where key = 'booking_confirmed'`)) as unknown as { rows: { body: string }[] };
    expect(r.rows[0].body).toBe("custom");
  });

  void vi;
  void clients;
});
