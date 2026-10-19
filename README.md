# CW Performance Lab

Website, online booking, payments and admin dashboard for **Christopher Williams, Sport Rehabilitator**
(Made Running Hub, Manchester M8). Replaces Calendly.

- **Public site:** services, pricing, about, home visits, gift vouchers, testimonials, FAQ, contact, policies
- **Booking:** service → time → details & intake/consent → payment → confirmation, faster than Calendly
- **Payments:** Stripe Checkout (cards, Apple Pay, Google Pay), deposits / card-on-file, vouchers, discount codes,
  payment links, automatic policy refunds
- **Notifications:** email (Resend) + SMS (Twilio) confirmations, reminders and follow-ups
- **Dashboard:** revenue, bookings calendar, CRM, insights, settings, all behind password + 2FA

Docs: [PLAN.md](PLAN.md) · [DECISIONS.md](DECISIONS.md) · [CLIENT_TODO.md](CLIENT_TODO.md) ·
[UPDATING-CLIENT-DETAILS.md](UPDATING-CLIENT-DETAILS.md) · [CLIENT-GUIDE.md](CLIENT-GUIDE.md) ·
[MIGRATION.md](MIGRATION.md) · [GO-LIVE.md](GO-LIVE.md)

---

## Quick start (local)

Requires Node 20+. No Docker, database, Stripe or email accounts needed locally.

```bash
npm install
npm run dev                # http://localhost:3000
```

On first run the app creates an embedded Postgres database in `.data/pglite`, applies migrations and seeds services
and settings from `config/seed-settings.ts`.

- **Payments** use a built-in *mock checkout* until Stripe keys are set (clearly labelled TEST MODE).
- **Emails & SMS** are printed to the terminal until Resend/Twilio keys are set.
- **Dashboard:** http://localhost:3000/admin. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults:
  the email in `config/business.ts` and `change-me-now`). You'll be asked to set up 2FA on first sign-in.

Demo data for the client demo (46 clients, ~350 bookings, vouchers, enquiries):

```bash
# stop `npm run dev` first when using the local embedded database (see DECISIONS.md #23)
npm run seed:demo-data
npm run clear:demo-data    # removes every demo row; real data is untouched
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Vitest: availability (buffers, caps, notice, BST), double booking, vouchers, cancellation fees, webhooks, apply:client-details, flags, notifications |
| `npm run check` | typecheck + lint + tests + colour-token check |
| `npm run apply:client-details` | Re-apply `config/seed-settings.ts` to the DB (settings + services by stable ID; archives removed services; never touches bookings/clients/payments) |
| `npm run check:placeholders` | Lists every placeholder; **exits 1 while any remain**. `-- --write` regenerates CLIENT_TODO.md; `-- --production` also checks env vars |
| `npm run check:tokens` | Fails if a colour literal exists outside `config/theme.css` |
| `npm run seed:demo-data` / `clear:demo-data` | Demo data on/off |
| `npm run import:vouchers -- file.csv` | Import vouchers sold via Calendly (also in the dashboard) |
| `npm run cron` | Run scheduled jobs once (`-- --watch` to loop locally) |
| `npm run db:migrate` | Run migrations against `DATABASE_URL` |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |
| `npm run brand:build` | Regenerate `public/brand/*` (logos, favicons, OG image) from the artwork + theme |

## Where things live (single source of truth)

| What | File |
| --- | --- |
| Business facts (names, address, phone, email, BASRaT, socials, SEO) | `config/business.ts` |
| Brand colours, fonts, radii | `config/theme.css` (only file allowed to contain colours) |
| Logos, favicons, OG image | `public/brand/` |
| Copy: about, FAQ, services, policies, page text, testimonials, media slots | `content/` |
| Services, hours, caps, rules, policy, payments, vouchers, flags, notification timing | `config/seed-settings.ts` → DB → editable in **/admin/settings** |
| Email/SMS templates | DB (seeded from `src/lib/notifications/defaults.ts`), editable in **/admin/settings/templates** |
| Intake questions (red flags, contraindications) | `src/lib/booking/questions.ts` |

## Environment variables

Copy `.env.example` to `.env.local`. All optional locally; required in production:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public URL used in emails, Stripe redirects, .ics, sitemap |
| `DATABASE_URL` | Supabase **pooled** connection string (London region). Unset → local PGlite |
| `DATA_ENCRYPTION_KEY` | 32-byte base64 key for field-level encryption of health data (`openssl rand -base64 32`). **Back it up**: losing it makes intake data unreadable |
| `SESSION_SECRET` | Long random string (`openssl rand -hex 32`) |
| `CRON_SECRET` | Shared secret for `/api/cron` (Vercel Cron sends it automatically) |
| `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` | First-run admin account |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google Calendar sync |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Optional bot protection on public forms |

## Deployment (Vercel + Supabase)

1. **Supabase**: create a project in **London (eu-west-2)**.
   - `DATABASE_URL` = the **transaction pooler** string (port **6543**). The app keeps a pool of 1–3 connections per
     serverless instance (`DB_POOL_MAX`, default 2) so traffic spikes can't exhaust Supabase's connection limit.
   - `MIGRATION_DATABASE_URL` = the **direct** connection string (port **5432**), used only by `npm run db:migrate`.
   - Migrations **never** run automatically in production or preview (`AUTO_MIGRATE` defaults to off there). Run
     `npm run db:migrate` as an explicit deploy step **before** promoting a deployment. It verifies the
     `btree_gist` extension and the `bookings_no_overlap` exclusion constraint, and seeds an empty database. Every
     server instance re-checks both at startup and refuses to serve if either is missing.
   - RLS is enabled on every table with no policies, so the public `anon` key can read nothing; the app connects
     server-side only.
2. **Vercel**: import the repo, set the env vars above, deploy. `vercel.json` pins the region to `lhr1` and runs
   `/api/cron` every 5 minutes (reminders, hold release, payment reconciliation, voucher expiry, calendar sync).
   **This needs the Vercel Pro plan.** Hobby only allows once-a-day cron jobs and *fails the deployment* with a
   5-minute schedule (checked against Vercel's cron limits, July 2026). If staying on Hobby, delete `crons` from
   `vercel.json` and have an external scheduler (e.g. cron-job.org or Supabase `pg_cron` + `pg_net`) call
   `GET /api/cron` every 5 minutes with `Authorization: Bearer $CRON_SECRET`. Each run is recorded, and the
   dashboard shows a red warning (and `/api/health` reports unhealthy) if the last successful run is over 15 minutes old.
3. Set `NEXT_PUBLIC_SITE_URL` and `config/business.ts → seo.siteUrl` to the live domain.
4. Run `npm run apply:client-details` against production after any change to `config/seed-settings.ts`.

## Going live with Stripe

1. Complete Stripe account activation (business details, payout bank account).
2. **Settings → Payment methods:** enable Cards, Apple Pay, Google Pay. Register the live domain for Apple Pay.
3. **Developers → Webhooks:** add `https://<domain>/api/webhooks/stripe` with events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
4. Swap test keys for live keys (`sk_live_…`, `pk_live_…`) in Vercel and redeploy.
5. Make one real £1 test (temporary discount code) and refund it from the dashboard.

Local Stripe testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` with test keys.

## Architecture in one paragraph

Next.js 16 App Router with Cache Components; Drizzle ORM on Postgres (Supabase in prod, PGlite locally, same
migrations). Double booking is impossible at the database level (a GiST exclusion constraint on each practitioner's
occupied time ranges), backed by a per-practitioner advisory lock for daily caps and blocked time. Every external
side effect (payments, email, SMS, calendar) sits behind a small interface with an offline fallback, so the whole
system runs and is tested without third-party accounts. See [PLAN.md](PLAN.md) and [DECISIONS.md](DECISIONS.md).

## Security & compliance notes

- Health data (intake, notes, emergency contacts) is encrypted per field with AES-256-GCM on top of disk encryption.
- Admin: bcrypt password + mandatory TOTP 2FA, recovery codes, DB sessions, rate-limited sign-in.
- Every view or change of client/booking records is written to the audit log (Dashboard → Settings → Audit log).
- Client data export (JSON) and erasure (anonymise + delete health data, keep financial records) from the client page.
- Public forms: validation, honeypot, per-IP rate limits, optional Turnstile.
- No personal data in URLs (opaque tokens only) or logs; security headers set in `next.config.ts`.
- Cookie banner: only essential cookies until consent; Google Maps loads on click.
