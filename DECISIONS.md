# DECISIONS

Non-obvious choices, newest last.

1. **PGlite for local/dev/test, Supabase Postgres in production.** No Docker or Postgres on the build machine. PGlite
   runs the identical migrations (including `btree_gist` + exclusion constraint), so there is one schema and one SQL
   dialect. Switch is purely `DATABASE_URL`.
2. **Self-hosted admin auth.** One admin user, TOTP 2FA. Kept in `src/lib/auth/` behind a small interface so Supabase
   Auth can replace it without touching pages.
3. **Buffers are modelled as "occupied time" after a booking.** A booking occupies `[start, end + buffer)`. Two
   occupied ranges may not overlap. This gives the buffer on both sides consistently and maps 1:1 to the DB exclusion
   constraint. The buffer is a per-service column copied onto the booking at creation so later service edits don't
   move existing bookings.
4. **Slot holds are rows, not a cache.** A `pending_payment` booking with `hold_expires_at` reserves the slot for 10
   minutes. Availability ignores expired holds; a sweeper cancels them. This keeps the DB constraint as the only source
   of truth for conflicts.
5. **Health data is encrypted at field level (AES-256-GCM).** Intake answers, medical history, consents and admin notes
   are stored as ciphertext. `DATA_ENCRYPTION_KEY` is a 32-byte base64 key; a dev key is derived automatically when
   unset so local dev works, with a warning.
6. **Payments abstraction with a mock provider.** `getPaymentProvider()` returns Stripe when `STRIPE_SECRET_KEY` is set,
   otherwise a mock that renders `/pay/mock/[id]`. Both call the same `onPaymentSucceeded` handler, so the booking
   confirmation path is identical and testable offline.
7. **Notifications are a queue table.** Everything (confirmations, reminders, automations, admin alerts) is inserted
   into `notifications` with `scheduled_for`; a dispatcher sends due rows via Resend/Twilio or logs to console. This
   makes reminders testable and retry-able, and keeps provider code in one place.
8. **Schema.org type: `MedicalBusiness`.** It's the LocalBusiness subtype for health services providers.
   `Physiotherapy` would misrepresent a Sport Rehabilitator (protected title), and `MedicalClinic` implies a
   multi-practitioner facility. Service offers are attached via `hasOfferCatalog`.
9. **Settings are JSONB rows validated with Zod on read.** Adding a setting = add a key to `config/seed-settings.ts`
   and its Zod schema; the admin settings page is generated from the same schema.
10. **`next/proxy.ts` (Next 16's rename of middleware)** only checks for a session cookie and redirects; real session
    verification happens server-side in the admin layout and in every server action.
11. **Stable service IDs are human-readable slugs** (`injury-assessment`) rather than UUIDs so `seed-settings.ts` is
    readable and `apply:client-details` can upsert by ID.
12. **Money is integer pence everywhere.** `price_pence`, `balance_pence`, etc. Display formatting happens in one helper.
13. **Real logo used, not a generated wordmark.** The client already supplied artwork, so `public/brand/logo.svg` and
    `logo-mark.svg` embed it (regenerate with `npm run brand:build`). They are flagged as placeholders until true
    vector files arrive. Likewise the six real photos he supplied fill their media slots; only missing shots are
    labelled placeholders.
14. **Cancellation money with vouchers:** for policy maths, voucher value counts as "paid". Retained fees come from
    card money first, then voucher balance; refunds go to the card and any un-retained voucher value is restored to
    the code.
15. **Cache Components on.** Public pages read services/settings through one `"use cache"` function tagged
    `catalog` (`src/lib/data/public.ts`); dashboard edits call `updateTag("catalog")` so prices change instantly.
    Anything per-request (admin, manage links, confirmation) calls `connection()` and streams inside Suspense.
16. **Stripe Checkout, not the Payment Element.** Hosted Checkout gives Apple Pay / Google Pay / cards, SCA and
    receipts with zero PCI scope and no card UI to maintain. Holds are extended to 35 min when the client reaches
    payment because Stripe sessions can't expire sooner than 30 min.
17. **Returning clients verify by emailed code** before their details are prefilled. Matching on email alone would
    leak health data to anyone who knows an address. Unverified submissions never overwrite stored details.
18. **Contraindication "yes" answers block online booking** for dry cupping / compression boots (client is asked to
    get in touch). Red-flag answers do *not* block: the client gets NHS/111/999 guidance and the booking is flagged
    in the dashboard for review.
19. **Placeholder testimonials and draft FAQs are hidden in production** (`NODE_ENV=production`) unless
    `SHOW_SAMPLE_CONTENT=1`, so nothing fake is ever public. Placeholder media render as labelled boxes instead.
20. **Booking flow renders client-only** (`flow-client.tsx`) so it can resume an in-progress hold from
    sessionStorage without hydration mismatches; the page shell (heading, trust row) is still server-rendered.
21. **Packages and insurer bookings share existing paths.** Package codes are entered in the same box as gift
    vouchers; insurer bookings are confirmed with no charge and the balance tracked on the booking. Both are inert
    while their flags are off (tests prove it).
22. **Colour contrast:** brand purple (#8247f5) is 3.9:1 on near-black, below AA for small text, so a lighter
    `--brand-primary-light` is used for text on dark and `--brand-primary-strong` for text on light. The brand
    colour itself is kept for buttons/large elements.
23. **Single-process local DB.** PGlite is a file database owned by one process: stop `npm run dev` before running
    scripts locally (or set `DATABASE_URL` to a Postgres/Supabase instance, which has no such limit).
24. **Vercel region `lhr1`** and Supabase in London (eu-west-2) keep health data in the UK.
25. **Two accent schemes from one set of tokens.** The public site uses a silver-grey accent; the dashboard uses a
    pale orange. Both are CSS variables in `config/theme.css`, remapped by scope: `.surface-light` (light panels on the
    dark site → graphite accent) and `.admin-theme` (dashboard → orange). Text placed on an accent fill always uses
    `--brand-on-primary`, and accent *text* uses the darker `-strong` shade, so every pairing stays ≥ 4.5:1.

## Pre-deploy fixes (independent review)

26. **Fix 1: no silent fallbacks outside local dev.** `src/lib/env.ts` defines one runtime mode: `production`
    (VERCEL_ENV=production, or NODE_ENV=production with a non-localhost site URL; fails closed when the URL is
    missing), `preview` (VERCEL_ENV=preview) or `local`. `assertProductionEnv()` runs in `src/instrumentation.ts`
    `register()` (once per server start, before requests) and refuses to serve with any required variable missing;
    the same function backs `check:placeholders -- --production` and `scripts/prebuild.ts`, which now runs before
    every `next build` (production: placeholders + env; preview: env only). In production/preview the mock payment
    provider, `/pay/mock`, PGlite, console email/SMS, dev crypto keys, the default admin password and open Turnstile
    all throw or fail closed via `forbidInStrict()`. Preview allows Stripe test keys and console email but still needs
    `DATABASE_URL`. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is not required: we use hosted Checkout, which never needs it.
    Local `next build` now needs a localhost `NEXT_PUBLIC_SITE_URL` → `npm run build:local`. The `ALLOW_DEV_KEYS`
    escape hatch from earlier is removed (localhost detection replaces it). Test: `tests/env.test.ts`.
27. **Fix 2: every admin page enforces auth itself.** `await requireAdmin()` now runs in every admin page's
    data-loading component and at the top of every `src/lib/admin/*` function that reads client or payment data.
    `currentSession()` is wrapped in React `cache()` so these repeated checks cost one DB query per request.
    Test: `tests/e2e/admin-auth.e2e.test.ts` (`npm run test:e2e`) runs the real production build against a seeded
    canary client and requests all 26 admin routes with a forged `cw_admin=anything` cookie as HTML, RSC and RSC
    prefetch. A control test proves the probe sees the canary with a valid session. Verified the test catches the
    bug: with the per-page checks removed, 8 routes leaked the canary's name, enquiry or £123.45 payment.
    E2E tests are separate from `npm run check` because they need a production build (~1 min); CI runs both.
28. **Fix 3: serverless database.** Pool per instance is `DB_POOL_MAX` (default 2, clamped 1–3) with idle/connect
    timeouts, on Supabase's transaction pooler (port 6543; a warning is logged otherwise). `AUTO_MIGRATE` now
    defaults to *off* in production/preview; `npm run db:migrate` runs migrations over a single connection to
    `MIGRATION_DATABASE_URL` (direct, port 5432) as an explicit deploy step. `verifyDbInvariants()` checks for the
    `btree_gist` extension and the `bookings_no_overlap` exclusion constraint on every connect (and the
    instrumentation hook connects at boot in production), so a database without them fails loudly instead of
    silently allowing double bookings. Test: `tests/db-invariants.test.ts` (drops the constraint and expects failure).
