"use client";

import { useState } from "react";
import {
  cancelBookingAction,
  markOutcomeAction,
  refundAction,
  rescheduleAction,
  saveBookingNotesAction,
} from "@/app/admin/(dash)/actions";
import { useAction } from "./client";

export function OutcomeButtons({ bookingId, status, feeHint }: { bookingId: string; status: string; feeHint: string }) {
  const { pending, run, msg } = useAction();
  const [charge, setCharge] = useState(true);
  if (!["confirmed", "attended", "no_show", "late_cancelled"].includes(status)) return null;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-sm btn rounded-lg bg-success/15 text-ink hover:bg-success/25" disabled={pending} onClick={() => run(() => markOutcomeAction(bookingId, "attended", false))}>
          Attended
        </button>
        <button className="btn-sm btn rounded-lg bg-danger/10 text-danger hover:bg-danger/20" disabled={pending} onClick={() => run(() => markOutcomeAction(bookingId, "no_show", charge))}>
          No-show
        </button>
        <button className="btn-sm btn rounded-lg bg-warning/15 text-ink hover:bg-warning/25" disabled={pending} onClick={() => run(() => markOutcomeAction(bookingId, "late_cancelled", charge))}>
          Late cancel
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} className="accent-primary" />
        Apply policy fee ({feeHint})
      </label>
      {msg}
    </div>
  );
}

export function RescheduleForm({ bookingId, date, time }: { bookingId: string; date: string; time: string }) {
  const { pending, run, msg } = useAction();
  const [d, setD] = useState(date);
  const [t, setT] = useState(time);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="field w-auto py-2" aria-label="New date" />
        <input type="time" value={t} step={300} onChange={(e) => setT(e.target.value)} className="field w-auto py-2" aria-label="New time" />
        <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => rescheduleAction(bookingId, d, t))}>
          Move booking
        </button>
      </div>
      <p className="mt-1.5 text-xs text-ink/65">You can book outside normal hours; double booking is still prevented.</p>
      {msg}
    </div>
  );
}

export function CancelForm({ bookingId }: { bookingId: string }) {
  const { pending, run, msg } = useAction();
  const [policy, setPolicy] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional, internal)" className="field py-2" aria-label="Reason" />
      <label className="flex items-center gap-2 text-sm text-ink/70">
        <input type="checkbox" checked={policy} onChange={(e) => setPolicy(e.target.checked)} className="accent-primary" />
        Client-requested: apply cancellation policy (otherwise full refund)
      </label>
      <button
        className="btn btn-sm border border-danger/40 text-danger hover:bg-danger/10"
        disabled={pending}
        onClick={() => {
          if (window.confirm("Cancel this booking? The client will be emailed.")) run(() => cancelBookingAction(bookingId, { applyPolicy: policy, reason }));
        }}
      >
        Cancel booking
      </button>
      {msg}
    </div>
  );
}

export function RefundForm({ paymentId, max }: { paymentId: string; max: number }) {
  const { pending, run, msg } = useAction();
  const [amount, setAmount] = useState((max / 100).toFixed(2));
  const [reason, setReason] = useState("");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">£</span>
        <input type="number" min="0.01" step="0.01" max={(max / 100).toFixed(2)} value={amount} onChange={(e) => setAmount(e.target.value)} className="field w-28 py-1.5" aria-label="Refund amount" />
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" className="field w-40 py-1.5" aria-label="Refund reason" />
        <button
          className="btn-ghost-dark btn-sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Refund £${amount}?`)) run(() => refundAction(paymentId, Number(amount), reason));
          }}
        >
          Refund
        </button>
      </div>
      {msg}
    </div>
  );
}

export function NotesForm({ bookingId, notes, clinical }: { bookingId: string; notes: string; clinical: string | null }) {
  const { pending, run, msg } = useAction();
  const [n, setN] = useState(notes);
  const [c, setC] = useState(clinical ?? "");
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink/60">Private notes</span>
        <textarea value={n} onChange={(e) => setN(e.target.value)} className="field min-h-20" />
      </label>
      {clinical !== null && (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/60">Clinical notes (SOAP)</span>
          <textarea value={c} onChange={(e) => setC(e.target.value)} className="field min-h-40 font-mono text-sm" placeholder={"S:\nO:\nA:\nP:"} />
        </label>
      )}
      <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => saveBookingNotesAction(bookingId, n, clinical !== null ? c : undefined))}>
        Save notes
      </button>
      {msg}
    </div>
  );
}
