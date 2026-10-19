import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { poolMax, shouldAutoMigrate, verifyDbInvariants } from "@/db/client";
import { freshDb } from "./helpers";

describe("database invariants (PRE-DEPLOY-FIXES #3)", () => {
  it("passes on a migrated database", async () => {
    const db = await freshDb();
    await expect(verifyDbInvariants(db)).resolves.toBeUndefined();
  });

  it("fails loudly when the double-booking exclusion constraint is missing", async () => {
    const db = await freshDb();
    await db.execute(sql`alter table bookings drop constraint bookings_no_overlap`);
    try {
      await expect(verifyDbInvariants(db)).rejects.toThrow(/bookings_no_overlap/);
    } finally {
      await db.execute(sql.raw(`alter table "bookings" add constraint "bookings_no_overlap" exclude using gist ("practitioner_id" with =, tstzrange("starts_at", "occupied_until", '[)') with &&) where ("blocks_time" and "status" in ('pending_payment', 'confirmed', 'attended'))`));
    }
    await expect(verifyDbInvariants(db)).resolves.toBeUndefined();
  });
});

describe("serverless connection settings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps the pool between 1 and 3 connections", () => {
    expect(poolMax({} as never)).toBe(2);
    expect(poolMax({ DB_POOL_MAX: "10" } as never)).toBe(3);
    expect(poolMax({ DB_POOL_MAX: "0" } as never)).toBe(1);
  });

  it("never auto-migrates in production or preview, even when told to", () => {
    expect(shouldAutoMigrate({ VERCEL_ENV: "production" } as never)).toBe(false);
    expect(shouldAutoMigrate({ VERCEL_ENV: "preview" } as never)).toBe(false);
    expect(shouldAutoMigrate({ NODE_ENV: "development" } as never)).toBe(true);
    expect(() => shouldAutoMigrate({ VERCEL_ENV: "production", AUTO_MIGRATE: "true" } as never)).toThrow(/AUTO_MIGRATE/);
  });
});
