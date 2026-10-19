# Your booking system: a quick guide for Christopher

Your dashboard is at **yourdomain/admin**. It works on your phone too: the main sections are in the bar at the bottom.

## Signing in
- Enter your email and password, then the 6-digit code from your authenticator app.
- Lost your phone? Use one of the recovery codes you saved when you set up 2FA. Each works once.
- Change your password: **Settings → Account & security**.

## Your day at a glance
**Overview** shows today's appointments, how full the next 7 days are against your daily limit, and money in for
today, this week or this month (with a comparison to the previous period). "New since your last login" lists
bookings that came in while you were away.

## Bookings
- **Calendar:** Bookings → Day or Week. Tap an appointment to open it.
- **After a session:** open it and tap **Attended**. If they didn't turn up, tap **No-show**; if they cancelled
  late, tap **Late cancel**. With "Apply policy fee" ticked, the fee is kept or charged automatically.
- **Move an appointment:** open it → *Reschedule* → pick the new date/time. The client gets an email.
- **Cancel:** open it → *Cancel*. Leave the box unticked for a full refund (e.g. you're ill); tick it to apply your
  cancellation policy (client asked late).
- **Add a booking yourself** (phone/WhatsApp/in person): Bookings → **New booking**. Choose how they'll pay:
  - *Send payment link*: they get an email to pay; the slot is held for 48 hours.
  - *Pay in clinic*: booked straight away.
  - *Charge saved card*: if they've paid online before.
  - *Already paid*: just records it.
- Clients can reschedule or cancel themselves from the link in their email, within your policy.

## Time off & holidays
Bookings → **Time off** → pick dates/times → **Block out time**. Nobody can book those times online. (Existing
bookings aren't moved; reschedule or cancel them yourself.) If you've connected Google Calendar
(**Settings → Google Calendar**), anything in your personal calendar blocks booking times automatically.

## Refunds
Open the booking → in **Payment**, enter the amount → **Refund**. It goes back to their card in 5–10 working days.
Cancellations made by clients are refunded automatically according to your policy.

## Clients
- **Clients** lists everyone with visits, spend, voucher balance and marketing consent. Search, filter by tag or
  segment (new, regulars, lapsed) and **Export CSV**.
- Open a client to see their bookings, payments, intake and consent forms. Add **private notes** and **tags**.
- Health information is encrypted and every time you open a record it's logged (that's a GDPR requirement).
- If a client asks for their data: **Export data**. If they ask to be deleted: **Erase client** (payment records
  are kept because the law requires it).

## Red flags
If a client answers "yes" to a health screening question, their booking shows a red banner. Read it before the
session and contact them if needed.

## Gift vouchers
- Sold on the website automatically; the buyer (and recipient, if given) get an e-voucher with a unique code.
- **Vouchers → Create a voucher** to make one by hand (e.g. a raffle prize).
- **Import vouchers sold via Calendly** so old vouchers still work.
- Clients enter the code at checkout. Any leftover balance stays on the code.

## Home visits
Requests appear in **Enquiries** (you also get an email). Open one → check the distance → **Send quote & payment
link** with your price (add a date/time to hold the slot). Once they pay, it's in your calendar.

## Editing services, prices and hours
- **Settings → Services & prices**: price, duration, gap after the session ("buffer"), whether it's bookable online,
  home visits, payment type.
- **Settings**: working hours and daily limits, notice period, cancellation policy, voucher prices, reminders.
- **Settings → Emails & SMS**: change the wording of any message. Words in `{{double braces}}` are filled in
  automatically, so leave them as they are.
- **Settings → Discount codes**: e.g. `RUNCLUB10` for 10% off.

Changes appear on the website straight away. Tell your developer about changes you want to keep permanently so
they're saved in the configuration too.

## Insights
**Insights** shows new vs returning clients, how many rebook within 30 days, average sessions and spend per client,
where clients hear about you, your most profitable services, and your busiest days and times.

## If something looks wrong
- A payment that went through but the time was taken by someone else is **refunded automatically** and you're
  emailed. Contact the client to rebook.
- Anything else: **Settings → Audit log** shows every change and who made it.
