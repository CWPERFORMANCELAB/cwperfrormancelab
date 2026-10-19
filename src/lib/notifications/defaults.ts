/**
 * Default notification templates, seeded into `notification_templates` and editable in the dashboard.
 * Variables use {{name}} and are filled from config/business.ts + the booking. Unknown variables render empty.
 *
 * Available variables: businessName, practitionerName, practitionerFirstName, clientFirstName, serviceName,
 * startLong, startTime, duration, address, parkingNote, mapsUrl, manageUrl, policySummary, price, amount,
 * reviewUrl, rehabVideosUrl, bookUrl, voucherCode, voucherValue, voucherExpiry, recipientName, message, phone,
 * email, siteUrl, enquiryName, enquiryPostcode, adminUrl.
 */
export type TemplateDefault = { key: string; channel: "email" | "sms"; name: string; subject?: string; body: string };

export const defaultTemplates: TemplateDefault[] = [
  {
    key: "booking_confirmed",
    channel: "email",
    name: "Booking confirmation",
    subject: "You're booked in: {{serviceName}}, {{startLong}}",
    body: `Hi {{clientFirstName}},

You're booked in for {{serviceName}} with {{practitionerName}} on {{startLong}} ({{duration}}).

Where: {{address}}
{{parkingNote}}
Directions: {{mapsUrl}}

Before you come: please wear comfortable clothing that lets you move easily, and bring shorts if you can. It makes it easier to assess and treat the area.

Paid: {{amount}}

Cancellation policy: {{policySummary}}

Need to reschedule or cancel? Use your secure link: {{manageUrl}}

See you soon,
{{practitionerFirstName}}
{{businessName}}`,
  },
  {
    key: "booking_confirmed_sms",
    channel: "sms",
    name: "Booking confirmation (SMS)",
    body: "{{businessName}}: you're booked for {{serviceName}} on {{startLong}} at {{address}}. Free parking outside. Manage: {{manageUrl}}",
  },
  {
    key: "reminder_48h",
    channel: "email",
    name: "Reminder: 48 hours before",
    subject: "See you {{startLong}}",
    body: `Hi {{clientFirstName}},

A quick reminder that you're booked in for {{serviceName}} on {{startLong}} at {{address}}.

Wear comfortable clothing and bring shorts if you can. {{parkingNote}}

Need to change it? {{manageUrl}}
{{policySummary}}

{{practitionerFirstName}}`,
  },
  {
    key: "reminder_2h_sms",
    channel: "sms",
    name: "Reminder: 2 hours before (SMS)",
    body: "Reminder: {{serviceName}} with {{practitionerFirstName}} today at {{startTime}}, {{address}}. Free parking outside. See you soon!",
  },
  {
    key: "booking_rescheduled",
    channel: "email",
    name: "Reschedule confirmation",
    subject: "Your appointment has moved to {{startLong}}",
    body: `Hi {{clientFirstName}},

Your {{serviceName}} appointment has been moved to {{startLong}} at {{address}}.

Manage your booking: {{manageUrl}}

{{practitionerFirstName}}`,
  },
  {
    key: "booking_cancelled",
    channel: "email",
    name: "Cancellation confirmation",
    subject: "Your appointment has been cancelled",
    body: `Hi {{clientFirstName}},

Your {{serviceName}} appointment on {{startLong}} has been cancelled.

{{refundLine}}

Whenever you're ready, you can book again here: {{bookUrl}}

{{practitionerFirstName}}`,
  },
  {
    key: "after_session_thanks",
    channel: "email",
    name: "Thank you after a session",
    subject: "Thanks for coming in today",
    body: `Hi {{clientFirstName}},

Thanks for coming in today. Keep up with your rehab between sessions; your exercise videos are here: {{rehabVideosUrl}}

If anything flares up or you have questions, just reply to this email.

Ready for your next session? {{bookUrl}}

{{practitionerFirstName}}`,
  },
  {
    key: "review_request",
    channel: "email",
    name: "Google review request (after first visit)",
    subject: "Would you leave a quick review?",
    body: `Hi {{clientFirstName}},

I hope you're feeling the benefit of your first session. If you have a minute, a Google review makes a huge difference to a small independent clinic like mine:

{{reviewUrl}}

Thank you!
{{practitionerFirstName}}`,
  },
  {
    key: "rebook_nudge",
    channel: "email",
    name: "Rebooking nudge",
    subject: "How's it feeling, {{clientFirstName}}?",
    body: `Hi {{clientFirstName}},

It's been a little while since your last session. Consistency is what turns good rehab into lasting results, so if you'd like to keep progressing, you can book your next session here:

{{bookUrl}}

{{practitionerFirstName}}`,
  },
  {
    key: "lapsed_client",
    channel: "email",
    name: "Lapsed client reactivation (marketing opt-ins only)",
    subject: "Ready to get moving again?",
    body: `Hi {{clientFirstName}},

It's been a while! Whether you're training for your next race or just want to feel better, I'd love to help you get back on track.

Book a session: {{bookUrl}}

{{practitionerFirstName}}
{{businessName}}

You're receiving this because you opted in to updates. Unsubscribe: {{unsubscribeUrl}}`,
  },
  {
    key: "voucher_purchased",
    channel: "email",
    name: "Gift voucher (to recipient / purchaser)",
    subject: "Your {{businessName}} gift voucher",
    body: `Hi {{recipientName}},

You've been given a {{voucherValue}} gift voucher for {{businessName}}.

{{message}}

Your code: {{voucherCode}}
Valid until: {{voucherExpiry}}

View or print your e-voucher: {{voucherUrl}}

Redeem it when you book online: {{bookUrl}}`,
  },
  {
    key: "payment_link",
    channel: "email",
    name: "Payment link (home visit / phone booking)",
    subject: "Your booking with {{businessName}}",
    body: `Hi {{clientFirstName}},

Here's your secure link to confirm and pay for {{serviceName}} ({{amount}}):

{{paymentUrl}}

{{policySummary}}

{{practitionerFirstName}}`,
  },
  {
    key: "enquiry_received",
    channel: "email",
    name: "Home visit enquiry received (to client)",
    subject: "Thanks for your enquiry",
    body: `Hi {{enquiryName}},

Thanks for your home visit enquiry. I'll reply with a personalised quote shortly, usually within one working day.

{{practitionerFirstName}}
{{businessName}}`,
  },
  {
    key: "returning_code",
    channel: "email",
    name: "Returning client verification code",
    subject: "Your {{businessName}} code: {{code}}",
    body: `Hi {{clientFirstName}},

Your code to fetch your details is: {{code}}

It expires in 10 minutes. If you didn't ask for this, you can ignore this email.`,
  },
  {
    key: "receipt",
    channel: "email",
    name: "Payment receipt",
    subject: "Receipt {{receiptNumber}}",
    body: `Receipt {{receiptNumber}}
{{receiptDate}}

{{receiptDescription}}
{{receiptAppointment}}

Amount paid: {{receiptAmount}}
{{receiptVat}}

{{legalName}}
{{practitionerName}}, Sport Rehabilitator
{{regulatorLine}}
{{address}}`,
  },
  {
    key: "admin_dispute",
    channel: "email",
    name: "Admin alert: payment disputed (chargeback)",
    subject: "Action needed: {{clientFullName}} disputed a {{disputeAmount}} payment",
    body: `A client's bank has opened a dispute (chargeback).

Client: {{clientFullName}}
Amount: {{disputeAmount}}
Reason: {{disputeReason}}
Status: {{disputeStatus}}
Respond with evidence by: {{evidenceDueBy}}

Respond in the Stripe dashboard (Payments → Disputes) with booking details, intake/consent and attendance records. Dashboard: {{adminUrl}}`,
  },
  {
    key: "admin_dispute_closed",
    channel: "email",
    name: "Admin alert: dispute closed",
    subject: "Dispute closed: {{disputeStatus}} ({{disputeAmount}})",
    body: "The dispute from {{clientFullName}} for {{disputeAmount}} has closed with status: {{disputeStatus}}.\n\n{{adminUrl}}",
  },
  {
    key: "admin_sca_fee",
    channel: "email",
    name: "Admin alert: card needs authentication",
    subject: "{{clientFullName}}'s card needs authentication for {{amount}}",
    body: `The saved card for {{clientFullName}} couldn't be charged {{amount}} ({{feeDescription}}) because their bank requires them to authenticate the payment.

We've emailed them a secure payment link for the same amount. You'll see it under Dashboard → Payments → "Waiting for client" until it's paid.

{{adminUrl}}`,
  },
  {
    key: "admin_ops_alert",
    channel: "email",
    name: "Admin alert: system problem",
    subject: "System alert: {{alertTitle}}",
    body: "{{alertBody}}\n\nThis is an automatic alert from your booking system. If it keeps happening, contact your developer.",
  },
  {
    key: "admin_new_booking",
    channel: "email",
    name: "Admin alert: new booking",
    subject: "New booking: {{serviceName}}, {{startLong}}",
    body: "{{clientFullName}} booked {{serviceName}} for {{startLong}}. Paid {{amount}}.\n\n{{adminUrl}}",
  },
  {
    key: "admin_cancellation",
    channel: "email",
    name: "Admin alert: cancellation",
    subject: "Cancelled: {{serviceName}}, {{startLong}}",
    body: "{{clientFullName}} cancelled {{serviceName}} on {{startLong}}. {{refundLine}}\n\n{{adminUrl}}",
  },
  {
    key: "admin_voucher_sale",
    channel: "email",
    name: "Admin alert: voucher sold",
    subject: "Voucher sold: {{voucherValue}}",
    body: "A {{voucherValue}} gift voucher ({{voucherCode}}) was bought.\n\n{{adminUrl}}",
  },
  {
    key: "admin_enquiry",
    channel: "email",
    name: "Admin alert: home visit enquiry",
    subject: "Home visit enquiry from {{enquiryName}}",
    body: "{{enquiryName}} ({{enquiryPostcode}}) asked about a home visit.\n\n{{message}}\n\n{{adminUrl}}",
  },
];
