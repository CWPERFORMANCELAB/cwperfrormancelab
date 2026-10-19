# RUNBOOK: CW Performance Lab operations

Procedures for whoever looks after the site. Each one needs production access (Vercel + Supabase). Christopher
can't do these from the dashboard.

## Admin locked out (lost password, or lost phone *and* recovery codes)

There is deliberately no "forgot password" link: the dashboard holds health records, and an email-based reset would
make the inbox the weakest link. Recovery is a command-line break-glass step instead.

1. **Verify it's really Christopher**, e.g. by phone on the number you already have. Never act on an email alone.
2. From a checkout of the repo, with production credentials in your shell **for this command only**:

   ```bash
   DATABASE_URL="<production pooler URL>" DATA_ENCRYPTION_KEY="<prod key>" SESSION_SECRET="<prod secret>" \
     npm run admin:reset -- --email <admin email> --reset-2fa
   ```

   - Omit `--reset-2fa` if he only forgot the password and still has his authenticator app.
   - The command prints a random temporary password **once**, clears 2FA (if asked), revokes every existing
     session (anyone signed in is signed out), and writes `auth.admin_reset` to the audit log with your OS username.
3. Give him the temporary password **by phone**, not email or text.
4. He signs in at `/admin/login`, sets up 2FA again (new QR code + new recovery codes) and changes the password in
   **Settings → Account & security**.
5. Clear your shell history if the credentials were typed inline.

## Scheduled jobs warning in the dashboard

"Scheduled jobs aren't running" means `/api/cron` hasn't succeeded for 15+ minutes. Reminders, slot-hold release,
payment reconciliation and voucher expiry are paused until it recovers.

1. Vercel → Project → **Cron Jobs**: is `/api/cron` listed and succeeding? (Cron every 5 minutes needs the **Pro** plan.)
2. Vercel → **Logs**, filter `/api/cron`: a 401 means `CRON_SECRET` doesn't match; a 500 means a step failed (the
   dashboard warning names the failing step).
3. Run it by hand to recover immediately: `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron`.

## Health check / uptime monitor

`GET /api/health` returns `200 {"ok":true,…}` when the database, Stripe and the scheduler are all healthy, and `503`
with the failing check otherwise (`database`, `stripe` or `cron`). Point an uptime monitor (Better Uptime,
UptimeRobot, etc.) at it every minute and alert on non-200. It returns no personal data. The Stripe check is cached
for a minute, so after fixing a Stripe key wait a minute before re-checking.

## Error reports (Sentry)

Uncaught server errors, browser errors, failed webhook processing and failed cron steps go to Sentry when
`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set. Reports never include request bodies, cookies, IP addresses, emails or
phone numbers (`src/lib/scrub.ts`); look the client up in the dashboard by the payment or booking id in the report.

## "Payment found by reconciliation" email

A client paid in Stripe but the webhook never reached us; the cron job found it and confirmed the booking. One-off
is harmless. If it repeats, webhooks aren't arriving: check the endpoint URL and `STRIPE_WEBHOOK_SECRET` (next section).

## Stripe webhook failing

The admin is emailed automatically when the same Stripe event fails 3 times. Stripe keeps retrying for up to 3 days.

1. Stripe → Developers → Webhooks → the endpoint → **failed deliveries**: read the error.
2. Fix the cause (usually configuration), then click **Resend** on the failed events. Processing is idempotent, so
   resending is always safe.
3. Payments still pending 10+ minutes after checkout are reconciled from Stripe by the cron job anyway.

## Dispute (chargeback) opened

The admin gets a "payment disputed" email with the evidence deadline, and the dashboard Payments page shows it.
Respond in **Stripe → Payments → Disputes** before the deadline, attaching the booking confirmation, the signed
intake/consent (Dashboard → Client → Export data), and attendance status.

## Database

- **Migrations:** `MIGRATION_DATABASE_URL=<direct 5432 URL> npm run db:migrate` *before* promoting a deployment. It
  verifies the `bookings_no_overlap` constraint. Servers refuse to boot without it.
- **Backups:** Supabase → Database → Backups (daily; enable PITR on Pro). Test a restore into a staging project
  at least once.
- **Encryption key:** `DATA_ENCRYPTION_KEY` lives in Vercel env **and** a password manager. If it's lost, every
  intake form and clinical note becomes unreadable. It can't be recovered.
