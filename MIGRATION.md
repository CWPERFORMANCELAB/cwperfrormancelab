# Migrating from Calendly

Goal: switch to the new site with **no lost bookings, no double bookings, and every sold voucher honoured.**

## 1. Before switch-over (a week ahead)

1. **Turn on "no new bookings past date X" in Calendly**: set each event's *date range* to end on the switch-over
   day, so new bookings after that date can only happen on the new site.
2. **Export future bookings**: Calendly → *Scheduled events* → filter Upcoming → *Export* (CSV), or use the Calendly
   API (`/scheduled_events?status=active&min_start_time=<switch date>`).
3. **Export sold vouchers**: Calendly's voucher events are paid via Stripe. In Stripe → *Payments*, filter by
   description "E-Gift Voucher" to list buyers, amounts and dates. Note any codes already given out.

## 2. Load existing future bookings

Each existing Calendly booking must block its slot in the new system so it can't be double-booked.

- **Few bookings (typical):** Dashboard → Bookings → **New booking** for each one, with payment set to
  **Already paid**. This records what they paid through Calendly (no charge is made), blocks the slot, and sends the
  client a confirmation with their self-service link and reminders from the new system. Admin bookings can be placed
  outside normal hours, but double booking is still prevented.
- **Many bookings:** write a short script that calls `createAdminBooking` (`src/lib/booking/service.ts`) per row with
  `payment: "already_paid"`; the `calendly_import` booking source already exists for tagging them.

Clients keep their Calendly confirmation; the new system sends reminders from now on. Optionally email them a note
that future changes are via the new site (you can trigger a confirmation by rescheduling to the same time).

## 3. Load sold vouchers

Dashboard → **Vouchers → Import vouchers sold via Calendly**, or:

```bash
npm run import:vouchers -- calendly-vouchers.csv
```

CSV columns (header required; only `code` and `value_pounds` are mandatory):

```
code,value_pounds,expires,recipient_name,recipient_email,minutes,balance_pounds
XMAS-JANE,45,2026-12-24,Jane Doe,jane@example.com,30,
```

- If the old vouchers had no codes, create one per buyer (e.g. `CAL-0001`) and email it to them.
- Existing codes are skipped, so re-running is safe.
- Imported vouchers are redeemable at checkout like any other.

## 4. Switch-over day

1. Run through [GO-LIVE.md](GO-LIVE.md).
2. **Instagram link-in-bio**: Instagram → Edit profile → Links → replace the Calendly link with
   `https://<domain>/book` (or `/` for the home page; `/book` converts better from bio taps).
3. Update the link anywhere else: Google Business Profile (website + booking link), Made Running Hub listing,
   WhatsApp Business profile, email signature, any QR codes.
4. In Calendly, replace each event description with "We've moved: book at <domain>/book" and turn events off once
   the last Calendly-booked appointment has passed. Keep the account until then.

## 5. Afterwards

- Watch Dashboard → Overview for the first week; check confirmation emails are arriving (Resend dashboard).
- Cancel the Calendly subscription after the final Calendly-booked appointment.
