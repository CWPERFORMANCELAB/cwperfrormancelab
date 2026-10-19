# Updating client details

When Christopher confirms a detail, change it in **exactly one place** below, then run the commands at the bottom.
Nothing in page code ever needs editing.

## Where each detail goes

| Detail | File → field |
| --- | --- |
| Trading / legal name | `config/business.ts` → `name`, `legalName` |
| BASRaT number (shows everywhere once set: footer, about, receipts, schema) | `config/business.ts` → `practitioner.basratNumber` |
| Qualifications | `config/business.ts` → `practitioner.qualifications` |
| Business phone / email / WhatsApp | `config/business.ts` → `contact.phone`, `contact.phoneE164`, `contact.email`, `contact.whatsapp` |
| Instagram / TikTok / Facebook | `config/business.ts` → `social.*` (empty = hidden) |
| Google review link (enables review-request emails) | `config/business.ts` → `googleReviewUrl` |
| Live domain | `config/business.ts` → `seo.siteUrl` **and** env `NEXT_PUBLIC_SITE_URL` |
| ICO registration number | `config/business.ts` → `legal.icoRegistration` |
| Brand colours | `config/theme.css` → `--brand-*` (keep contrast: see comments) |
| Fonts | `config/theme.css` → `--brand-font-*` + the `next/font` imports in `src/app/layout.tsx` |
| Logo / favicons | Replace `src/assets/brand/logo-full.png` + `logo-mark.png` and run `npm run brand:build`, **or** drop vector `logo.svg` / `logo-mark.svg` straight into `public/brand/` |
| Photos & videos | Put files in `public/media/` with the filename listed in `content/media.json`, set `"placeholder": false` |
| Working hours | `config/seed-settings.ts` → `workingHours` |
| Daily caps | `config/seed-settings.ts` → `dailyCaps` |
| Notice / booking window / slot interval / buffers | `config/seed-settings.ts` → `bookingRules` (+ `bufferMin` per service) |
| Cancellation & rescheduling policy | `config/seed-settings.ts` → `cancellationPolicy` (all wording updates automatically) |
| Payment model (full / deposit / card on file) & VAT | `config/seed-settings.ts` → `paymentDefaults` (or per service: `paymentModel`, `depositPercent`, `taxRateBp`) |
| Service prices / durations / buffers / names | `config/seed-settings.ts` → `seedServices[]` (keep the `id`!) |
| New service | Add to `seedServices` with a new `id` + `slug`; add `content/services/<id>.mdx` and a line in `content/services/index.ts`; optional photo slot in `content/media.json` |
| Remove a service | Delete it from `seedServices`; it's **archived**, not deleted, so past bookings keep working |
| Voucher prices / expiry | `config/seed-settings.ts` → `vouchers` |
| Feature flags (packages, insurer bookings, clinical notes, SMS) | `config/seed-settings.ts` → `features` |
| Reminder timing, follow-ups, rehab video link | `config/seed-settings.ts` → `notifications` |
| Data retention | `config/seed-settings.ts` → `compliance` + `config/business.ts` → `legal.retentionYears` |
| About story | `content/about.mdx` |
| FAQ answers | `content/faq.json` (set `"draft": false` once approved) |
| Testimonials | `content/testimonials.json` (real reviews with permission; remove `"placeholder": true`) |
| Service page copy & SEO | `content/services/<id>.mdx` → `meta` + body |
| Policies | `content/policies/*.mdx` (remove the `PLACEHOLDER: legal review` comment once reviewed) |
| Page copy, picker questions, trust signals | `content/site.json` |
| Intake / contraindication questions | `src/lib/booking/questions.ts` |

**Marking a value confirmed:** delete its `// PLACEHOLDER:` comment, or set `placeholder: false` in
`config/seed-settings.ts`. Dashboard edits mark DB values confirmed automatically, but copy confirmed values into
`config/seed-settings.ts` too, otherwise a later `apply:client-details` will reapply the old file values.

## Commands

```bash
npm run apply:client-details         # push config/seed-settings.ts into the database (safe: bookings untouched)
npm run check:placeholders -- --write  # see what's left + regenerate CLIENT_TODO.md
npm test                             # everything still passes
```

In production run `apply:client-details` with `DATABASE_URL` pointing at Supabase (or redeploy and run it once).

## Prompt template for the follow-up session

> Here are Christopher's confirmed details: … Update config/business.ts, config/theme.css, config/seed-settings.ts and
> content/ per UPDATING-CLIENT-DETAILS.md, mark each confirmed value as no longer a placeholder, run
> `npm run apply:client-details`, `npm run check:placeholders -- --write` and `npm run check`, and report anything
> still outstanding.
