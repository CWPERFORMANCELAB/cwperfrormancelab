"use client";

import { useState } from "react";
import { savePackageAction } from "@/app/admin/(dash)/actions";
import { useAction } from "./client";

export function PackageForm({ services }: { services: { id: string; name: string }[] }) {
  const { pending, run, msg } = useAction();
  const [f, setF] = useState({ id: "massage-5", name: "5 × Sports Massage", serviceId: services[0]?.id ?? "", credits: "5", pounds: "270", validityDays: "365" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const field = (label: string, k: keyof typeof f, type = "text") => (
    <label className="block"><span className="mb-1 block text-xs font-medium text-ink/60">{label}</span><input type={type} className="field" value={f[k]} onChange={set(k)} /></label>
  );
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => (e.preventDefault(), run(() => savePackageAction({ ...f, credits: Number(f.credits), pounds: Number(f.pounds), validityDays: Number(f.validityDays) })))}>
      {field("ID (stable)", "id")}
      {field("Name", "name")}
      <label className="block"><span className="mb-1 block text-xs font-medium text-ink/60">Service</span>
        <select className="field" value={f.serviceId} onChange={set("serviceId")}>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </label>
      {field("Sessions", "credits", "number")}
      {field("Price (£)", "pounds", "number")}
      {field("Valid for (days)", "validityDays", "number")}
      <button className="btn-dark btn-sm sm:w-fit" disabled={pending}>Save package</button>
      <div className="sm:col-span-3">{msg}</div>
    </form>
  );
}
