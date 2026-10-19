/** PRE-DEPLOY-FIXES #8: every cron run is recorded; the dashboard warns when the last success is > 15 minutes old. */
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { systemStatus } from "@/db/schema";
import { cronHealth, recordCronRun, runJobs } from "@/lib/cron";
import { addMinutes } from "@/lib/time";
import { freshDb } from "./helpers";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const t0 = new Date("2027-01-11T10:00:00Z");

describe("cron freshness", () => {
  it("a full run of the real jobs records its last successful run", async () => {
    await runJobs(db, t0);
    const [row] = await db.select().from(systemStatus).where(eq(systemStatus.key, "cron"));
    expect(row.value).toMatchObject({ lastSuccessAt: t0.toISOString(), lastErrors: [] });
  });

  it("is fresh within 15 minutes and stale after", async () => {
    await recordCronRun(db, { releaseHolds: 0 }, t0);
    expect((await cronHealth(db, addMinutes(t0, 15), true)).stale).toBe(false);
    const late = await cronHealth(db, addMinutes(t0, 16), true);
    expect(late).toMatchObject({ stale: true, ageMinutes: 16 });
  });

  it("a run with a failing step doesn't count as a success", async () => {
    await recordCronRun(db, { releaseHolds: 0 }, t0);
    await recordCronRun(db, { dispatch: { error: "boom" } }, addMinutes(t0, 10));
    const h = await cronHealth(db, addMinutes(t0, 20), true);
    expect(h.lastSuccessAt?.toISOString()).toBe(t0.toISOString());
    expect(h).toMatchObject({ stale: true, lastErrors: ["dispatch"] });
  });

  it("never having run is stale in production/preview, but not locally", async () => {
    expect((await cronHealth(db, t0, true)).stale).toBe(true);
    expect((await cronHealth(db, t0, false)).stale).toBe(false);
  });
});
