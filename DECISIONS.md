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
29. **Fix 4: version control.** Git initialised on `main`. `.gitignore` now keeps `.env.example` while ignoring all
    other `.env*`, and adds `/.data/` (local databases), `/.claude/` and the review-prompt notes; `.next/`,
    `node_modules/` and `*.tsbuildinfo` were already covered. `npm ci` succeeds with the lock file. A clean-clone
    run of `npm ci && npm run check` exposed a real bug: the global `PageProps`/`LayoutProps` route types live in
    the uncommitted `.next/`, so `typecheck` only passed on a machine that had built before. `typecheck` now runs
    `next typegen` first. The clean clone then passed (110 tests). The test for this fix is that clean-clone run.
30. **Fix 5: race-safe, idempotent refunds.** `refundPayment()` runs in a transaction that locks the payment row
    (`SELECT … FOR UPDATE`), computes the refundable balance from the locked row, calls Stripe with an idempotency
    key derived from that locked state (`refund:<paymentId>:<refundedSoFar>:<amount>`), stores the Stripe refund id,
    and recomputes `refunded_pence` from the refund ledger. `refunds.provider_refund_id` has a unique index.
    `charge.refunded` no longer trusts `amount_refunded`: it lists the payment's refunds from Stripe and inserts only
    ids we don't already have (same lock, `ON CONFLICT DO NOTHING`), so app-made refunds are never double-recorded.
    Test: `tests/refunds.test.ts`. Five of its six cases failed before the change: two concurrent full refunds,
    concurrent partials exceeding the payment, idempotency key, dashboard-refund replay, and the unique index.
31. **Fix 6: single-winner checkout completion.** `handleCheckoutCompleted()` now starts with
    `UPDATE payments SET status='succeeded' … WHERE id=? AND status='pending' RETURNING *`, and only the caller that
    gets a row back fulfils (confirm booking, receipt, voucher/package activation, or slot-lost refund).
    `handleCheckoutExpired()` uses the same conditional update, so an expiry can't undo a completed payment.
    Test: `tests/checkout-race.test.ts`. Three simultaneous deliveries give one `booking_confirmed` and two
    `already_processed`, with one confirmation email and one receipt; the slot-lost case refunds once. Both concurrent
    cases failed before the change.
32. **Fix 7: disputes and off-session authentication.** New `disputes` table (unique Stripe dispute id, with RLS).
    `charge.dispute.created/updated/closed` webhooks upsert it against the payment, email the admin on open and
    close (with the evidence deadline), and the dashboard shows disputes on Payments (open-dispute banner) and on the
    client profile. `StripeProvider.chargeSavedCard` now distinguishes `requires_action` (code
    `authentication_required` or PaymentIntent `requires_action`) from a plain decline. On `requires_action`,
    `chargeFeeToSavedCard` creates a 7-day payment link for the same amount, emails it to the client, alerts the admin
    and records the attempt with `authenticationRequired` metadata; Payments lists these under "Waiting for client"
    until paid. New templates reach existing databases through `ensureTemplates()` at boot and in `db:migrate`.
    Webhook event list updated in README and GO-LIVE. Test: `tests/disputes-sca.test.ts`.
33. **Fix 8: scheduled jobs.** Checked Vercel's current limits (docs updated July 2026): Hobby allows cron only once
    a day (±59 min) and rejects more frequent schedules at deploy; Pro/Enterprise allow once a minute. The 5-minute
    `/api/cron` therefore **requires Vercel Pro**, or on Hobby an external scheduler calling the endpoint with
    `CRON_SECRET` (documented in README). Every run writes `system_status["cron"]` with `lastRunAt`,
    `lastSuccessAt` (only moves when all steps succeed) and failing step names. `cronHealth()` reports stale after 15
    minutes without a success (or, in production/preview, if it has never succeeded). The dashboard layout shows a
    red, non-dismissible warning when stale; `/api/health` uses the same check (fix 11). Test: `tests/cron-health.test.ts`.
34. **Fix 9: admin account recovery.** `npm run admin:reset -- --email … [--reset-2fa]` (logic in
    `src/lib/auth/reset.ts`, no web route) sets a random ~100-bit temporary password printed once, optionally clears
    TOTP and recovery codes so 2FA is re-enrolled at next sign-in, deletes all of that admin's sessions, and writes
    `auth.admin_reset` to the audit log with the operator's OS username. A web "forgot password" was rejected on
    purpose: it would make the inbox the weakest link to client health records. Procedure in `RUNBOOK.md`.
    Test: `tests/admin-reset.test.ts`, plus a manual CLI run against a scratch database.
35. **Fix 10: HSTS and CSP.** `src/lib/security-headers.ts`, wired in `next.config.ts` `headers()`. The CSP has no
    nonces (Next.js "without nonces" pattern), because nonces would make every page dynamic and lose prerendering and
    PPR. `'unsafe-inline'` is allowed for scripts and styles, but every source is allowlisted: self, Stripe (js, api,
    checkout, hooks), Cloudflare Turnstile, the Google Maps embed, and Plausible only when configured.
    `object-src 'none'`, `base-uri 'self'`, `form-action 'self' https://checkout.stripe.com`. Public pages get
    `frame-ancestors 'self'` and SAMEORIGIN. `/admin/*` and `/api/admin/*` get `frame-ancestors 'none'` and
    `X-Frame-Options: DENY`; those rules come last because the last matching rule wins for the same header.
    HSTS: `max-age=63072000; includeSubDomains; preload`. Permissions-Policy keeps `payment` available to Stripe for
    Apple/Google Pay. Checked in a browser on a production build: the contact map renders; a full booking (slot picker,
    form, server action, checkout redirect, confirmation) and the admin sign-in all work with no CSP violations in the
    console. Real Stripe Checkout and Apple Pay can't be tested without Stripe keys, so they're part of fix 12.
    Tests: `tests/security-headers.test.ts` (policy contents) and `tests/e2e/security-headers.e2e.test.ts` (headers
    the production server actually sends, including admin pages and API).
36. **Fix 11: monitoring.** Sentry (`@sentry/nextjs`, pinned exactly to 11.4.0, a release more than two weeks old) is
    set up in `src/lib/monitoring.ts`. Server init happens in `instrumentation.ts`, browser init in
    `src/instrumentation-client.ts` (loaded only when `NEXT_PUBLIC_SENTRY_DSN` is set at build time), and Next's
    `onRequestError` is wired to `captureRequestError`. It's off without a DSN; production logs a boot warning
    instead of refusing to start, and GO-LIVE has a checklist line for it. Privacy settings: `sendDefaultPii: false`,
    no tracing and no session replay. `beforeSend` runs `scrubEvent()` (`src/lib/scrub.ts`), which drops request
    bodies, cookies, query strings, IPs, stack-frame locals and all but harmless headers, reduces `user` to its id, and
    replaces emails and phone numbers in every string; ids such as UUIDs and Stripe ids are kept. Browser input
    breadcrumbs are dropped. The CSP's connect-src gets only the exact ingest origin from the DSN. Handled errors in
    webhook processing and cron steps are sent with `reportError()`. **`/api/health`** reports `database` (select 1),
    `stripe` (`balance.retrieve`, 5s timeout, cached 60s so the public endpoint can't use up the Stripe rate limit) and
    `cron` (`cronHealth`). It returns 200 or 503 with `no-store` and holds no personal data or error text. A mock
    provider counts as unhealthy in production/preview. **Alerts:** `webhook_events.attempts` (migration `0008`)
    counts failed processing; the third failure of the same event emails `admin_ops_alert` once (dedupe key per
    event). `reconcilePendingPayments` now counts payments Stripe completed that we never processed, fixes them and
    emails `admin_ops_alert` once per payment (a race with the webhook, `already_processed`, isn't counted). Also
    fixed a regression from fix 3: `PGLITE_DIR` made Turbopack trace the whole project into the server bundle
    (`turbopackIgnore`), and the build is now warning-free. Tests: `tests/monitoring.test.ts` (12: scrubbing,
    options, CSP, health states and caching, 3-failure alert, reconciliation alert) and
    `tests/e2e/health.e2e.test.ts`. Docs: README env table, `.env.example`, GO-LIVE, RUNBOOK.
37. **Self-hosted fonts.** Inter and Inter Tight load with `next/font/local` from `src/app/fonts/` (committed). Each is
    one variable-weight (100–900) Latin woff2, the same subset and upright-only style `next/font/google` served, taken
    from `@fontsource-variable/inter` and `inter-tight` 5.3.0 (unpacked once, not added as dependencies), with their
    SIL OFL licences alongside. Builds no longer fetch from Google, and visitors' browsers never contact Google
    Fonts. Checked on a production build: both faces load from `/_next/static/media` and no request goes to Google.
    Test: `tests/fonts.test.ts`. It fails if anything imports `next/font/google` or links to Google Fonts (verified
    against the old layout), and checks the font files and licences are present.
38. **`AUTO_MIGRATE=true` is refused off-local.** `assertProductionEnv()` now treats `AUTO_MIGRATE` set to
    `true`/`1`/`yes` as a configuration error in production and preview. The server refuses to start (instrumentation)
    and the build refuses to run (prebuild/`check:placeholders --production`). `shouldAutoMigrate()` also throws in
    strict mode, as a second guard for code paths that reach `getDb()` without instrumentation. Reason: migrations are an
    explicit deploy step (fix 3). Auto-migrating from every serverless instance races, and runs DDL through the
    transaction pooler. Locally it still works as before. Pool default stays at 2 (declined). Test:
    `tests/env.test.ts`, with 3 new cases (production and preview reject it, local allows it); 2 failed before the change.
    The fix-3 assertion in `tests/db-invariants.test.ts` that allowed an explicit opt-in off-local now expects a throw.
39. **Pinned Node/npm and a consistent lock file.** The cause of `npm ci` failing on npm 10 ("Missing: esbuild@0.28.2
    from lock file") was an inconsistent lock file. Vite 8 has an optional peer `esbuild@^0.27 || ^0.28`, but the
    lock file hoisted drizzle-kit's `esbuild@0.25.12` to the root (`npm ls` reported it as `invalid`). npm 11 tolerated
    this; npm 10 tried to place 0.28.2 and found it missing. Fix: `esbuild@^0.28.2` is an explicit devDependency. That
    is the version tsx already locked, so no new package arrives; 0.28.2 is hoisted and drizzle-kit keeps a nested
    0.25.12. `npm ls --all` is now clean. The lock file was repaired from the existing one rather than regenerated
    from scratch: a fresh resolution would have pulled in every transitive release from the last few days, and a
    `--before` cutoff can't work because direct dependencies (Next 16.4.0, PGlite) are themselves newer than two
    weeks. `package.json` pins `packageManager: npm@11.19.1` (the npm bundled with Node 24.22.0) and
    `engines: { node: "24.x", npm: ">=11.19.1 <12" }`. Vercel reads `engines.node` to choose Node 24, the active
    LTS. `.nvmrc` says 24. `engine-strict` is deliberately not set, so a different local Node only warns. Verified:
    clean clones run `npm ci` successfully with npm 10.9.9 and npm 11.19.1 (old lock file reproduced the failure),
    and `npm run check` passes in the clean clone under Node 24.22.0. Note: npm 11.19 no longer runs dependency install
    scripts by default. The 5 it lists (esbuild ×3, fsevents, unrs-resolver) are optional optimisations; the
    platform binaries come from optional dependencies, and check, build and e2e all pass without them.
40. **Availability is entered per date, with no default weekly hours.** Client request: Christopher enters his own
    hours and picks the days they apply to. There is deliberately no "usual working hours" fallback, so a date with
    no hours entered can't be booked. The `workingHours` setting is removed, along with its Settings editor, the
    contact page's fixed hours table (now "by appointment" with a link to live availability) and the JSON-LD opening
    hours. Data: `availability_days` (practitioner, London date, ranges, optional cap, `is_demo`; migrations 0009 and
    0010, RLS on). `dayHours()` in the engine is the single source for every caller: the public slot list, the hold
    re-check when a client picks a time, client rescheduling, and the dashboard's 7-day cap panel and utilisation.
    Slots are fetched live by a server action and never cached, so a save shows on the booking page immediately. UI
    (`/admin/availability`, own sidebar item):
    1. Hours: start and finish, an optional break, and presets.
    2. Days: a two-month calendar with tap-to-select, "Every Mon…Sun" toggles, shift-click ranges, and past weeks hidden.
    3. Save: "Available 8am–1pm on 6 days" or "Make unavailable" (asks for confirmation and lists the days).
    Saving warns about existing bookings now outside the hours; they're never auto-cancelled. Daily appointment limits
    stay in Settings (0 = use the highest limit, so an opened Sunday works). Demo: `seed:demo-data` adds sample
    hours flagged `is_demo`; `clear:demo-data` removes only those. The go-live checklist now includes entering
    availability. Tests: `tests/availability-plan.test.ts` (12, covering the engine, the real booking path, multi-day
    set and clear, time off on top, clash warnings, the calendar data, validation, and demo clearing that keeps real
    hours). The shared test database enters a fixed pattern for its date window (`tests/helpers.ts`), and the
    forged-cookie e2e test covers the new route.
41. **Availability "Your hours" simplified (client feedback).** The preset buttons, the "break" control and the
    per-day max-appointments option are removed. Step 1 is now just a start and finish time, plus "+ Add another time
    period" (up to 3 per day) for split days such as 8am–12pm and 5pm–8pm; clients can't book the gap. Periods are
    checked in the browser and again on the server (`parseRanges`: finish after start, no overlaps). Calendar tiles
    show each period on its own line so a split day's gap is visible. The daily limits in Settings still apply.
    Verified in the browser: saving 8am–12pm and 5pm–8pm on one day made the booking page offer 08:00–11:00 and
    17:00–19:00 starts (60-minute session) and nothing between.
42. **Testimonials removed (client request).** The homepage section, the `/testimonials` page, the footer link, the
    sitemap entry, `content/testimonials.json` and its go-live placeholder check are gone. The review-request email
    no longer falls back to `/testimonials` when no Google review link is set; it was already skipped in that case.
43. **Local builds use an in-memory database.** `next build` prerenders in several worker processes at once. With
    PGlite, each worker opened the same on-disk folder, and it was the dev server's live `.data/pglite`. That
    corrupted the local demo database on 27 Oct, and it failed the build whenever the dev server was running.
    `build:local` (and so `test:e2e`) now sets `PGLITE_MEMORY=1`, so each worker gets its own throwaway database,
    seeded from config, and nothing is written to disk. Production builds are unaffected (they use `DATABASE_URL`).
    Verified: `npm run test:e2e` passes (88) with the dev server running, and the dev database stays healthy.
44. **Launch settings confirmed (2026-11-01).** The client confirmed the business name, contact details, service
    prices and lengths. Vouchers are £45 / £65 / £95, with the 12-month expiry still to confirm (a warning). There is
    **no cancellation policy yet**, so the policy has no fees: late-cancel and no-show are 0%, cancelling always
    refunds in full, and online rescheduling is open up to 24h before. The wording follows the settings:
    `policySummary()` and the new `noShowSummary()` (terms page `<NoShow />`) never mention a fee when fees are 0, and
    the trust badge reads "Free cancellation". Fees can be switched on later in Settings; that code is unchanged and
    still tested (tests set 50% explicitly via `withFees`). SMS reminders are off at launch (no Twilio account), so
    production no longer requires `TWILIO_*` keys.
45. **Go-live gate: blocking or "can wait".** Each placeholder now carries `blocking` (`isBlocking` in
    `src/lib/placeholders.ts`). These block a production build: services, business and legal name, contact details,
    record retention, and the cancellationPolicy, paymentDefaults, vouchers and compliance settings. Everything else
    is a warning that never fails a build, and `CLIENT_TODO.md` lists the two groups separately. Warnings include
    media, draft FAQs, social links, the review link, BASRaT and ICO numbers, brand files, notification timings,
    inline settings markers, and legal review, which the client chose to make a warning. The site URL isn't blocking
    here because the production env check already requires `NEXT_PUBLIC_SITE_URL`. Remaining blockers: record
    retention, and paymentDefaults (pay in full, no VAT). Test: `tests/placeholders.test.ts`.
