"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { clearAvailabilityAction, setAvailabilityAction } from "@/app/admin/(dash)/actions";
import type { CalendarDay } from "@/lib/availability/plan";
import { useAction } from "./client";

const PRESETS = [
  { label: "9am – 5pm", open: "09:00", close: "17:00" },
  { label: "8am – 7pm", open: "08:00", close: "19:00" },
  { label: "Mornings 8am – 1pm", open: "08:00", close: "13:00" },
  { label: "Afternoons 1pm – 6pm", open: "13:00", close: "18:00" },
  { label: "Evenings 4pm – 8pm", open: "16:00", close: "20:00" },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const short = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const weekdayIdx = (iso: string) => (utc(iso).getUTCDay() + 6) % 7; // Mon = 0
const addDays = (iso: string, n: number) => {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const monthLabel = (ym: string) => utc(`${ym}-01`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const longDate = (iso: string) => utc(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Sun 25 Oct, Sun 1 Nov, Sun 8 Nov +3 more" */
const summary = (dates: string[]) => (dates.length <= 3 ? dates.map(longDate).join(", ") : `${dates.slice(0, 3).map(longDate).join(", ")} +${dates.length - 3} more`);

/** Turn "open, close, optional break" into the ranges the server stores. */
function toRanges(open: string, close: string, brk: { from: string; to: string } | null) {
  if (!brk) return [{ open, close }];
  return [
    { open, close: brk.from },
    { open: brk.to, close },
  ];
}
function problem(open: string, close: string, brk: { from: string; to: string } | null): string | null {
  if (!open || !close) return "Enter a start and finish time.";
  if (toMin(close) <= toMin(open)) return "Finish time must be after the start time.";
  if (brk) {
    if (!brk.from || !brk.to || toMin(brk.to) <= toMin(brk.from)) return "The break must end after it starts.";
    if (toMin(brk.from) <= toMin(open) || toMin(brk.to) >= toMin(close)) return "The break must be inside your hours.";
  }
  return null;
}

export function AvailabilityCalendar({ months, days, today, prevHref, nextHref }: { months: string[]; days: CalendarDay[]; today: string; prevHref: string | null; nextHref: string }) {
  const [open, setOpen] = useState("09:00");
  const [close, setClose] = useState("17:00");
  const [brk, setBrk] = useState<{ from: string; to: string } | null>(null);
  const [cap, setCap] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const { pending, run, msg } = useAction();

  const byDate = useMemo(() => new Map(days.map((d) => [d.dateIso, d])), [days]);
  const future = days.filter((d) => d.dateIso >= today).map((d) => d.dateIso);
  const dates = [...selected].sort();
  const err = problem(open, close, brk);
  const hoursText = err ? "" : toRanges(open, close, brk).map((r) => `${short(r.open)}–${short(r.close)}`).join(" & ");

  const click = (iso: string, shift: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (shift && anchor) {
        // Shift-click selects every day between the last tapped day and this one.
        const [a, b] = [anchor, iso].sort();
        for (let d = a; d <= b; d = addDays(d, 1)) if (d >= today && byDate.has(d)) n.add(d);
      } else if (n.has(iso)) n.delete(iso);
      else n.add(iso);
      return n;
    });
    setAnchor(iso);
  };
  const everyWeekday = (wd: number) => {
    const all = future.filter((d) => weekdayIdx(d) === wd);
    const on = all.every((d) => selected.has(d));
    setSelected((s) => {
      const n = new Set(s);
      all.forEach((d) => (on ? n.delete(d) : n.add(d)));
      return n;
    });
  };
  const done = (fn: () => ReturnType<typeof setAvailabilityAction>) =>
    run(async () => {
      const r = await fn();
      if (r.ok) setSelected(new Set());
      return r;
    });

  return (
    <div className="space-y-4 pb-36">
      {/* Step 1 */}
      <section className="rounded-xl border border-ink/[0.08] bg-white p-5">
        <h2 className="text-sm font-semibold"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-primary text-xs">1</span>Your hours</h2>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Start</span>
            <input type="time" className="field w-32 py-2" value={open} onChange={(e) => setOpen(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink/60">Finish</span>
            <input type="time" className="field w-32 py-2" value={close} onChange={(e) => setClose(e.target.value)} />
          </label>
          {brk ? (
            <div className="flex items-end gap-2 rounded-lg bg-ink/[0.03] p-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink/60">Break from</span>
                <input type="time" className="field w-32 py-2" value={brk.from} onChange={(e) => setBrk({ ...brk, from: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink/60">until</span>
                <input type="time" className="field w-32 py-2" value={brk.to} onChange={(e) => setBrk({ ...brk, to: e.target.value })} />
              </label>
              <button type="button" className="mb-2 px-1 text-sm text-ink/50 hover:text-danger" aria-label="Remove break" onClick={() => setBrk(null)}>×</button>
            </div>
          ) : (
            <button type="button" className="mb-2.5 text-sm font-medium text-primary-strong hover:underline" onClick={() => setBrk({ from: "12:00", to: "13:00" })}>+ Add a break</button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="chip" onClick={() => (setOpen(p.open), setClose(p.close))}>{p.label}</button>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-ink/60">More options</summary>
          <label className="mt-2 flex items-center gap-2 text-ink/70">
            Max appointments on these days
            <input type="number" min={1} max={30} placeholder="default" className="field w-24 py-1.5" value={cap} onChange={(e) => setCap(e.target.value)} />
          </label>
          <p className="mt-1 text-xs text-ink/50">Leave blank to use your daily limits from Settings.</p>
        </details>
        {err && <p className="mt-3 text-sm text-danger">{err}</p>}
      </section>

      {/* Step 2 */}
      <section className="rounded-xl border border-ink/[0.08] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-primary text-xs">2</span>Pick the days</h2>
          <div className="flex items-center gap-1.5">
            {prevHref ? (
              <Link href={prevHref} className="btn-ghost-dark btn-sm" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
            ) : (
              <span className="btn-ghost-dark btn-sm pointer-events-none opacity-35" aria-hidden><ChevronLeft className="size-4" /></span>
            )}
            <Link href={nextHref} className="btn-ghost-dark btn-sm" aria-label="Next month"><ChevronRight className="size-4" /></Link>
          </div>
        </div>
        <p className="mt-1 text-xs text-ink/55">Tap days to select them (tap again to unselect). On a computer, shift-click selects a run of days.</p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="mr-1 text-ink/60">Every:</span>
          {WEEKDAYS.map((w, i) => (
            <button key={w} type="button" className="chip" onClick={() => everyWeekday(i)}>{w}</button>
          ))}
          {selected.size > 0 && <button type="button" className="chip" onClick={() => setSelected(new Set())}>Clear selection</button>}
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          {months.map((ym) => {
            const first = `${ym}-01`;
            const lead = weekdayIdx(first);
            let cells: (string | null)[] = Array(lead).fill(null);
            for (let d = first; d.startsWith(ym); d = addDays(d, 1)) cells.push(d);
            // Hide weeks that are entirely in the past.
            while (cells.length >= 7 && cells.slice(0, 7).every((c) => !c || c < today)) cells = cells.slice(7);
            return (
              <div key={ym}>
                <h3 className="mb-2 text-sm font-semibold">{monthLabel(ym)}</h3>
                <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-ink/50">
                  {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {cells.map((iso, i) => {
                    if (!iso) return <span key={`x${i}`} />;
                    const d = byDate.get(iso);
                    const past = iso < today;
                    const on = selected.has(iso);
                    const avail = !!d?.ranges.length;
                    const label = avail ? d!.ranges.map((r) => `${short(r.open)}–${short(r.close)}`).join(", ") : "Not available";
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={past}
                        aria-pressed={on}
                        aria-label={`${longDate(iso)}: ${label}${d?.booked ? `, ${d.booked} booked` : ""}`}
                        title={`${label}${d?.booked ? ` · ${d.booked} booked` : ""}${d?.blocked ? " · has time off" : ""}`}
                        onClick={(e) => click(iso, e.shiftKey)}
                        className={`relative flex min-h-14 flex-col items-center justify-start rounded-lg border px-0.5 pt-1.5 pb-1 text-xs transition sm:min-h-16 ${
                          past
                            ? "cursor-not-allowed border-transparent text-ink/25"
                            : on
                              ? "border-ink bg-ink text-bone"
                              : avail
                                ? "border-primary/40 bg-primary/20 text-ink hover:border-primary"
                                : "border-ink/[0.07] text-ink/70 hover:border-ink/30"
                        } ${iso === today ? "ring-1 ring-ink/30" : ""}`}
                      >
                        <span className="text-sm font-semibold tabular-nums">{Number(iso.slice(8))}</span>
                        {avail && !past && (
                          <span className={`mt-0.5 hidden text-[10px] leading-tight sm:block ${on ? "text-bone/80" : "text-ink/70"}`}>
                            {short(d!.ranges[0].open)}–{short(d!.ranges[d!.ranges.length - 1].close)}
                          </span>
                        )}
                        {!!d?.booked && !past && <span className={`absolute top-1 right-1 size-1.5 rounded-full ${on ? "bg-bone" : "bg-ink/60"}`} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-ink/60">
          <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-primary/40 bg-primary/20" /> Available (clients can book)</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded border border-ink/15" /> Not available</span>
          <span className="flex items-center gap-1.5"><span className="size-3 rounded bg-ink" /> Selected</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ink/60" /> Has bookings</span>
        </div>
      </section>

      {/* Step 3: save bar */}
      {(selected.size > 0 || msg) && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-ink/10 bg-white/95 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur lg:bottom-0 lg:left-60">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6 lg:px-10">
            {selected.size > 0 && (
              <>
                <p className="mr-auto min-w-0 text-sm">
                  <b>{selected.size} day{selected.size === 1 ? "" : "s"}</b> selected
                  <span className="block truncate text-xs text-ink/60" title={dates.map(longDate).join(", ")}>{summary(dates)}</span>
                </p>
                <button
                  type="button"
                  className="btn-ghost-dark btn-sm"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm(`Make ${selected.size} day${selected.size === 1 ? "" : "s"} unavailable?\n\n${dates.map(longDate).join(", ")}\n\nClients won't be able to book them. Existing bookings stay booked.`)) done(() => clearAvailabilityAction({ dates }));
                  }}
                >
                  Make unavailable
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={pending || !!err}
                  onClick={() => done(() => setAvailabilityAction({ dates, ranges: toRanges(open, close, brk), cap: cap ? Number(cap) : null }))}
                >
                  {err ? "Fix your hours first" : `Available ${hoursText} on ${selected.size} day${selected.size === 1 ? "" : "s"}`}
                </button>
              </>
            )}
            <div className="w-full">{msg}</div>
          </div>
        </div>
      )}
    </div>
  );
}
