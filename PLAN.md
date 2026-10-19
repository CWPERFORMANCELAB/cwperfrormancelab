# PLAN — CW Performance Lab

Website, booking, payments and admin dashboard for Christopher Williams (Sport Rehabilitator, Manchester),
replacing Calendly.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router, TypeScript strict, Turbopack) | Server actions for mutations, route handlers for webhooks/cron. |
| Styling | Tailwind v4 reading CSS variables from `config/theme.css` | No hex codes outside that file. |
| Database | Postgres via Drizzle ORM | **Production:** Supabase Postgres (London region) via `DATABASE_URL`. **Local & tests:** PGlite (embedded Postgres, same SQL, same migrations) — see deviation 1. |
| Auth (admin) | Self-hosted: password (bcrypt) + TOTP 2FA, signed httpOnly session cookie | See deviation 2. Isolated in `src/lib/auth/` so it can be swapped for Supabase Auth. |
| Payments | Stripe Checkout (cards, Apple Pay, Google Pay) + Stripe webhooks | `PAYMENTS_PROVIDER=mock` is used automatically when no Stripe key is set: a local mock checkout page drives the same success/failure handlers. |
| Email / SMS | Resend / Twilio | Both fall back to console logging when keys are absent. |
| Calendar | Google Calendar REST API (OAuth from dashboard) | Optional; the system works without it. |
| Content | MDX (`content/about.mdx`, `content/services/*.mdx`, policies) + JSON (FAQ, testimonials) | Pages never contain hardcoded copy. |
| Tests | Vitest | Pure-function tests for the availability engine, DB tests on PGlite in-memory. |
| Hosting | Vercel (cron for reminders/automations) | `vercel.json` defines the cron schedule. |

### Deviations from the brief (and why)

1. **PGlite locally instead of local Supabase.** This machine has no Docker, no Supabase CLI and no Postgres, so
   `supabase start` is impossible. PGlite is real Postgres compiled to WASM: the same Drizzle schema, the same SQL
   migrations (including `btree_gist` and the exclusion constraint that prevents double booking) run unchanged on
   PGlite and on Supabase. Set `DATABASE_URL` to the Supabase connection string and the app uses it; leave it unset
   and the app uses a persistent PGlite database in `.data/`. Tests use an in-memory PGlite. RLS policies are still
   created in the migrations so the Supabase anon key can never read a table directly.
2. **Self-hosted admin auth instead of Supabase Auth.** Supabase Auth (and its MFA) needs a running Supabase
   instance, which we don't have locally, and the admin is a single user. The implementation is small and isolated
   (`src/lib/auth/`): bcrypt password, TOTP via `otpauth`, 2FA enrolment forced on first login, sessions in the DB,
   cookie-based. Swapping to Supabase Auth later only touches that folder and `proxy.ts`.
3. **Field-level encryption for health data** (intake, consents, notes) with AES-256-GCM using `DATA_ENCRYPTION_KEY`,
   on top of Supabase's disk encryption. Health data is special-category data; this makes a DB dump useless on its own.

## Single source of truth

| Kind of value | Lives in |
| --- | --- |
| Brand, practitioner, BASRaT, address, contact, socials, review link, SEO base | `config/business.ts` |
| Colours, fonts, radii | `config/theme.css` |
| Logo, OG image, favicons | `public/brand/` |
| About, FAQ, service copy, testimonials, policy text | `content/` |
| Services, working hours, caps, notice/window, policy, payment model, vouchers, flags, templates | Database `settings` + `services`, seeded from `config/seed-settings.ts`, editable in `/admin/settings` |

`npm run apply:client-details` re-applies `config/seed-settings.ts` by stable ID (upsert services, upsert settings,
archive removed services). `npm run check:placeholders` fails if any placeholder remains.

## Data model (Postgres)

- `practitioners` — one row now; bookings reference it so a second practitioner can be added.
- `services` — stable text IDs (`sports-massage`), price/duration/buffer, `payment_model`, `runs_concurrently`,
  `required_consents`, `tax_rate_bp`, `active`, `archived_at`.
- `settings` — key/value JSONB with `placeholder` flag (working hours, caps, notice, policy, voucher products, flags…).
- `clients` — contact, DOB, emergency contact, sport, referral source, marketing consent, tags, admin notes, `is_demo`.
- `intake_forms` — encrypted JSON (history, medications, red flags), consents, guardian consent, linked to client + booking.
- `bookings` — `starts_at`/`ends_at`/`buffer_min`, status (`pending_payment` → `confirmed` → `attended` | `no_show` |
  `late_cancelled` | `cancelled`), `hold_expires_at`, `manage_token_hash`, `location_type`, insurer fields (flagged),
  `google_event_id`. **Exclusion constraint** on `(practitioner_id, tstzrange(starts_at, ends_at + buffer))` for
  active statuses — the DB-level guarantee against double booking.
- `blocked_times` — manual time off + Google Calendar busy events.
- `payments`, `refunds` — provider IDs, kind (`payment`|`deposit`|`fee`|`setup`), status.
- `vouchers`, `voucher_redemptions` — code, balance, expiry, source (`online`|`calendly_import`|`admin`).
- `discount_codes`, `payment_links`, `enquiries`, `notifications` (queue + log), `notification_templates`.
- `packages`, `package_purchases` (behind `packages` flag); insurer fields on bookings (behind `insuranceBookings`).
- `admin_users`, `admin_sessions`, `audit_log`, `webhook_events` (idempotency), `rate_limits`, `calendar_connections`.

## Folder structure

```
config/            business.ts · theme.css · seed-settings.ts
content/           about.mdx · faq.json · testimonials.json · services/*.mdx · policies/*.mdx
public/brand/      logo.svg · logo-mark.svg · og-image.png · favicons
src/app/           (public)  /, /services/[slug], /pricing, /about, /home-visits, /gift-vouchers,
                   /testimonials, /faq, /contact, /book, /manage/[token], /pay/mock/[id], /privacy, /terms, /cookies
                   (admin)   /admin/** · /admin/login
                   (api)     /api/webhooks/stripe · /api/cron/* · /api/calendar/google/*
src/db/            schema.ts · client.ts · migrations/ · seed.ts
src/lib/           availability/ · booking/ · payments/ · notifications/ · auth/ · calendar/ · crypto.ts · settings.ts
src/components/    public UI · admin UI
scripts/           apply-client-details.ts · check-placeholders.ts · seed-demo.ts · clear-demo-data.ts · import-vouchers.ts
tests/             availability · double-booking · vouchers · cancellation fees · webhooks · apply-client-details
```

## Phases

1. **Foundation** — config/theme/content structure, DB schema + migrations, PGlite/Postgres client, seed, settings
   loader, availability engine + tests, admin auth with 2FA.
2. **Booking** — flow (service → slot → details/intake/consent → payment → confirmation), slot holds, Stripe +
   mock provider, webhooks, confirmation email with .ics, self-service manage link.
3. **Admin** — overview, calendar/list bookings, manual booking + payment links, attendance/fees, refunds, time off,
   clients CRM, settings editor, placeholder banner.
4. **Marketing site** — all public pages from `content/`, session picker, SEO (metadata, sitemap, OG, schema).
5. **Growth** — vouchers (buy, email, redeem, import), home-visit enquiries, reminders & automations, Google Calendar,
   flagged extras (packages, insurer bookings).
6. **Finish** — insights, `check:placeholders`, `apply:client-details`, demo data + clear script, accessibility,
   performance, docs (README, CLIENT-GUIDE, UPDATING-CLIENT-DETAILS, MIGRATION, go-live checklist).
