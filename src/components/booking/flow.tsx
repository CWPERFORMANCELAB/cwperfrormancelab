"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { checkout, fetchSlots, holdSlot, previewQuote, releaseSlot, requestCode, verifyCode } from "@/app/(site)/book/actions";
import { SessionPicker, type PickerConfig } from "@/components/site/picker";
import { Alert, ArrowRight, Calendar, Check, ChevronLeft, ChevronRight, Clock, Lock } from "@/components/icons";
import {
  compressionContraindications,
  dryCuppingContraindications,
  redFlagQuestions,
  referralSources,
  trainingLevels,
} from "@/lib/booking/questions";

export type FlowService = {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  category: string;
  price: string;
  durationMin: number;
  requiredConsents: string[];
  featured: boolean;
};

type Props = {
  services: FlowService[];
  categories: Record<string, { label: string }>;
  initialServiceId?: string;
  showPicker?: boolean;
  picker: PickerConfig;
  policy: string;
  steps: string[];
  redFlagNotice: string;
  holdNotice: string;
  /** Feature flags that change the checkout. */
  features?: { insuranceBookings: boolean; packages: boolean };
};

type Day = { dateIso: string; slots: string[]; reason: string | null };
type Hold = { bookingId: string; holdToken: string; holdExpiresAt: string; serviceId: string; startsAt: string };
type YN = "yes" | "no";

const tz = "Europe/London";
const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const fmtLong = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ageOn = (dob: string, on: Date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 99;
  const b = new Date(`${dob}T00:00:00Z`);
  let a = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) a--;
  return a;
};
const allNo = <T extends readonly { id: string }[]>(qs: T) => Object.fromEntries(qs.map((q) => [q.id, ""])) as Record<T[number]["id"], YN | "">;

const STORAGE = "cw-booking-hold";
const WINDOW = 28;

function readStoredHold(): Hold | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE);
    if (!raw) return null;
    const h = JSON.parse(raw) as Hold;
    if (new Date(h.holdExpiresAt) > new Date()) return h;
    sessionStorage.removeItem(STORAGE);
  } catch {}
  return null;
}

/** Client-only (see flow-client.tsx), so initial state can come straight from sessionStorage. */
export function BookingFlow(props: Props) {
  const { services } = props;
  // Resume a hold after a refresh / cancelled payment.
  const [resumed] = useState(readStoredHold);
  const [step, setStep] = useState(resumed ? 2 : props.initialServiceId ? 1 : 0);
  const [serviceId, setServiceId] = useState(resumed?.serviceId ?? props.initialServiceId ?? "");
  const [showPicker, setShowPicker] = useState(!!props.showPicker && !props.initialServiceId && !resumed);
  const [hold, setHold] = useState<Hold | null>(resumed);
  const [error, setError] = useState<string | null>(null);
  const service = services.find((s) => s.id === serviceId);
  const topRef = useRef<HTMLDivElement>(null);

  const go = useCallback((n: number) => {
    setStep(n);
    setError(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const clearHold = useCallback(async () => {
    if (hold) await releaseSlot(hold.bookingId, hold.holdToken);
    setHold(null);
    try {
      sessionStorage.removeItem(STORAGE);
    } catch {}
  }, [hold]);

  const chooseService = (id: string) => {
    setServiceId(id);
    setShowPicker(false);
    go(1);
  };

  return (
    <div ref={topRef} className="scroll-mt-24">
      <Stepper steps={props.steps} current={step} onBack={step > 0 && step < 3 ? () => (step === 2 ? (clearHold(), go(1)) : go(step - 1)) : undefined} />
      {hold && step >= 2 && <HoldTimer expiresAt={hold.holdExpiresAt} label={props.holdNotice} onExpire={() => { setHold(null); setError("Your reserved time expired. Please choose a time again."); go(1); }} />}
      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-danger/15 px-4 py-3 text-sm text-bone" role="alert">
          <Alert className="mt-0.5 size-4 shrink-0 text-danger" /> {error}
        </p>
      )}

      <div className="mt-6">
        {step === 0 && (
          <div className="space-y-6">
            <button type="button" onClick={() => setShowPicker((v) => !v)} className="btn-ghost w-full sm:w-auto" aria-expanded={showPicker}>
              Not sure which session? {showPicker ? "Hide" : "Help me choose"}
            </button>
            {showPicker && (
              <SessionPicker
                config={props.picker}
                services={services.map((s) => ({ id: s.id, shortName: s.shortName, slug: s.slug, price: s.price, durationMin: s.durationMin }))}
                onChoose={chooseService}
              />
            )}
            {Object.entries(props.categories).map(([cat, c]) => {
              const items = services.filter((s) => s.category === cat);
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <h2 className="eyebrow text-bone/65">{c.label}</h2>
                  <ul className="mt-3 grid gap-2">
                    {items.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => chooseService(s.id)}
                          className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.08] bg-coal px-5 py-4 text-left transition hover:border-primary/60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 font-medium">
                              {s.shortName}
                              {s.featured && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary">Popular</span>}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-sm text-bone/65">
                              <Clock className="size-3.5" /> {s.durationMin} min
                            </span>
                          </span>
                          <span className="font-display text-lg font-semibold tabular-nums">{s.price}</span>
                          <ArrowRight className="size-4 text-bone/65 transition group-hover:translate-x-0.5 group-hover:text-primary-light" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {step === 1 && service && (
          <TimeStep
            service={service}
            onChangeService={() => go(0)}
            onHeld={(h) => {
              setHold(h);
              try {
                sessionStorage.setItem(STORAGE, JSON.stringify(h));
              } catch {}
              go(2);
            }}
            onError={setError}
          />
        )}

        {step === 2 && service && hold && (
          <DetailsStep service={service} hold={hold} policy={props.policy} redFlagNotice={props.redFlagNotice} onError={setError} features={props.features} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ stepper */

function Stepper({ steps, current, onBack }: { steps: string[]; current: number; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="grid size-10 shrink-0 place-items-center rounded-full border border-white/15 hover:bg-white/5" aria-label="Back">
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <span className="size-10 shrink-0" />
      )}
      <ol className="flex flex-1 items-center gap-2" aria-label="Booking progress">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col gap-1.5" aria-current={i === current ? "step" : undefined}>
            <span className={`h-1 rounded-full ${i <= current ? "bg-primary" : "bg-white/10"}`} />
            <span className={`hidden text-xs sm:block ${i === current ? "text-bone" : "text-bone/65"}`}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HoldTimer({ expiresAt, label, onExpire }: { expiresAt: string; label: string; onExpire: () => void }) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  const fired = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      const l = new Date(expiresAt).getTime() - Date.now();
      setLeft(l);
      if (l <= 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  const m = Math.max(0, Math.floor(left / 60000));
  const s = Math.max(0, Math.floor((left % 60000) / 1000));
  return (
    <p className="mt-4 flex items-center gap-2 rounded-lg bg-primary/12 px-4 py-2.5 text-sm text-bone/85">
      <Lock className="size-4 text-primary-light" /> {label}:{" "}
      <span className="font-semibold tabular-nums" aria-live="off">
        {m}:{String(s).padStart(2, "0")}
      </span>
    </p>
  );
}

/* --------------------------------------------------------------------- time */

function TimeStep({ service, onChangeService, onHeld, onError }: { service: FlowService; onChangeService: () => void; onHeld: (h: Hold) => void; onError: (e: string | null) => void }) {
  const [from, setFrom] = useState(todayIso());
  // Keyed by what was requested, so a new request shows the skeleton without resetting state in an effect.
  const [loaded, setLoaded] = useState<{ key: string; days: Day[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [holding, setHolding] = useState<string | null>(null);
  const key = `${service.id}:${from}`;
  const days = loaded?.key === key ? loaded.days : null;
  const setDays = (d: Day[]) => setLoaded({ key, days: d });

  useEffect(() => {
    let live = true;
    fetchSlots(service.id, from, WINDOW).then((r) => {
      if (!live) return;
      if (!r.ok) return onError(r.error);
      setLoaded({ key: `${service.id}:${from}`, days: r.data });
      setSelected((cur) => cur ?? r.data.find((d) => d.slots.length)?.dateIso ?? null);
    });
    return () => {
      live = false;
    };
  }, [service.id, from, onError]);

  const day = days?.find((d) => d.dateIso === selected);
  const firstAvailable = days?.find((d) => d.slots.length);
  const groups = useMemo(() => {
    const g: Record<string, string[]> = { Morning: [], Afternoon: [], Evening: [] };
    for (const s of day?.slots ?? []) {
      const h = Number(fmtTime(s).slice(0, 2));
      (h < 12 ? g.Morning : h < 17 ? g.Afternoon : g.Evening).push(s);
    }
    return g;
  }, [day]);

  const pick = (iso: string) =>
    start(async () => {
      setHolding(iso);
      onError(null);
      const r = await holdSlot(service.id, iso);
      setHolding(null);
      if (!r.ok) {
        onError(r.error);
        const again = await fetchSlots(service.id, from, WINDOW);
        if (again.ok) setDays(again.data);
        return;
      }
      onHeld({ ...r.data, serviceId: service.id, startsAt: iso });
    });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-coal px-5 py-4">
        <div>
          <p className="font-medium">{service.shortName}</p>
          <p className="text-sm text-bone/65">
            {service.price} · {service.durationMin} min
          </p>
        </div>
        <button type="button" onClick={onChangeService} className="text-sm text-primary-light underline underline-offset-4">
          Change
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold tracking-tight">Choose a day</h2>
          <div className="flex gap-1">
            <button type="button" className="grid size-10 place-items-center rounded-full border border-white/15 disabled:opacity-30" disabled={from <= todayIso()} onClick={() => setFrom(addDays(from, -WINDOW))} aria-label="Earlier dates">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className="grid size-10 place-items-center rounded-full border border-white/15" onClick={() => setFrom(addDays(from, WINDOW))} aria-label="Later dates">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        {!days ? (
          <div className="mt-4 h-20 animate-pulse rounded-xl bg-white/5" />
        ) : (
          <>
            <div className="-mx-4 mt-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [&::-webkit-scrollbar]:hidden" role="listbox" aria-label="Available days">
              {days.map((d) => {
                const avail = d.slots.length > 0;
                const sel = d.dateIso === selected;
                return (
                  <button
                    key={d.dateIso}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    disabled={!avail}
                    onClick={() => setSelected(d.dateIso)}
                    className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-xl border py-3 transition ${
                      sel ? "border-primary bg-primary text-on-primary" : avail ? "border-white/12 bg-coal hover:border-primary/60" : "border-transparent bg-transparent text-bone/25"
                    }`}
                    aria-label={`${fmtDay(d.dateIso)} ${fmtDate(d.dateIso)} ${fmtMonth(d.dateIso)}${avail ? `, ${d.slots.length} times` : ", unavailable"}`}
                  >
                    <span className="text-xs">{fmtDay(d.dateIso)}</span>
                    <span className="font-display text-xl font-semibold">{fmtDate(d.dateIso)}</span>
                    <span className="text-[10px] uppercase">{fmtMonth(d.dateIso)}</span>
                  </button>
                );
              })}
            </div>
            {!firstAvailable && (
              <p className="mt-3 text-sm text-bone/60">
                No times in these dates. Try later dates, or{" "}
                <Link href="/contact" className="text-bone underline">get in touch</Link> and we&apos;ll find a time.
              </p>
            )}
          </>
        )}
      </div>

      {day && (
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">{fmtLong(day.slots[0] ?? `${day.dateIso}T12:00:00Z`)}</h2>
          <div className="mt-4 space-y-5">
            {Object.entries(groups).map(([label, slots]) =>
              slots.length ? (
                <div key={label}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-bone/65">{label}</p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {slots.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={pending}
                        onClick={() => pick(s)}
                        className="min-h-12 rounded-lg border border-white/12 bg-coal text-[15px] font-medium tabular-nums transition hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                      >
                        {holding === s ? "…" : fmtTime(s)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
          <p className="mt-4 text-xs text-bone/65">Times shown in UK time.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ details */

type Form = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  sport: string;
  trainingLevel: string;
  goals: string;
  complaint: string;
  history: string;
  medications: string;
  referralSource: string;
  anythingChanged: string;
  clientNotes: string;
};

const emptyForm: Form = {
  firstName: "", lastName: "", email: "", phone: "", dob: "",
  emergencyName: "", emergencyPhone: "", emergencyRelationship: "",
  sport: "", trainingLevel: "", goals: "", complaint: "", history: "", medications: "", referralSource: "",
  anythingChanged: "", clientNotes: "",
};

function DetailsStep({
  service,
  hold,
  policy,
  redFlagNotice,
  onError,
  features,
}: {
  service: FlowService;
  hold: Hold;
  policy: string;
  redFlagNotice: string;
  onError: (e: string | null) => void;
  features?: { insuranceBookings: boolean; packages: boolean };
}) {
  const [insurer, setInsurer] = useState({ on: false, name: "", authorisation: "" });
  const [mode, setMode] = useState<"new" | "returning">("new");
  const [verified, setVerified] = useState<string | null>(null);
  const [f, setF] = useState<Form>(emptyForm);
  const [redFlags, setRedFlags] = useState(allNo(redFlagQuestions));
  const [cupping, setCupping] = useState(allNo(dryCuppingContraindications));
  const [compression, setCompression] = useState(allNo(compressionContraindications));
  const [consent, setConsent] = useState({ treatment: false, dryCupping: false, compression: false, guardian: false, marketing: false, policy: false });
  const [guardian, setGuardian] = useState({ name: "", relationship: "" });
  const [codes, setCodes] = useState({ discount: "", voucher: "" });
  const [quoteState, setQuote] = useState<null | { display: Record<string, string | null>; errors: { discount?: string; voucher?: string }; checkout: string; model: string }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const minor = ageOn(f.dob, new Date(hold.startsAt)) < 18;
  const anyRed = Object.values(redFlags).includes("yes");
  const needsCupping = service.requiredConsents.includes("dry_cupping");
  const needsCompression = service.requiredConsents.includes("compression_boots");
  const cuppingBlocked = needsCupping && Object.values(cupping).includes("yes");
  const compressionBlocked = needsCompression && Object.values(compression).includes("yes");
  const fullIntake = mode === "new" || !verified;

  const refreshQuote = useCallback(async (discount: string, voucher: string) => {
    const r = await previewQuote(service.id, discount, voucher);
    if (r.ok) setQuote(r.data as never);
  }, [service.id]);
  useEffect(() => {
    let live = true;
    previewQuote(service.id, "", "").then((r) => {
      if (live && r.ok) setQuote(r.data as never);
    });
    return () => {
      live = false;
    };
  }, [service.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    onError(null);
    const unanswered = (o: Record<string, string>) => Object.values(o).some((v) => v === "");
    if (unanswered(redFlags)) return setFieldError("Please answer all the health screening questions.");
    if (needsCupping && unanswered(cupping)) return setFieldError("Please answer the dry cupping safety questions.");
    if (needsCompression && unanswered(compression)) return setFieldError("Please answer the compression safety questions.");
    if (cuppingBlocked || compressionBlocked) return setFieldError("Based on your answers this session may not be suitable. Please get in touch before booking.");
    setSubmitting(true);
    const details = { firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, dob: f.dob };
    const r = await checkout({
      bookingId: hold.bookingId,
      holdToken: hold.holdToken,
      details,
      intake: fullIntake
        ? {
            emergencyName: f.emergencyName,
            emergencyPhone: f.emergencyPhone,
            emergencyRelationship: f.emergencyRelationship,
            sport: f.sport,
            trainingLevel: (f.trainingLevel || undefined) as never,
            goals: f.goals,
            complaint: f.complaint,
            history: f.history,
            medications: f.medications,
            redFlags: redFlags as never,
            referralSource: (f.referralSource || undefined) as never,
          }
        : undefined,
      returning: fullIntake ? undefined : { anythingChanged: f.anythingChanged, redFlags: redFlags as never },
      consent: {
        treatment: consent.treatment as true,
        dryCupping: needsCupping ? (cupping as never) : undefined,
        dryCuppingConsent: needsCupping ? consent.dryCupping : undefined,
        compression: needsCompression ? (compression as never) : undefined,
        compressionConsent: needsCompression ? consent.compression : undefined,
        guardianName: minor ? guardian.name : undefined,
        guardianRelationship: minor ? guardian.relationship : undefined,
        guardianConsent: minor ? consent.guardian : undefined,
        marketingOptIn: consent.marketing,
        policyAccepted: consent.policy as true,
      },
      clientNotes: f.clientNotes,
      discountCode: codes.discount || undefined,
      voucherCode: codes.voucher || undefined,
      verifiedToken: verified ?? undefined,
      insurer: insurer.on ? { name: insurer.name, authorisation: insurer.authorisation } : undefined,
    });
    if (!r.ok) {
      setSubmitting(false);
      onError(r.error);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    try {
      sessionStorage.removeItem(STORAGE);
    } catch {}
    window.location.href = r.data.url;
  };

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start" noValidate>
      <div className="space-y-6">
        <Panel title="Have you been before?">
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {(["new", "returning"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={`min-h-12 rounded-lg border px-3 text-sm font-medium transition ${mode === m ? "border-primary bg-primary/10 text-ink" : "border-ink/15 text-ink/70"}`}>
                {m === "new" ? "First visit" : "I've been before"}
              </button>
            ))}
          </div>
          {mode === "returning" && !verified && (
            <ReturningLookup
              onVerified={(token, prefill) => {
                setVerified(token);
                setF((p) => ({
                  ...p,
                  ...prefill.details,
                  ...Object.fromEntries(Object.entries(prefill.intake ?? {}).filter(([, v]) => typeof v === "string")),
                }));
              }}
            />
          )}
          {mode === "returning" && verified && (
            <p className="mt-3 flex items-center gap-2 text-sm text-success">
              <Check className="size-4" /> Welcome back! We&apos;ve filled in your details. Please check they&apos;re still right.
            </p>
          )}
        </Panel>

        <Panel title="Your details">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="First name" value={f.firstName} onChange={set("firstName")} autoComplete="given-name" required />
            <TextField label="Last name" value={f.lastName} onChange={set("lastName")} autoComplete="family-name" required />
            <TextField label="Email" type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
            <TextField label="Mobile" type="tel" value={f.phone} onChange={set("phone")} autoComplete="tel" required hint="For reminders" />
            <TextField label="Date of birth" type="date" value={f.dob} onChange={set("dob")} autoComplete="bday" required max={todayIso()} />
          </div>
        </Panel>

        {fullIntake ? (
          <>
            <Panel title="Emergency contact">
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField label="Name" value={f.emergencyName} onChange={set("emergencyName")} required />
                <TextField label="Phone" type="tel" value={f.emergencyPhone} onChange={set("emergencyPhone")} required />
                <TextField label="Relationship" value={f.emergencyRelationship} onChange={set("emergencyRelationship")} />
              </div>
            </Panel>
            <Panel title="About you" subtitle="Helps me prepare for your session.">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Sport or activity" value={f.sport} onChange={set("sport")} placeholder="e.g. running, football, gym" />
                <SelectField label="Training level" value={f.trainingLevel} onChange={set("trainingLevel")} options={trainingLevels} />
                <AreaField label="Goals" value={f.goals} onChange={set("goals")} placeholder="e.g. run a pain-free half marathon" className="sm:col-span-2" />
                <AreaField label="What's the main injury or complaint?" value={f.complaint} onChange={set("complaint")} placeholder="Where, how long, what makes it better or worse" className="sm:col-span-2" />
                <AreaField label="Relevant medical history" value={f.history} onChange={set("history")} placeholder="Previous injuries, surgery, conditions" />
                <AreaField label="Current medications" value={f.medications} onChange={set("medications")} />
                <SelectField label="How did you hear about us?" value={f.referralSource} onChange={set("referralSource")} options={referralSources} />
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="Anything changed since your last visit?">
            <AreaField label="New injuries, medication or anything you'd like me to know" value={f.anythingChanged} onChange={set("anythingChanged")} />
          </Panel>
        )}

        <Panel title="Health screening" subtitle="Do any of these apply to you right now?">
          <YesNoList questions={redFlagQuestions} value={redFlags} onChange={setRedFlags} />
          {anyRed && (
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning/15 p-4 text-sm text-ink" role="status">
              <Alert className="mt-0.5 size-4 shrink-0 text-warning" /> {redFlagNotice}
            </p>
          )}
        </Panel>

        {needsCupping && (
          <Panel title="Dry cupping safety check">
            <YesNoList questions={dryCuppingContraindications} value={cupping} onChange={setCupping} />
            {cuppingBlocked ? (
              <Blocked />
            ) : (
              <CheckField checked={consent.dryCupping} onChange={(v) => setConsent((c) => ({ ...c, dryCupping: v }))}>
                I understand dry cupping can leave temporary circular marks and consent to treatment.
              </CheckField>
            )}
          </Panel>
        )}

        {needsCompression && (
          <Panel title="Compression boots safety check">
            <YesNoList questions={compressionContraindications} value={compression} onChange={setCompression} />
            {compressionBlocked ? (
              <Blocked />
            ) : (
              <CheckField checked={consent.compression} onChange={(v) => setConsent((c) => ({ ...c, compression: v }))}>
                I confirm none of the above apply and consent to compression therapy.
              </CheckField>
            )}
          </Panel>
        )}

        {minor && (
          <Panel title="Parent or guardian consent" subtitle="The client is under 18, so a parent or guardian needs to consent and attend.">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Parent/guardian name" value={guardian.name} onChange={(e) => setGuardian((g) => ({ ...g, name: e.target.value }))} required />
              <TextField label="Relationship" value={guardian.relationship} onChange={(e) => setGuardian((g) => ({ ...g, relationship: e.target.value }))} required />
            </div>
            <CheckField checked={consent.guardian} onChange={(v) => setConsent((c) => ({ ...c, guardian: v }))}>
              I am the parent or legal guardian and I consent to assessment and treatment.
            </CheckField>
          </Panel>
        )}

        {features?.insuranceBookings && (
          <Panel title="Paying through private health insurance?">
            <CheckField checked={insurer.on} onChange={(v) => setInsurer((i) => ({ ...i, on: v }))}>
              Yes, my insurer is paying for this session (nothing to pay today).
            </CheckField>
            {insurer.on && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <TextField label="Insurer" value={insurer.name} onChange={(e) => setInsurer((i) => ({ ...i, name: e.target.value }))} required />
                <TextField label="Authorisation number" value={insurer.authorisation} onChange={(e) => setInsurer((i) => ({ ...i, authorisation: e.target.value }))} required />
              </div>
            )}
          </Panel>
        )}

        <Panel title="Notes (optional)">
          <AreaField label="Anything else you'd like me to know before your session?" value={f.clientNotes} onChange={set("clientNotes")} />
        </Panel>
      </div>

      {/* Summary + consents + pay */}
      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="surface-light rounded-xl bg-bone p-5 text-ink">
          <p className="font-display text-lg font-semibold">{service.shortName}</p>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink/65">
            <Calendar className="size-4" /> {fmtLong(hold.startsAt)}, {fmtTime(hold.startsAt)}
          </p>
          <p className="flex items-center gap-2 text-sm text-ink/65">
            <Clock className="size-4" /> {service.durationMin} minutes
          </p>
          <CodeInputs
            codes={codes}
            setCodes={setCodes}
            errors={quoteState?.errors ?? {}}
            onApply={() => refreshQuote(codes.discount, codes.voucher)}
          />
          {quoteState && (
            <dl className="mt-4 space-y-1.5 border-t border-ink/10 pt-4 text-sm">
              <Row k="Price" v={quoteState.display.price} />
              {quoteState.display.discount && <Row k="Discount" v={quoteState.display.discount} />}
              {quoteState.display.voucher && <Row k="Gift voucher" v={quoteState.display.voucher} />}
              <div className="flex justify-between pt-2 font-display text-lg font-semibold">
                <dt>{quoteState.checkout === "setup" ? "Due today" : "Pay now"}</dt>
                <dd className="tabular-nums">{quoteState.display.chargeNow}</dd>
              </div>
              {quoteState.display.later && <p className="text-xs text-ink/65">{quoteState.display.later} payable later.</p>}
              {quoteState.display.voucherLeft && <p className="text-xs text-ink/65">{quoteState.display.voucherLeft} will remain on your voucher.</p>}
              {quoteState.checkout === "setup" && <p className="text-xs text-ink/65">Your card is saved securely and only charged under the cancellation policy.</p>}
            </dl>
          )}
        </div>
        <div className="surface-light space-y-3 rounded-xl bg-bone p-5 text-sm text-ink">
          <CheckField checked={consent.treatment} onChange={(v) => setConsent((c) => ({ ...c, treatment: v }))}>
            I consent to assessment and treatment, and confirm my answers are accurate.
          </CheckField>
          <CheckField checked={consent.policy} onChange={(v) => setConsent((c) => ({ ...c, policy: v }))}>
            I accept the cancellation policy: {policy}{" "}
            <Link href="/terms" target="_blank" className="text-primary-strong underline">
              Terms
            </Link>
          </CheckField>
          <CheckField checked={consent.marketing} onChange={(v) => setConsent((c) => ({ ...c, marketing: v }))}>
            Send me occasional tips and offers by email (optional, unsubscribe any time).
          </CheckField>
          <p className="text-xs text-ink/65">
            Your health information is encrypted and only seen by your practitioner. <Link href="/privacy" target="_blank" className="underline">Privacy</Link>
          </p>
        </div>
        {fieldError && (
          <p className="rounded-lg bg-danger/15 px-4 py-3 text-sm" role="alert">
            {fieldError}
          </p>
        )}
        <button type="submit" className="btn-primary w-full" disabled={submitting || !consent.treatment || !consent.policy}>
          {submitting ? "One moment…" : quoteState?.checkout === "none" ? "Confirm booking" : "Continue to secure payment"} {!submitting && <Lock className="size-4" />}
        </button>
        <p className="text-center text-xs text-bone/65">Card, Apple Pay or Google Pay · Secured by Stripe</p>
      </aside>
    </form>
  );
}

/* ----------------------------------------------------------------- helpers */

function ReturningLookup({ onVerified }: { onVerified: (token: string, prefill: { details: Record<string, string>; intake: Record<string, unknown> | null }) => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-ink/65">We&apos;ll email you a 6-digit code so we can securely fill in your details.</p>
      <div className="flex gap-2">
        <input className="field" type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" autoComplete="email" />
        <button
          type="button"
          className="btn-dark shrink-0"
          disabled={busy || !email}
          onClick={async () => {
            setBusy(true);
            const r = await requestCode(email);
            setBusy(false);
            setSent(true);
            setMsg(r.ok ? "If we have your details on file, a code is on its way." : r.error);
          }}
        >
          {sent ? "Resend" : "Send code"}
        </button>
      </div>
      {sent && (
        <div className="flex gap-2">
          <input className="field tracking-[0.3em]" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="6-digit code" autoComplete="one-time-code" />
          <button
            type="button"
            className="btn-primary shrink-0"
            disabled={busy || code.length !== 6}
            onClick={async () => {
              setBusy(true);
              const r = await verifyCode(email, code);
              setBusy(false);
              if (r.ok) onVerified(r.data.token, r.data.prefill as never);
              else setMsg(r.error);
            }}
          >
            Verify
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-ink/70" role="status">{msg}</p>}
      <p className="text-xs text-ink/65">Or just fill in the form below; we&apos;ll match you up.</p>
    </div>
  );
}

function CodeInputs({ codes, setCodes, errors, onApply }: { codes: { discount: string; voucher: string }; setCodes: (c: { discount: string; voucher: string }) => void; errors: { discount?: string; voucher?: string }; onApply: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="mt-3 text-sm text-primary-strong underline underline-offset-4" onClick={() => setOpen(true)}>
        Have a gift voucher, package or discount code?
      </button>
    );
  return (
    <div className="mt-4 space-y-2">
      <input className="field uppercase" placeholder="Gift voucher / package code" value={codes.voucher} onChange={(e) => setCodes({ ...codes, voucher: e.target.value })} aria-label="Gift voucher code" />
      {errors.voucher && <p className="text-xs text-danger">{errors.voucher}</p>}
      <input className="field uppercase" placeholder="Discount code" value={codes.discount} onChange={(e) => setCodes({ ...codes, discount: e.target.value })} aria-label="Discount code" />
      {errors.discount && <p className="text-xs text-danger">{errors.discount}</p>}
      <button type="button" className="btn-dark btn-sm w-full" onClick={onApply}>
        Apply
      </button>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <fieldset className="surface-light rounded-xl bg-bone p-5 text-ink sm:p-6">
      <legend className="sr-only">{title}</legend>
      <p className="font-display text-lg font-semibold tracking-tight" aria-hidden>
        {title}
      </p>
      {subtitle && <p className="mt-0.5 text-sm text-ink/60">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

function TextField({ label, hint, className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink/80">
        {label}
        {rest.required && <span className="text-danger" aria-hidden> *</span>}
        {hint && <span className="ml-1 font-normal text-ink/65">({hint})</span>}
      </label>
      <input id={id} className="field" aria-required={rest.required} {...rest} />
    </div>
  );
}

function AreaField({ label, className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink/80">
        {label}
      </label>
      <textarea id={id} className="field min-h-24" {...rest} />
    </div>
  );
}

function SelectField({ label, options, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly string[] }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink/80">
        {label}
      </label>
      <select id={id} className="field bg-white" {...rest}>
        <option value="">Choose…</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function YesNoList<T extends string>({
  questions,
  value,
  onChange,
}: {
  questions: readonly { id: T; label: string }[];
  value: Record<T, YN | "">;
  onChange: React.Dispatch<React.SetStateAction<Record<T, YN | "">>>;
}) {
  return (
    <ul className="divide-y divide-ink/10">
      {questions.map((q) => (
        <li key={q.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span id={`q-${q.id}`} className="text-[15px] text-ink/85">
            {q.label}
          </span>
          <div className="flex shrink-0 gap-1.5" role="radiogroup" aria-labelledby={`q-${q.id}`}>
            {(["no", "yes"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={value[q.id] === v}
                onClick={() => onChange((prev) => ({ ...prev, [q.id]: v }))}
                className={`min-h-11 min-w-16 rounded-lg border px-4 text-sm font-medium capitalize transition ${
                  value[q.id] === v ? (v === "yes" ? "border-warning bg-warning/15 text-ink" : "border-primary bg-primary/10 text-ink") : "border-ink/15 text-ink/60"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function CheckField({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink/80">
      <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-primary" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

function Blocked() {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning/15 p-4 text-sm" role="alert">
      <Alert className="mt-0.5 size-4 shrink-0 text-warning" />
      <span>
        Based on your answers this session may not be suitable. Please <Link href="/contact" className="underline">get in touch</Link> so I can advise before you book, or choose a different session.
      </span>
    </p>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex justify-between text-ink/70">
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
