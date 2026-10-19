"use client";

import { useActionState } from "react";
import { buyVoucher, submitContact, submitHomeVisit, type FormState } from "@/app/(site)/actions";
import { Check } from "@/components/icons";
import { Field, Honeypot, Input, Select, SubmitButton, Textarea, Turnstile } from "@/components/ui/form";

const initial: FormState = { ok: false };

function Success({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-success/10 p-5 text-ink" role="status">
      <Check className="mt-0.5 size-5 shrink-0 text-success" />
      <p>{text}</p>
    </div>
  );
}

function FormError({ state }: { state: FormState }) {
  if (!state.message || state.ok) return null;
  return (
    <p className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
      {state.message}
    </p>
  );
}

export function ContactForm({ success }: { success: string }) {
  const [state, action] = useActionState(submitContact, initial);
  if (state.ok) return <Success text={success} />;
  const e = state.errors ?? {};
  return (
    <form action={action} className="relative grid gap-4" noValidate>
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" error={e.name}>
          <Input name="name" autoComplete="name" required error={e.name} />
        </Field>
        <Field label="Phone (optional)" name="phone">
          <Input name="phone" type="tel" autoComplete="tel" />
        </Field>
      </div>
      <Field label="Email" name="email" error={e.email}>
        <Input name="email" type="email" autoComplete="email" required error={e.email} />
      </Field>
      <Field label="Message" name="message" error={e.message} hint="Please don't include detailed medical information here; we'll ask what we need when you book.">
        <Textarea name="message" required error={e.message} hasHint />
      </Field>
      <Turnstile />
      <FormError state={state} />
      <SubmitButton>Send message</SubmitButton>
    </form>
  );
}

export function HomeVisitForm({ services, defaultService, success }: { services: { id: string; name: string }[]; defaultService?: string; success: string }) {
  const [state, action] = useActionState(submitHomeVisit, initial);
  if (state.ok) return <Success text={success} />;
  const e = state.errors ?? {};
  return (
    <form action={action} className="relative grid gap-4" noValidate>
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="name" error={e.name}>
          <Input name="name" autoComplete="name" required error={e.name} />
        </Field>
        <Field label="Phone" name="phone" error={e.phone}>
          <Input name="phone" type="tel" autoComplete="tel" required error={e.phone} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" name="email" error={e.email}>
          <Input name="email" type="email" autoComplete="email" required error={e.email} />
        </Field>
        <Field label="Postcode" name="postcode" error={e.postcode}>
          <Input name="postcode" autoComplete="postal-code" required error={e.postcode} className="field uppercase" />
        </Field>
      </div>
      <Field label="Service" name="serviceId" error={e.serviceId}>
        <Select name="serviceId" defaultValue={defaultService ?? ""} required error={e.serviceId}>
          <option value="" disabled>
            Choose a service
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Preferred days and times" name="preferredTimes" error={e.preferredTimes} hint="e.g. weekday evenings, Saturday mornings">
        <Input name="preferredTimes" required error={e.preferredTimes} hasHint />
      </Field>
      <Field label="Anything else? (optional)" name="message">
        <Textarea name="message" />
      </Field>
      <Turnstile />
      <FormError state={state} />
      <SubmitButton>Request a quote</SubmitButton>
    </form>
  );
}

export function VoucherForm({ products, defaultProduct }: { products: { id: string; label: string }[]; defaultProduct?: string }) {
  const [state, action] = useActionState(buyVoucher, initial);
  const e = state.errors ?? {};
  return (
    <form action={action} className="relative grid gap-4" noValidate>
      <Honeypot />
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink/80">Choose a voucher</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {products.map((p, i) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-ink/15 bg-white px-4 py-3 has-[:checked]:border-primary has-[:checked]:ring-2 has-[:checked]:ring-primary/25">
              <input type="radio" name="productId" value={p.id} defaultChecked={defaultProduct ? p.id === defaultProduct : i === 1} className="accent-primary" />
              <span className="text-sm font-medium text-ink">{p.label}</span>
            </label>
          ))}
        </div>
        {e.productId && <p className="mt-1 text-sm text-danger">{e.productId}</p>}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="purchaserName" error={e.purchaserName}>
          <Input name="purchaserName" autoComplete="name" required error={e.purchaserName} />
        </Field>
        <Field label="Your email" name="purchaserEmail" error={e.purchaserEmail} hint="We'll send the voucher here">
          <Input name="purchaserEmail" type="email" autoComplete="email" required error={e.purchaserEmail} hasHint />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Recipient's name" name="recipientName" error={e.recipientName}>
          <Input name="recipientName" required error={e.recipientName} />
        </Field>
        <Field label="Recipient's email (optional)" name="recipientEmail" error={e.recipientEmail} hint="We'll email them a copy too">
          <Input name="recipientEmail" type="email" error={e.recipientEmail} hasHint />
        </Field>
      </div>
      <Field label="Personal message (optional)" name="message">
        <Textarea name="message" maxLength={300} />
      </Field>
      <Turnstile />
      <FormError state={state} />
      <SubmitButton pendingText="Taking you to payment…">Continue to secure payment</SubmitButton>
    </form>
  );
}
