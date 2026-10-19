"use client";

import { useMemo, useState } from "react";
import {
  addTimeOffAction,
  changePasswordAction,
  createManualBookingAction,
  createVoucherAction,
  importVouchersAction,
  quoteEnquiryAction,
  removeTimeOffAction,
  saveDiscountAction,
  saveServiceAction,
  saveSettingAction,
  saveTemplateAction,
  toggleDiscountAction,
  updateClientAction,
  eraseClientAction,
} from "@/app/admin/(dash)/actions";
import type { SettingKey } from "@/lib/settings-schema";
import { useAction } from "./client";

const L = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="mb-1 block text-xs font-medium text-ink/60">{label}</span>
    {children}
  </label>
);

/* --------------------------------------------------------------- bookings */

export function ManualBookingForm({ services, clients, today }: { services: { id: string; name: string; price: number }[]; clients: { id: string; label: string }[]; today: string }) {
  const { pending, run, msg } = useAction();
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [f, setF] = useState({
    clientId: "",
    newFirstName: "",
    newLastName: "",
    newEmail: "",
    newPhone: "",
    serviceId: services[0]?.id ?? "",
    date: today,
    time: "10:00",
    locationType: "clinic" as "clinic" | "home",
    price: String(services[0]?.price ?? 0),
    payment: "payment_link" as "in_clinic" | "payment_link" | "saved_card" | "already_paid",
    notes: "",
  });
  const [q, setQ] = useState("");
  const matches = useMemo(() => (q ? clients.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []), [q, clients]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => createManualBookingAction({ ...f, clientId: mode === "existing" ? f.clientId : "" }));
      }}
    >
      <div className="flex gap-2 text-sm">
        {(["existing", "new"] as const).map((m) => (
          <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-lg border px-3 py-1.5 ${mode === m ? "border-ink bg-ink text-white" : "border-ink/15"}`}>
            {m === "existing" ? "Existing client" : "New client"}
          </button>
        ))}
      </div>
      {mode === "existing" ? (
        <div>
          <L label="Find client">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or email" />
          </L>
          {matches.length > 0 && (
            <ul className="mt-1 divide-y divide-ink/10 rounded-lg border border-ink/10 bg-white">
              {matches.map((c) => (
                <li key={c.id}>
                  <button type="button" className={`w-full px-3 py-2 text-left text-sm hover:bg-ink/5 ${f.clientId === c.id ? "bg-primary/10" : ""}`} onClick={() => (setF((p) => ({ ...p, clientId: c.id })), setQ(c.label))}>
                    {c.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="First name"><input className="field" value={f.newFirstName} onChange={set("newFirstName")} required /></L>
          <L label="Last name"><input className="field" value={f.newLastName} onChange={set("newLastName")} required /></L>
          <L label="Email"><input className="field" type="email" value={f.newEmail} onChange={set("newEmail")} required /></L>
          <L label="Phone"><input className="field" type="tel" value={f.newPhone} onChange={set("newPhone")} /></L>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Service">
          <select
            className="field"
            value={f.serviceId}
            onChange={(e) => {
              const s = services.find((x) => x.id === e.target.value);
              setF((p) => ({ ...p, serviceId: e.target.value, price: String(s?.price ?? p.price) }));
            }}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </L>
        <L label="Location">
          <select className="field" value={f.locationType} onChange={set("locationType")}>
            <option value="clinic">Clinic</option>
            <option value="home">Home visit</option>
          </select>
        </L>
        <L label="Date"><input type="date" className="field" value={f.date} onChange={set("date")} required /></L>
        <L label="Time"><input type="time" step={300} className="field" value={f.time} onChange={set("time")} required /></L>
        <L label="Price (£)"><input type="number" min="0" step="0.01" className="field" value={f.price} onChange={set("price")} /></L>
        <L label="Payment">
          <select className="field" value={f.payment} onChange={set("payment")}>
            <option value="payment_link">Send payment link (holds slot 48h)</option>
            <option value="in_clinic">Pay in clinic (confirm now)</option>
            <option value="saved_card">Charge saved card</option>
            <option value="already_paid">Already paid (record it)</option>
          </select>
        </L>
      </div>
      <L label="Notes"><textarea className="field" value={f.notes} onChange={set("notes")} /></L>
      <button className="btn-primary" disabled={pending}>{pending ? "Creating…" : "Create booking"}</button>
      {msg}
    </form>
  );
}

export function TimeOffForm({ today }: { today: string }) {
  const { pending, run, msg } = useAction();
  const [f, setF] = useState({ startDate: today, startTime: "", endDate: today, endTime: "", reason: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className="grid gap-3 sm:grid-cols-5 sm:items-end" onSubmit={(e) => (e.preventDefault(), run(() => addTimeOffAction(f)))}>
      <L label="From date"><input type="date" className="field" value={f.startDate} onChange={set("startDate")} required /></L>
      <L label="From time (blank = all day)"><input type="time" className="field" value={f.startTime} onChange={set("startTime")} /></L>
      <L label="To date"><input type="date" className="field" value={f.endDate} onChange={set("endDate")} required /></L>
      <L label="To time (blank = end of day)"><input type="time" className="field" value={f.endTime} onChange={set("endTime")} /></L>
      <L label="Reason"><input className="field" value={f.reason} onChange={set("reason")} placeholder="Holiday" /></L>
      <button className="btn-dark btn-sm sm:col-span-5 sm:w-fit" disabled={pending}>Block out time</button>
      <div className="sm:col-span-5">{msg}</div>
    </form>
  );
}

export function RemoveTimeOff({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => run(() => removeTimeOffAction(id))}>
      Remove
    </button>
  );
}

/* ---------------------------------------------------------------- clients */

export function ClientEditor({ id, notes, tags, marketing, email }: { id: string; notes: string; tags: string; marketing: boolean; email: string }) {
  const { pending, run, msg } = useAction();
  const [n, setN] = useState(notes);
  const [t, setT] = useState(tags);
  const [m, setM] = useState(marketing);
  const [erase, setErase] = useState("");
  return (
    <div className="space-y-3">
      <L label="Private notes (encrypted)"><textarea className="field min-h-24" value={n} onChange={(e) => setN(e.target.value)} /></L>
      <L label="Tags (comma separated)"><input className="field" value={t} onChange={(e) => setT(e.target.value)} placeholder="runner, marathon-2027, vip" /></L>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={m} onChange={(e) => setM(e.target.checked)} className="accent-primary" /> Marketing consent
      </label>
      <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => updateClientAction(id, { notes: n, tags: t, marketingOptIn: m }))}>Save</button>
      {msg}
      <details className="rounded-lg border border-danger/25 p-3 text-sm">
        <summary className="cursor-pointer text-danger">Erase client (GDPR request)</summary>
        <p className="mt-2 text-ink/65">Deletes health records and anonymises personal details. Payment records are kept (legal requirement). This can&apos;t be undone.</p>
        <input className="field mt-2" placeholder={`Type ${email} to confirm`} value={erase} onChange={(e) => setErase(e.target.value)} />
        <button className="btn btn-sm mt-2 border border-danger/40 text-danger" disabled={pending} onClick={() => run(() => eraseClientAction(id, erase))}>Erase permanently</button>
      </details>
    </div>
  );
}

/* --------------------------------------------------------------- vouchers */

export function VoucherCreateForm() {
  const { pending, run, msg, result } = useAction();
  const [f, setF] = useState({ pounds: "60", minutes: "60", recipientName: "", recipientEmail: "", code: "", expiresOn: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => (e.preventDefault(), run(() => createVoucherAction({ ...f, pounds: Number(f.pounds), minutes: Number(f.minutes) || undefined })))}>
      <L label="Value (£)"><input type="number" step="0.01" className="field" value={f.pounds} onChange={set("pounds")} /></L>
      <L label="Minutes (optional)"><input type="number" className="field" value={f.minutes} onChange={set("minutes")} /></L>
      <L label="Expires (blank = 12 months)"><input type="date" className="field" value={f.expiresOn} onChange={set("expiresOn")} /></L>
      <L label="Recipient name"><input className="field" value={f.recipientName} onChange={set("recipientName")} /></L>
      <L label="Recipient email"><input type="email" className="field" value={f.recipientEmail} onChange={set("recipientEmail")} /></L>
      <L label="Custom code (optional)"><input className="field uppercase" value={f.code} onChange={set("code")} /></L>
      <button className="btn-dark btn-sm sm:w-fit" disabled={pending}>Create voucher</button>
      <div className="sm:col-span-3">{msg}{result?.ok && typeof result.data === "string" && <p className="font-mono text-lg">{result.data}</p>}</div>
    </form>
  );
}

export function VoucherImportForm() {
  const { pending, run, msg } = useAction();
  const [csv, setCsv] = useState("code,value_pounds,expires,recipient_name,recipient_email,minutes,balance_pounds\n");
  return (
    <div className="space-y-2">
      <textarea className="field min-h-32 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} aria-label="CSV" />
      <input
        type="file"
        accept=".csv,text/csv"
        className="text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) setCsv(await file.text());
        }}
      />
      <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => importVouchersAction(csv))}>Import vouchers</button>
      {msg}
    </div>
  );
}

/* -------------------------------------------------------------- enquiries */

export function QuoteForm({ enquiryId, services, defaultService }: { enquiryId: string; services: { id: string; name: string; price: number }[]; defaultService?: string | null }) {
  const { pending, run, msg, result } = useAction();
  const s0 = services.find((s) => s.id === defaultService) ?? services[0];
  const [f, setF] = useState({ serviceId: s0?.id ?? "", pounds: String((s0?.price ?? 0) + 15), date: "", time: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), run(() => quoteEnquiryAction(enquiryId, { ...f, pounds: Number(f.pounds) })))}>
      <L label="Service">
        <select className="field" value={f.serviceId} onChange={set("serviceId")}>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </L>
      <L label="Quote incl. travel (£)"><input type="number" step="0.01" className="field" value={f.pounds} onChange={set("pounds")} /></L>
      <L label="Date (optional, holds the slot)"><input type="date" className="field" value={f.date} onChange={set("date")} /></L>
      <L label="Time"><input type="time" step={300} className="field" value={f.time} onChange={set("time")} /></L>
      <button className="btn-primary sm:col-span-2" disabled={pending}>Send quote & payment link</button>
      <div className="sm:col-span-2">{msg}{result?.ok && typeof result.data === "string" && <p className="mt-1 break-all font-mono text-xs">{result.data}</p>}</div>
    </form>
  );
}

/* --------------------------------------------------------------- settings */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Generic editor for a settings object: typed inputs for flat fields, JSON for nested ones. */
export function SettingForm({ settingKey, value, labels = {} }: { settingKey: SettingKey; value: Record<string, Json>; labels?: Record<string, string> }) {
  const { pending, run, msg } = useAction();
  const [v, setV] = useState<Record<string, Json>>(value);
  const [raw, setRaw] = useState<Record<string, string>>({});
  const nice = (k: string) => labels[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
  const save = () => {
    const out: Record<string, Json> = { ...v };
    for (const [k, s] of Object.entries(raw)) {
      try {
        out[k] = JSON.parse(s);
      } catch {
        return run(async () => ({ ok: false, error: `${nice(k)} isn't valid JSON` }));
      }
    }
    run(() => saveSettingAction(settingKey, JSON.stringify(out)));
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(value).map(([k, init]) => {
          const cur = v[k];
          if (typeof init === "boolean")
            return (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cur as boolean} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.checked }))} className="accent-primary" /> {nice(k)}
              </label>
            );
          if (typeof init === "number" || (init === null && /days|hours|min/i.test(k)))
            return (
              <L key={k} label={`${nice(k)}${init === null || cur === null ? " (blank = no limit)" : ""}`}>
                <input type="number" className="field" value={cur === null ? "" : String(cur)} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value === "" && (init === null || k === "maxAdvanceDays") ? null : Number(e.target.value) }))} />
              </L>
            );
          if (typeof init === "string")
            return (
              <L key={k} label={nice(k)}>
                <input className="field" value={cur as string} onChange={(e) => setV((p) => ({ ...p, [k]: e.target.value }))} />
              </L>
            );
          return (
            <L key={k} label={`${nice(k)} (JSON)`} className="sm:col-span-2">
              <textarea className="field min-h-28 font-mono text-xs" defaultValue={JSON.stringify(init, null, 2)} onChange={(e) => setRaw((p) => ({ ...p, [k]: e.target.value }))} />
            </L>
          );
        })}
      </div>
      <button className="btn-dark btn-sm" disabled={pending} onClick={save}>Save</button>
      {msg}
    </div>
  );
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function WorkingHoursForm({ value, caps }: { value: Record<string, { open: string; close: string }[]>; caps: Record<string, number> }) {
  const { pending, run, msg } = useAction();
  const [h, setH] = useState(value);
  const [c, setC] = useState(caps);
  const order = ["1", "2", "3", "4", "5", "6", "0"];
  return (
    <div className="space-y-3">
      <div className="divide-y divide-ink/[0.06]">
        {order.map((d) => {
          const r = h[d]?.[0];
          return (
            <div key={d} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <label className="flex w-32 items-center gap-2">
                <input type="checkbox" checked={!!r} className="accent-primary" onChange={(e) => setH((p) => ({ ...p, [d]: e.target.checked ? [{ open: "09:00", close: "17:00" }] : [] }))} /> {DAY[Number(d)]}
              </label>
              {r ? (
                <>
                  <input type="time" value={r.open} onChange={(e) => setH((p) => ({ ...p, [d]: [{ ...r, open: e.target.value }] }))} className="field w-auto py-1.5" aria-label={`${DAY[Number(d)]} open`} />
                  <span>to</span>
                  <input type="time" value={r.close} onChange={(e) => setH((p) => ({ ...p, [d]: [{ ...r, close: e.target.value }] }))} className="field w-auto py-1.5" aria-label={`${DAY[Number(d)]} close`} />
                  <label className="ml-auto flex items-center gap-2 text-ink/60">
                    Max/day
                    <input type="number" min={0} value={c[d]} onChange={(e) => setC((p) => ({ ...p, [d]: Number(e.target.value) }))} className="field w-20 py-1.5" />
                  </label>
                </>
              ) : (
                <span className="text-ink/65">Closed</span>
              )}
            </div>
          );
        })}
      </div>
      <button
        className="btn-dark btn-sm"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const a = await saveSettingAction("workingHours", JSON.stringify(h));
            if (!a.ok) return a;
            const capsOut = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, h[k]?.length ? v : 0]));
            return saveSettingAction("dailyCaps", JSON.stringify(capsOut));
          })
        }
      >
        Save hours & caps
      </button>
      {msg}
    </div>
  );
}

export function ServiceForm({ s }: { s: { id: string; name: string; shortName: string; price: number; durationMin: number; bufferMin: number; active: boolean; featured: boolean; runsConcurrently: boolean; availableAtHome: boolean; paymentModel: string | null; depositPercent: number | null; taxRateBp: number | null } }) {
  const { pending, run, msg } = useAction();
  const [f, setF] = useState({ ...s, price: String(s.price), paymentModel: (s.paymentModel ?? "") as "" | "full" | "deposit" | "card_on_file", depositPercent: s.depositPercent ?? 50, taxRateBp: s.taxRateBp ?? 0 });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <L label="Name" className="sm:col-span-2"><input className="field" value={f.name} onChange={set("name")} /></L>
      <L label="Short name" className="sm:col-span-2"><input className="field" value={f.shortName} onChange={set("shortName")} /></L>
      <L label="Price (£)"><input type="number" step="0.01" className="field" value={f.price} onChange={set("price")} /></L>
      <L label="Duration (min)"><input type="number" className="field" value={f.durationMin} onChange={set("durationMin")} /></L>
      <L label="Buffer after (min)"><input type="number" className="field" value={f.bufferMin} onChange={set("bufferMin")} /></L>
      <L label="Payment">
        <select className="field" value={f.paymentModel} onChange={set("paymentModel")}>
          <option value="">Default</option>
          <option value="full">Pay in full</option>
          <option value="deposit">Deposit</option>
          <option value="card_on_file">Card on file</option>
        </select>
      </L>
      {f.paymentModel === "deposit" && <L label="Deposit %"><input type="number" className="field" value={f.depositPercent} onChange={set("depositPercent")} /></L>}
      <L label="VAT (basis points, 2000 = 20%)"><input type="number" className="field" value={f.taxRateBp} onChange={set("taxRateBp")} /></L>
      <div className="flex flex-wrap gap-4 text-sm sm:col-span-4">
        {(["active", "featured", "availableAtHome", "runsConcurrently"] as const).map((k) => (
          <label key={k} className="flex items-center gap-2">
            <input type="checkbox" checked={f[k]} onChange={set(k)} className="accent-primary" />
            {{ active: "Bookable online", featured: "Show as popular", availableAtHome: "Home visits", runsConcurrently: "Doesn't block time" }[k]}
          </label>
        ))}
      </div>
      <div className="sm:col-span-4">
        <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => saveServiceAction(s.id, { ...f, price: Number(f.price), paymentModel: f.paymentModel }))}>Save service</button>
        {msg}
      </div>
    </div>
  );
}

export function TemplateForm({ t }: { t: { key: string; name: string; subject: string | null; body: string; enabled: boolean; channel: string } }) {
  const { pending, run, msg } = useAction();
  const [f, setF] = useState({ subject: t.subject ?? "", body: t.body, enabled: t.enabled });
  return (
    <div className="space-y-2">
      {t.channel === "email" && <L label="Subject"><input className="field" value={f.subject} onChange={(e) => setF((p) => ({ ...p, subject: e.target.value }))} /></L>}
      <L label="Message"><textarea className="field min-h-40 font-mono text-xs" value={f.body} onChange={(e) => setF((p) => ({ ...p, body: e.target.value }))} /></L>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.enabled} onChange={(e) => setF((p) => ({ ...p, enabled: e.target.checked }))} className="accent-primary" /> Enabled</label>
      <button className="btn-dark btn-sm" disabled={pending} onClick={() => run(() => saveTemplateAction(t.key, f))}>Save</button>
      {msg}
    </div>
  );
}

export function DiscountForm() {
  const { pending, run, msg } = useAction();
  const [f, setF] = useState({ code: "", kind: "percent" as "percent" | "fixed", value: "10", maxUses: "", validTo: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <form className="grid gap-3 sm:grid-cols-5 sm:items-end" onSubmit={(e) => (e.preventDefault(), run(() => saveDiscountAction({ code: f.code, kind: f.kind, value: Number(f.value), maxUses: f.maxUses ? Number(f.maxUses) : null, validTo: f.validTo || undefined })))}>
      <L label="Code"><input className="field uppercase" value={f.code} onChange={set("code")} required /></L>
      <L label="Type"><select className="field" value={f.kind} onChange={set("kind")}><option value="percent">% off</option><option value="fixed">£ off</option></select></L>
      <L label={f.kind === "percent" ? "Percent" : "Pounds"}><input type="number" className="field" value={f.value} onChange={set("value")} /></L>
      <L label="Max uses"><input type="number" className="field" value={f.maxUses} onChange={set("maxUses")} /></L>
      <L label="Valid until"><input type="date" className="field" value={f.validTo} onChange={set("validTo")} /></L>
      <button className="btn-dark btn-sm sm:w-fit" disabled={pending}>Create code</button>
      <div className="sm:col-span-5">{msg}</div>
    </form>
  );
}

export function DiscountToggle({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <button className="text-xs underline" disabled={pending} onClick={() => run(() => toggleDiscountAction(id, !active))}>
      {active ? "Disable" : "Enable"}
    </button>
  );
}

export function PasswordForm() {
  const { pending, run, msg } = useAction();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  return (
    <form className="grid gap-3 sm:max-w-sm" onSubmit={(e) => (e.preventDefault(), run(() => changePasswordAction(cur, next)))}>
      <L label="Current password"><input type="password" autoComplete="current-password" className="field" value={cur} onChange={(e) => setCur(e.target.value)} /></L>
      <L label="New password (12+ characters)"><input type="password" autoComplete="new-password" className="field" value={next} onChange={(e) => setNext(e.target.value)} /></L>
      <button className="btn-dark btn-sm w-fit" disabled={pending}>Change password</button>
      {msg}
    </form>
  );
}
