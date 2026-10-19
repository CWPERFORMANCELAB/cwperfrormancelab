# Go-live checklist

Tick everything before pointing the domain and Instagram at the new site.

## Domain & hosting
- [ ] Domain bought; DNS pointed at Vercel (A/ALIAS + `www` CNAME); HTTPS certificate issued
- [ ] `NEXT_PUBLIC_SITE_URL` and `config/business.ts → seo.siteUrl` set to the live domain
- [ ] Vercel region `lhr1`; Supabase project in London; daily **backups** enabled (Supabase → Database → Backups; PITR if on Pro)
- [ ] `DATABASE_URL` is the Supabase **transaction pooler** (port 6543); `MIGRATION_DATABASE_URL` is the **direct** connection (port 5432); `AUTO_MIGRATE` not set (the server and build refuse to start if it is `true`)
- [ ] `npm run db:migrate` run against production; it prints "btree_gist extension and bookings_no_overlap constraint present"
- [ ] `DATA_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET` set to fresh random values and the encryption key stored in a password manager
- [ ] Vercel **Pro** plan (Hobby rejects the 5-minute cron), or an external scheduler calling `/api/cron` every 5 minutes
- [ ] Cron running: Vercel → Project → Cron Jobs shows `/api/cron` succeeding, and the dashboard shows no "Scheduled jobs aren't running" warning
- [ ] Sentry project created (EU data region), `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` set, and a test error seen arriving with no email/phone/body in it
- [ ] Uptime monitor pointed at `https://<domain>/api/health` (alert on non-200); it returns 200 after deploy

## Real business details
- [ ] New business phone and email in `config/business.ts`
- [ ] BASRaT number (if applicable), ICO registration, Instagram, Google review link
- [ ] Hours, caps, policy, prices, durations and voucher prices confirmed in `config/seed-settings.ts`, then `npm run apply:client-details`
- [ ] Real photos (headshot, treatment, clinic, community, boots, cupping) and video clips in `public/media/`
- [ ] Vector logo files in `public/brand/`
- [ ] Real testimonials (with permission) and approved FAQ answers
- [ ] **`npm run check:placeholders -- --production` passes** (exit code 0)

## Email & SMS
- [ ] Resend: sending domain added; **SPF, DKIM and DMARC** records verified; `EMAIL_FROM` uses it
- [ ] Send a test booking and check confirmation (with .ics), reminder and receipt land in inbox, not spam
- [ ] Twilio: UK number or alphanumeric sender ID; `TWILIO_*` set; test SMS received

## Payments
- [ ] Stripe activated; payout account verified
- [ ] Apple Pay domain verified; Google Pay enabled
- [ ] Webhook endpoint added with the 8 events listed in README (checkout ×4, `charge.refunded`, `charge.dispute.*` ×3); `STRIPE_WEBHOOK_SECRET` set
- [ ] **Live** keys in production (`check:placeholders -- --production` rejects test keys)
- [ ] One real payment made and refunded from the dashboard

## Legal & compliance
- [ ] Privacy, terms/cancellation and cookie policies reviewed (remove the `PLACEHOLDER: legal review` comments)
- [ ] ICO registration done
- [ ] VAT position confirmed with an accountant
- [ ] Data retention period confirmed
- [ ] Intake/consent questions reviewed by Christopher

## Dashboard
- [ ] Christopher has signed in, set up 2FA and stored recovery codes
- [ ] Default `ADMIN_PASSWORD` changed
- [ ] Google Calendar connected (optional)
- [ ] Time off / holidays blocked out

## Data
- [ ] **Demo data cleared**: `npm run clear:demo-data` against production
- [ ] Existing Calendly bookings and vouchers imported (see MIGRATION.md)

## Analytics & search
- [ ] Google Business Profile claimed; website + booking link set; category "Sports massage therapist" / "Physical fitness programme" (not "physiotherapist")
- [ ] Google Search Console: domain verified, `sitemap.xml` submitted
- [ ] Privacy-friendly analytics added *only* behind cookie consent (`hasConsent()`), if wanted

## Final
- [ ] `npm run check` passes; Lighthouse mobile ≥ 90 on home, /book and a service page
- [ ] Book, reschedule and cancel a real appointment end-to-end on a phone
- [ ] Instagram link-in-bio switched to `/book`
