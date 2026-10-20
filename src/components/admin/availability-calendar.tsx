"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { clearAvailabilityAction, setAvailabilityAction } from "@/app/admin/(dash)/actions";
import type { CalendarDay } from "@/lib/availability/plan";
import { useAction } from "./client";

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

type Period = { open: string; close: string };
const MAX_PERIODS = 3;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** A sensible next period: starts an hour after the last one ends, runs 3 hours (kept within the day). */
function nextPeriod(periods: Period[]): Period {
  const lastEnd = Math.max(...periods.map((p) => (p.close ? toMin(p.close) : 0)));
  const start = Math.min(lastEnd + 60, 20 * 60);
  return { open: hhmm(start), close: hhmm(Math.min(start + 180, 23 * 60)) };
}

function problem(periods: Period[]): string | null {
  for (const p of periods) {
    if (!p.open || !p.close) return "Enter a start and finish time for each period.";
    if (toMin(p.close) <= toMin(p.open)) return `${short(p.open)}–${short(p.close)}: the finish must be after the start.`;
  }
  const sorted = [...periods].sort((a, b) => toMin(a.open) - toMin(b.open));
  for (let i = 1; i < sorted.length; i++) {
    if (toMin(sorted[i].open) < toMin(sorted[i - 1].close)) return "Two of your time periods overlap.";
  }
  return null;
}

export function AvailabilityCalendar({ months, days, today, prevHref, nextHref }: { months: string[]; days: CalendarDay[]; today: string; prevHref: string | null; nextHref: string }) {
  const [periods, setPeriods] = useState<Period[]>([{ open: "09:00", close: "17:00" }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const { pending, run, msg } = useAction();

  const byDate = useMemo(() => new Map(days.map((d) => [d.dateIso, d])), [days]);
  const future = days.filter((d) => d.dateIso >= today).map((d) => d.dateIso);
  const dates = [...selected].sort();
  const err = problem(periods);
  const ranges = [...periods].sort((a, b) => toMin(a.open) - toMin(b.open));
  const hoursText = err ? "" : ranges.map((r) => `${short(r.open)}–${short(r.close)}`).join(" & ");
  const setPeriod = (i: number, k: keyof Period, v: string) => setPeriods((ps) => ps.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

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
        <p className="mt-1 text-xs text-ink/55">The times clients can book on the days you pick next.</p>
        <div className="mt-4 space-y-3">
          {periods.map((p, i) => (
            <div key={i} className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink/60">{periods.length > 1 ? `Period ${i + 1}: start` : "Start"}</span>
                <input type="time" className="field w-36 py-2" value={p.open} onChange={(e) => setPeriod(i, "open", e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink/60">Finish</span>
                <input type="time" className="field w-36 py-2" value={p.close} onChange={(e) => setPeriod(i, "close", e.target.value)} />
              </label>
              {i > 0 && (
                <button type="button" className="mb-2.5 text-sm text-ink/55 hover:text-danger" onClick={() => setPeriods((ps) => ps.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        {periods.length < MAX_PERIODS && (
          <button type="button" className="mt-3 text-sm font-medium text-primary-strong hover:underline" onClick={() => setPeriods((ps) => [...ps, nextPeriod(ps)])}>
            + Add another time period
          </button>
        )}
        {periods.length > 1 && !err && <p className="mt-2 text-xs text-ink/55">Clients can book {hoursText}, and nothing in between.</p>}
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
                            {/* One line per period, so a split day (morning + evening) shows its gap. */}
                            {d!.ranges.map((r) => (
                              <span key={r.open} className="block">{short(r.open)}–{short(r.close)}</span>
                            ))}
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
                  onClick={() => done(() => setAvailabilityAction({ dates, ranges, cap: null }))}
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
