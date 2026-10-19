"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelByToken, rescheduleByToken, slotsForReschedule } from "@/app/(site)/manage/[token]/actions";
import { Alert, Check } from "@/components/icons";

const tz = "Europe/London";
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

export function ManageActions(props: { token: string; serviceId: string; canReschedule: boolean; rescheduleReason?: string; cancelSummary: string; policy: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reschedule" | "cancel">("idle");
  const [days, setDays] = useState<{ dateIso: string; slots: string[] }[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (mode !== "reschedule" || days) return;
    slotsForReschedule(props.token, today()).then((r) => {
      if (r.ok) {
        setDays(r.days);
        setDay(r.days.find((d) => d.slots.length)?.dateIso ?? null);
      } else setMsg({ ok: false, text: r.error });
    });
  }, [mode, days, props.token]);

  if (msg?.ok) {
    return (
      <p className="mt-8 flex items-start gap-3 rounded-lg bg-success/15 p-5" role="status">
        <Check className="mt-0.5 size-5 text-success" /> {msg.text}
      </p>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      {msg && !msg.ok && (
        <p className="flex items-start gap-2 rounded-lg bg-danger/15 px-4 py-3 text-sm" role="alert">
          <Alert className="mt-0.5 size-4 text-danger" /> {msg.text}
        </p>
      )}
      {mode === "idle" && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary" disabled={!props.canReschedule} onClick={() => setMode("reschedule")}>
            Reschedule
          </button>
          <button type="button" className="btn-ghost" onClick={() => setMode("cancel")}>
            Cancel booking
          </button>
        </div>
      )}
      {!props.canReschedule && mode === "idle" && <p className="text-sm text-bone/60">{props.rescheduleReason}</p>}

      {mode === "reschedule" && (
        <div className="card p-5">
          <p className="font-medium">Choose a new time</p>
          {!days ? (
            <div className="mt-4 h-24 animate-pulse rounded-lg bg-white/5" />
          ) : (
            <>
              <div className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-2">
                {days
                  .filter((d) => d.slots.length)
                  .map((d) => (
                    <button key={d.dateIso} type="button" onClick={() => setDay(d.dateIso)} className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${day === d.dateIso ? "border-primary bg-primary text-on-primary" : "border-white/15"}`}>
                      {fmtDay(d.dateIso)}
                    </button>
                  ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {days
                  .find((d) => d.dateIso === day)
                  ?.slots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={pending}
                      className="min-h-11 rounded-lg border border-white/15 tabular-nums hover:border-primary"
                      onClick={() =>
                        start(async () => {
                          const r = await rescheduleByToken(props.token, s);
                          if (r.ok) {
                            setMsg({ ok: true, text: `Done! Your appointment has moved to ${fmtDay(day!)} at ${fmtTime(s)}. A confirmation is on its way.` });
                            router.refresh();
                          } else setMsg({ ok: false, text: r.error });
                        })
                      }
                    >
                      {fmtTime(s)}
                    </button>
                  ))}
              </div>
            </>
          )}
          <button type="button" className="mt-4 text-sm text-bone/60 underline" onClick={() => setMode("idle")}>
            Back
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="card p-5">
          <p className="font-medium">Cancel this booking?</p>
          <p className="mt-2 text-bone/75">{props.cancelSummary}</p>
          <p className="mt-2 text-sm text-bone/65">{props.policy}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn border border-danger/60 text-bone hover:bg-danger/20"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancelByToken(props.token);
                  if (r.ok) setMsg({ ok: true, text: "Your booking has been cancelled. A confirmation email is on its way." });
                  else setMsg({ ok: false, text: r.error });
                })
              }
            >
              {pending ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMode("idle")}>
              Keep my booking
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
