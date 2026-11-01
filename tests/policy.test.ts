import { describe, expect, it } from "vitest";
import { seedSettings } from "@config/seed-settings";
import { canReschedule, clientCancellation, noShow, noShowSummary, policySummary, practitionerCancellation } from "@/lib/policy";

const policy = { freeCancelHours: 24, lateCancelFeePercent: 50, noShowFeePercent: 50, rescheduleDeadlineHours: 24 };
const start = new Date("2027-01-11T10:00:00Z");
const hoursBefore = (h: number) => new Date(start.getTime() - h * 3_600_000);
const paidInFull = { startsAt: start, pricePence: 6500, paidPence: 6500 };

describe("client cancellation", () => {
  it("is free with 24h+ notice: full refund", () => {
    expect(clientCancellation(paidInFull, policy, hoursBefore(24))).toMatchObject({ late: false, feePence: 0, refundPence: 6500 });
    expect(clientCancellation(paidInFull, policy, hoursBefore(72))).toMatchObject({ refundPence: 6500 });
  });

  it("charges 50% under 24h: refunds the other half", () => {
    expect(clientCancellation(paidInFull, policy, hoursBefore(23.9))).toMatchObject({
      late: true,
      feePence: 3250,
      refundPence: 3250,
      outstandingFeePence: 0,
    });
  });

  it("with card on file (nothing paid), the whole fee is outstanding", () => {
    const b = { ...paidInFull, paidPence: 0 };
    expect(clientCancellation(b, policy, hoursBefore(2))).toMatchObject({ feePence: 3250, refundPence: 0, outstandingFeePence: 3250 });
  });

  it("with a deposit smaller than the fee, keeps the deposit and the rest is outstanding", () => {
    const b = { ...paidInFull, paidPence: 2000 };
    expect(clientCancellation(b, policy, hoursBefore(2))).toMatchObject({ refundPence: 0, outstandingFeePence: 1250 });
  });

  it("with a deposit larger than the fee, refunds the difference", () => {
    const b = { ...paidInFull, paidPence: 4000 };
    expect(clientCancellation(b, policy, hoursBefore(2))).toMatchObject({ refundPence: 750, outstandingFeePence: 0 });
  });

  it("can't cancel once the appointment has started", () => {
    expect(clientCancellation(paidInFull, policy, start).allowed).toBe(false);
  });

  it("rounds odd prices to the nearest penny", () => {
    const b = { startsAt: start, pricePence: 2501, paidPence: 2501 };
    const r = clientCancellation(b, policy, hoursBefore(1));
    expect(r.feePence + r.refundPence).toBe(2501);
  });
});

describe("no-show and practitioner cancellation", () => {
  it("no-show charges 50%", () => {
    expect(noShow(paidInFull, policy)).toMatchObject({ feePence: 3250, refundPence: 3250 });
  });
  it("practitioner cancellation always refunds in full", () => {
    expect(practitionerCancellation(paidInFull)).toMatchObject({ feePence: 0, refundPence: 6500 });
  });
  it("a 0% policy charges nothing", () => {
    const free = { ...policy, lateCancelFeePercent: 0, noShowFeePercent: 0 };
    expect(clientCancellation(paidInFull, free, hoursBefore(1))).toMatchObject({ feePence: 0, refundPence: 6500 });
  });
});

describe("rescheduling", () => {
  it("is allowed up to the 24h deadline only", () => {
    expect(canReschedule({ startsAt: start }, policy, hoursBefore(25)).allowed).toBe(true);
    expect(canReschedule({ startsAt: start }, policy, hoursBefore(23)).allowed).toBe(false);
  });
});

it("summarises the policy from settings", () => {
  expect(policySummary(policy)).toContain("Free cancellation up to 24 hours");
  expect(policySummary(policy)).toContain("50%");
  expect(noShowSummary(policy)).toContain("50% of the session price");
});

it("with no fees, never implies a charge (launch policy, 2026-11-01)", () => {
  const free = { ...policy, lateCancelFeePercent: 0, noShowFeePercent: 0 };
  expect(policySummary(free)).toMatch(/^Cancel free of charge for a full refund/);
  expect(policySummary(free)).not.toMatch(/%|fee|charged/);
  expect(noShowSummary(free)).not.toMatch(/%|fee/);
  // The launch settings really are fee-free, and SMS (no Twilio yet) is off.
  const launch = seedSettings.find((x) => x.key === "cancellationPolicy")!.value as typeof policy;
  expect(launch).toMatchObject({ lateCancelFeePercent: 0, noShowFeePercent: 0 });
  expect((seedSettings.find((x) => x.key === "features")!.value as { smsReminders: boolean }).smsReminders).toBe(false);
});
