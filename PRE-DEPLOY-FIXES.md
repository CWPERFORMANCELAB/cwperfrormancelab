# Pre-deployment fixes: CW Performance Lab

Status of the 12 pre-deployment items. Fixes 1–11 are done, tested and committed (one commit per fix or pair of
fixes). Fix 12 needs real accounts and keys, so it is **pending**; the exact procedure is below. Each fix has a
numbered entry in `DECISIONS.md` (26–36) with the full reasoning. Three follow-up changes (fonts, `AUTO_MIGRATE`,
Node/npm pinning) are listed at the end, and their reasoning is in `DECISIONS.md` 37–39.

**Current results:** `npm run check` passes (typecheck, lint, 152 unit/integration tests, token check), and
`npm run test:e2e` passes (85 tests against the real production build). The production build has no warnings. A clean
clone installs with `npm ci` on npm 10.9.9 and on npm 11.19.1, and passes `npm run check` under Node 24.22.0.

| # | Fix | Status | Test that would have caught it |
| --- | --- | --- | --- |
| 1 | No silent production fallbacks | ✅ | `tests/env.test.ts` |
| 2 | Per-page admin auth | ✅ | `tests/e2e/admin-auth.e2e.test.ts` (forged cookie, 26 routes × 3 request types) |
| 3 | DB pool, explicit migrations, invariant check | ✅ | `tests/db-invariants.test.ts` |
| 4 | Git + clean `npm ci` | ✅ | Clean-clone `npm ci && npm run check` |
| 5 | Race-safe refunds | ✅ | `tests/refunds.test.ts` |
| 6 | Single-winner checkout completion | ✅ | `tests/checkout-race.test.ts` |
| 7 | Disputes + SCA off-session | ✅ | `tests/disputes-sca.test.ts` |
| 8 | Cron freshness + Vercel plan | ✅ | `tests/cron-health.test.ts` |
| 9 | `admin:reset` + RUNBOOK | ✅ | `tests/admin-reset.test.ts` |
| 10 | HSTS + CSP | ✅ | `tests/security-headers.test.ts`, `tests/e2e/security-headers.e2e.test.ts` |
| 11 | Monitoring | ✅ | `tests/monitoring.test.ts`, `tests/e2e/health.e2e.test.ts` |
| 12 | Real end-to-end run on staging | ⏳ **Pending**: needs Supabase, Stripe test keys and Resend | Manual run, steps below |

---

## 1. No silent production fallbacks

**Problem:** with a missing variable, production would quietly use the mock payment provider, a local file
database, console "email", dev encryption keys or an open bot check.

**Fix:** `src/lib/env.ts` decides one runtime mode: production, preview or local. In production and preview:
- `assertProductionEnv()` refuses to start the server, and refuses to build, if a required variable is missing.
  Production also rejects Stripe test keys and localhost URLs.
- Every dev fallback throws through `forbidInStrict()`: mock payments, `/pay/mock`, PGlite, console email/SMS, dev
  crypto keys, the default admin password and Turnstile with no key.

`scripts/prebuild.ts` runs before every `next build`.

**Test:** `tests/env.test.ts` covers mode detection, each missing variable, test keys rejected in production, and
each fallback throwing.

## 2. Every admin page enforces auth itself

**Problem:** admin pages relied on `proxy.ts` only checking that a cookie *exists*. RSC and prefetch requests with a
forged cookie could return client data.

**Fix:**
- `await requireAdmin()` runs in every admin page's data component and every `src/lib/admin/*` data function.
- `currentSession()` is wrapped in `cache()`, so the repeated checks cost one query per request.

**Test:** `tests/e2e/admin-auth.e2e.test.ts` seeds canary client data and runs the production build. It requests all
26 admin routes as HTML, RSC and prefetch with `cw_admin=forged`, and asserts no canary data appears. A control test
with a real session proves the probe can see the canary. **Proven:** with the per-page checks removed, 8 routes
leaked canary data.

## 3. Serverless database

**Fix:**
- Connection pool is `DB_POOL_MAX` (default 2, clamped 1–3) on the Supabase transaction pooler.
- Migrations never run automatically in production. `npm run db:migrate` runs as an explicit deploy step over the
  direct connection.
- `verifyDbInvariants()` checks for `btree_gist` and the `bookings_no_overlap` exclusion constraint at every connect
  and at server boot.

**Test:** `tests/db-invariants.test.ts` drops the constraint and expects startup to fail.

## 4. Version control

**Fix:**
- Git initialised on `main`.
- `.gitignore` fixed: it used to ignore `.env.example` and was missing `.data/`.
- `typecheck` now runs `next typegen` first.

**Test:** a clean clone with `npm ci && npm run check`. It caught a real bug: route types only existed after a build.

## 5. Race-safe refunds

**Fix:**
- `refundPayment()` locks the payment row (`SELECT … FOR UPDATE`) and sends a Stripe idempotency key.
- It records the refund in the ledger under a unique Stripe refund id and recomputes totals from the ledger.
- The `charge.refunded` webhook records only refunds we don't already have, such as ones made in the Stripe dashboard.

**Test:** `tests/refunds.test.ts`. All 5 cases failed before the change:
- double-click;
- concurrent partial refunds exceeding the payment;
- idempotency key;
- dashboard refund replay;
- unique index.

## 6. Single-winner checkout completion

**Fix:**
- `handleCheckoutCompleted()` claims the payment with `UPDATE … WHERE status='pending' RETURNING`, and only the
  winner fulfils it.
- Checkout expiry uses the same conditional update.

**Test:** `tests/checkout-race.test.ts`. Three simultaneous deliveries produce one confirmation, one email and one
receipt. In the slot-lost case, the client is refunded exactly once.

## 7. Disputes and SCA

**Fix:**
- New `disputes` table. `charge.dispute.*` webhooks record disputes and email the admin with the evidence deadline.
  The Payments page and the client profile show them.
- When a saved-card fee hits `requires_action` (the bank wants authentication), the client is emailed a 7-day payment
  link, the admin is alerted, and the payment appears under "Waiting for client".

**Test:** `tests/disputes-sca.test.ts`.

## 8. Cron freshness

**Fix:**
- Every cron run is recorded in `system_status`.
- The dashboard shows a red, non-dismissible warning if there's been no successful run for 15 minutes.
- **The 5-minute cron needs Vercel Pro.** Hobby rejects it at deploy. The alternative, an external scheduler, is
  documented in the README and GO-LIVE.

**Test:** `tests/cron-health.test.ts`.

## 9. Admin account recovery

**Fix:** `npm run admin:reset -- --email … [--reset-2fa]` does the following:
- prints a one-time temporary password;
- optionally resets 2FA;
- signs out every session;
- writes an audit log entry.

There is deliberately no web "forgot password". `RUNBOOK.md` covers this and the other incidents.

**Test:** `tests/admin-reset.test.ts`, plus a manual CLI run.

## 10. HSTS and CSP

**Fix:** in `src/lib/security-headers.ts`:
- HSTS for 2 years, with includeSubDomains and preload.
- CSP without nonces, which keeps static pages and PPR. Every source is allowlisted: self, Stripe, Turnstile, the
  Google Maps embed, and Plausible or Sentry only when configured.
- Admin pages and APIs send `frame-ancestors 'none'` and `X-Frame-Options: DENY`.

**Verified in a browser on a production build:** the contact map renders, and a full booking reaches confirmation
through checkout and the admin sign-in page, with no CSP violations.

**Test:** `tests/security-headers.test.ts` checks the policy contents. `tests/e2e/security-headers.e2e.test.ts` checks
the headers the built server actually sends.

**Pending (part of fix 12):** real Stripe Checkout and Apple Pay under the CSP.

## 11. Monitoring

**Sentry**, off unless `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set:
- `sendDefaultPii: false`, no tracing, no replay.
- `beforeSend` drops request bodies, cookies, query strings, IPs and stack locals, and replaces every email and phone
  number.
- Webhook and cron failures are reported too.

**`/api/health`** checks the database, Stripe (cached for 60s) and cron freshness. It returns 200 or 503 and contains
no personal data.

**Admin alert emails** go out:
- on the 3rd failure of the same Stripe event;
- when reconciliation finds a payment Stripe completed that we never processed.

This fix also corrected a regression from fix 3: a build warning that bundled the whole project into the server.

**Test:** `tests/monitoring.test.ts` (12 tests) and `tests/e2e/health.e2e.test.ts`.

## 12. Real end-to-end run on staging: ⏳ PENDING

This can't be done without real staging accounts. Nothing below has been run yet, and there are no screenshots.

**Needed from you or the client:**
- a Supabase staging project (London);
- Stripe **test mode** keys and a webhook signing secret;
- a Resend API key with a verified sending domain;
- optionally, a Sentry DSN.

**Procedure:**
1. Create a Vercel **preview** deployment with `DATABASE_URL` (pooler, 6543), `MIGRATION_DATABASE_URL` (direct,
   5432), `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `STRIPE_SECRET_KEY=sk_test_…`,
   `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` and the Turnstile keys.
2. `MIGRATION_DATABASE_URL=… npm run db:migrate`. Screenshot the "constraint present" output.
3. In Stripe test mode, add the webhook endpoint `https://<preview>/api/webhooks/stripe` with the 8 events.
4. Book a session with card `4242 4242 4242 4242`. Screenshot Stripe Checkout, the confirmation page, the email in
   the inbox (with the .ics file) and the booking in the dashboard.
5. Repeat with `4000 0025 0000 3155` (3-D Secure). Screenshot the challenge and the confirmation.
6. Apple Pay in Safari, and Google Pay in Chrome, on the Checkout page. Screenshot each with no CSP errors.
7. Refund partially, then fully, from the dashboard. Screenshot the Stripe refund and the receipt email.
8. Dispute with card `4000 0000 0000 0259`. Screenshot the dispute email and the Payments banner.
9. Charge a no-show fee to a saved card `4000 0027 6000 3184` (needs authentication). Screenshot the payment-link
   email and "Waiting for client".
10. Disable the webhook, pay, wait for the cron run. Screenshot the "payment found by reconciliation" email.
11. `GET /api/health`. Screenshot the 200. Then set a wrong Stripe key and screenshot the 503 (with `stripe: false`).
12. With a Sentry DSN set, trigger an error on a form submission. Screenshot the event, showing no body, email or
    phone in it.
13. Add the screenshots under `docs/pre-deploy/` and update this section.

## Follow-up changes

| Change | Test |
| --- | --- |
| **Self-hosted fonts.** Inter and Inter Tight are loaded with `next/font/local` from committed variable woff2 files in `src/app/fonts/`, with their SIL OFL licences alongside. Builds never fetch from Google, and visitors never contact Google Fonts. | `tests/fonts.test.ts`: no `next/font/google` or Google Fonts URL anywhere; the font files and licences exist. Failed on the old layout. Checked on a production build: both fonts load from the site itself, with zero Google requests. |
| **`AUTO_MIGRATE=true` refused in production and preview.** It is a configuration error in `assertProductionEnv()`, so the server won't start and the build won't run. `shouldAutoMigrate()` also throws as a second guard. The pool default stays at 2. | `tests/env.test.ts` (3 new cases; 2 failed before the change). The fix-3 test in `tests/db-invariants.test.ts` was updated to expect the throw. |
| **Node and npm pinned; lock file fixed.** `npm ci` failed on npm 10 because the lock file put drizzle-kit's `esbuild@0.25.12` where Vite needs `^0.27 \|\| ^0.28`. Fixed with an explicit `esbuild@^0.28.2` dev dependency (already locked through tsx, so no new code). `packageManager: npm@11.19.1`, `engines: node 24.x, npm >=11.19.1 <12`, and `.nvmrc`. | Clean clone: `npm ci` succeeds on npm 10.9.9 and 11.19.1 (the old lock file reproduces the failure), `npm ls --all` is clean, and `npm run check` passes under Node 24.22.0. |

## Other things to know

- `npm run test:e2e` builds the app (~1 min), so it isn't part of `npm run check`. Run both in CI.
- New migrations: `0005` refund idempotency, `0006` disputes, `0007` system status, `0008` webhook attempts. Run
  `npm run db:migrate` before promoting a deploy.
- Sentry is pinned exactly to `@sentry/nextjs@11.4.0`.
- Use Node 24 (`nvm use`). Other versions only warn (`engine-strict` is off), but Vercel will build with Node 24.
- npm 11.19 no longer runs dependency install scripts by default. The 5 it lists are optional, and check, build and
  e2e all pass without them.
