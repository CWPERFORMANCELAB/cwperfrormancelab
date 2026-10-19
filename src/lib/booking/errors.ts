export class BookingError extends Error {
  constructor(
    public code:
      | "slot_unavailable"
      | "service_unavailable"
      | "hold_expired"
      | "not_found"
      | "policy"
      | "invalid"
      | "voucher_invalid"
      | "discount_invalid",
    message: string,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

/** Postgres exclusion-constraint violation (double booking caught by the DB). */
export function isOverlapViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.code ?? e?.cause?.code;
  const msg = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return code === "23P01" || msg.includes("bookings_no_overlap");
}
