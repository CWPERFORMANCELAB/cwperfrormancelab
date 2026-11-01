/**
 * Cancellation / rescheduling / no-show policy maths. Pure functions, driven by the cancellationPolicy setting.
 */
import type { Settings } from "@/lib/settings-schema";
import { percentOf } from "@/lib/money";
import { hoursBetween } from "@/lib/time";

export type Policy = Settings["cancellationPolicy"];

export type CancellationOutcome = {
  allowed: boolean;
  late: boolean;
  /** Fee owed under the policy. */
  feePence: number;
  /** What to refund from what's been paid. */
  refundPence: number;
  /** Fee not covered by money already paid (charge to card on file if available). */
  outstandingFeePence: number;
  reason?: string;
};

type BookingLike = { startsAt: Date; pricePence: number; paidPence: number };

export function clientCancellation(booking: BookingLike, policy: Policy, now: Date): CancellationOutcome {
  const hoursUntil = hoursBetween(now, booking.startsAt);
  if (hoursUntil <= 0) {
    return { allowed: false, late: true, feePence: 0, refundPence: 0, outstandingFeePence: 0, reason: "This appointment has already started." };
  }
  if (hoursUntil >= policy.freeCancelHours) {
    return { allowed: true, late: false, feePence: 0, refundPence: booking.paidPence, outstandingFeePence: 0 };
  }
  return applyFee(booking, percentOf(booking.pricePence, policy.lateCancelFeePercent), true);
}

export function noShow(booking: BookingLike, policy: Policy): CancellationOutcome {
  return applyFee(booking, percentOf(booking.pricePence, policy.noShowFeePercent), true);
}

/** Admin-initiated cancellation (e.g. Christopher is ill) — always a full refund, no fee. */
export function practitionerCancellation(booking: BookingLike): CancellationOutcome {
  return { allowed: true, late: false, feePence: 0, refundPence: booking.paidPence, outstandingFeePence: 0 };
}

function applyFee(booking: BookingLike, fee: number, late: boolean): CancellationOutcome {
  const retained = Math.min(fee, booking.paidPence);
  return {
    allowed: true,
    late,
    feePence: fee,
    refundPence: booking.paidPence - retained,
    outstandingFeePence: fee - retained,
  };
}

export function canReschedule(booking: { startsAt: Date }, policy: Policy, now: Date): { allowed: boolean; reason?: string } {
  const hoursUntil = hoursBetween(now, booking.startsAt);
  if (hoursUntil < policy.rescheduleDeadlineHours) {
    return {
      allowed: false,
      reason: `Appointments can be rescheduled up to ${policy.rescheduleDeadlineHours} hours before the start time.`,
    };
  }
  return { allowed: true };
}

/** One sentence used at checkout, in emails, on the FAQ and on the policy page. */
export function policySummary(policy: Policy): string {
  if (policy.lateCancelFeePercent === 0 && policy.noShowFeePercent === 0) {
    // No fees at all: say so plainly rather than implying a charge after the free-cancellation window.
    return `Cancel free of charge for a full refund (please give at least ${policy.freeCancelHours} hours' notice if you can). You can reschedule free of charge up to ${policy.rescheduleDeadlineHours} hours before.`;
  }
  const parts = [`Free cancellation up to ${policy.freeCancelHours} hours before your appointment.`];
  if (policy.lateCancelFeePercent > 0) {
    parts.push(
      `Cancellations with less than ${policy.freeCancelHours} hours' notice are charged ${policy.lateCancelFeePercent}% of the session price${
        policy.noShowFeePercent > 0 ? `, and missed appointments ${policy.noShowFeePercent}%` : ""
      }.`,
    );
  }
  parts.push(`You can reschedule free of charge up to ${policy.rescheduleDeadlineHours} hours before.`);
  return parts.join(" ");
}

/** The terms page's missed-appointment sentence, from the same setting so it can't contradict what's enforced. */
export function noShowSummary(policy: Policy): string {
  return policy.noShowFeePercent > 0
    ? `If you don't attend and haven't cancelled, a fee of ${policy.noShowFeePercent}% of the session price applies.`
    : "If you can't make it, please cancel or let us know as early as you can so someone else can have the slot.";
}
