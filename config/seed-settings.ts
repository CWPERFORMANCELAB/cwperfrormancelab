/**
 * SINGLE SOURCE OF TRUTH for DB-backed business settings and the service catalogue.
 *
 * - Applied on first run and by `npm run apply:client-details` (upserts by stable ID, archives removed services,
 *   never touches bookings/clients/payments).
 * - Everything here is also editable in /admin/settings. Re-running apply:client-details overwrites dashboard edits
 *   for the keys in this file, so update this file first when the client confirms details.
 * - `placeholder: true` marks values awaiting client confirmation (listed in CLIENT_TODO.md,
 *   checked by `npm run check:placeholders`).
 */
import { business } from "./business";
import type { SeedService, SettingKey, Settings } from "@/lib/settings-schema";

export type SeedSetting<K extends SettingKey = SettingKey> = {
  key: K;
  value: Settings[K];
  placeholder: boolean;
  placeholderNote?: string;
};

function setting<K extends SettingKey>(s: SeedSetting<K>): SeedSetting<K> {
  return s;
}

export const seedSettings = [
  setting({
    key: "workingHours",
    placeholder: true, // PLACEHOLDER: confirm working hours
    placeholderNote: "Mon–Fri 08:00–19:00, Sat 09:00–15:00, Sun closed are assumptions.",
    value: {
      0: [],
      1: [{ open: "08:00", close: "19:00" }],
      2: [{ open: "08:00", close: "19:00" }],
      3: [{ open: "08:00", close: "19:00" }],
      4: [{ open: "08:00", close: "19:00" }],
      5: [{ open: "08:00", close: "19:00" }],
      6: [{ open: "09:00", close: "15:00" }],
    },
  }),
  setting({
    key: "dailyCaps",
    placeholder: false, // confirmed: 5 on weekdays, 7 on Saturdays
    value: { 0: 0, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 7 },
  }),
  setting({
    key: "bookingRules",
    placeholder: false, // confirmed: 3h notice, no booking-window limit, 5–10 min buffers (default 10)
    value: { minNoticeHours: 3, maxAdvanceDays: null, slotIntervalMin: 15, holdMinutes: 10, defaultBufferMin: 10 },
  }),
  setting({
    key: "cancellationPolicy",
    placeholder: true, // PLACEHOLDER: confirm cancellation policy and fees
    placeholderNote: "Assumed: free with 24h+ notice; <24h or no-show = 50%; reschedule up to 24h before.",
    value: { freeCancelHours: 24, lateCancelFeePercent: 50, noShowFeePercent: 50, rescheduleDeadlineHours: 24 },
  }),
  setting({
    key: "paymentDefaults",
    placeholder: true, // PLACEHOLDER: confirm payment model (full upfront assumed) and VAT position with accountant
    placeholderNote: "Pay in full upfront assumed. VAT set to none — confirm with an accountant.",
    value: { model: "full", depositPercent: 50, defaultTaxRateBp: 0 },
  }),
  setting({
    key: "vouchers",
    placeholder: true, // PLACEHOLDER: confirm voucher prices and expiry (Calendly currently shows £45/£65/£95)
    placeholderNote: "Brief placeholders: 30 min £35 / 60 min £60 / 90 min £85, 12-month expiry.",
    value: {
      expiryMonths: 12,
      products: [
        { id: "voucher-30", name: "30 Minute Massage E-Gift Voucher", minutes: 30, pricePence: 3500, active: true },
        { id: "voucher-60", name: "60 Minute Massage E-Gift Voucher", minutes: 60, pricePence: 6000, active: true },
        { id: "voucher-90", name: "90 Minute Massage E-Gift Voucher", minutes: 90, pricePence: 8500, active: true },
      ],
    },
  }),
  setting({
    key: "features",
    placeholder: false,
    value: {
      packages: false,
      insuranceBookings: false,
      clinicalNotes: false,
      smsReminders: true,
      homeVisits: true,
      googleCalendarSync: true,
    },
  }),
  setting({
    key: "notifications",
    placeholder: true, // PLACEHOLDER: confirm follow-up timings, rehab video link and alert email
    placeholderNote: "Reminders 48h + 2h; thank-you 2h after; review request 24h after first visit; rebook nudge 21 days; lapsed 90 days.",
    value: {
      reminderHoursBefore: [48, 2],
      thankYouDelayHours: 2,
      reviewRequestDelayHours: 24,
      rebookNudgeDays: 21,
      lapsedClientDays: 90,
      adminAlertEmail: business.contact.email,
      adminAlertSms: false,
      rehabVideosUrl: "", // PLACEHOLDER: link to rehab video library (YouTube/Instagram/Drive)
    },
  }),
  setting({
    key: "compliance",
    placeholder: true, // PLACEHOLDER: confirm data retention period
    placeholderNote: "8 years for adults (typical UK clinical guidance); under-18 records kept until age 25.",
    value: { dataRetentionYears: 8, under18RetentionUntilAge: 25 },
  }),
] as const satisfies readonly SeedSetting[];

/**
 * Service catalogue. Prices confirmed from Calendly; durations are placeholders.
 * IDs are stable — never rename an ID, archive the service and add a new one instead.
 */
const durationPlaceholder = "Duration is a placeholder — confirm with client.";

export const seedServices: SeedService[] = [
  {
    id: "injury-assessment",
    name: "Injury Assessment & Treatment + Rehab Plan",
    shortName: "Injury Assessment",
    slug: "injury-assessment-and-treatment",
    category: "rehab",
    pricePence: 6500,
    durationMin: 60,
    bufferMin: 10,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["treatment"],
    availableAtHome: true,
    featured: true,
    sortOrder: 10,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
  {
    id: "full-body-mot",
    name: "Full Body MOT",
    shortName: "Full Body MOT",
    slug: "full-body-mot",
    category: "rehab",
    pricePence: 9000,
    durationMin: 75,
    bufferMin: 10,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["treatment"],
    availableAtHome: true,
    featured: false,
    sortOrder: 20,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
  {
    id: "sports-massage",
    name: "Sports Massage",
    shortName: "Sports Massage",
    slug: "sports-massage",
    category: "recovery",
    pricePence: 6000,
    durationMin: 60,
    bufferMin: 10,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["treatment"],
    availableAtHome: true,
    featured: true,
    sortOrder: 30,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
  {
    id: "assisted-stretching",
    name: "Assisted Stretching",
    shortName: "Assisted Stretching",
    slug: "assisted-stretching",
    category: "recovery",
    pricePence: 5000,
    durationMin: 45,
    bufferMin: 10,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["treatment"],
    availableAtHome: true,
    featured: false,
    sortOrder: 40,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
  {
    id: "dry-cupping",
    name: "Dry Cupping",
    shortName: "Dry Cupping",
    slug: "dry-cupping",
    category: "recovery",
    pricePence: 4000,
    durationMin: 30,
    bufferMin: 10,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["treatment", "dry_cupping"],
    availableAtHome: true,
    featured: false,
    sortOrder: 50,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
  {
    id: "compression-boots",
    name: "Compression Boots Recovery Session",
    shortName: "Compression Boots",
    slug: "compression-boots-recovery",
    category: "recovery",
    pricePence: 2500,
    durationMin: 30,
    bufferMin: 5,
    active: true,
    runsConcurrently: false, // PLACEHOLDER: blocks his time like any other session until confirmed otherwise
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["compression_boots"],
    availableAtHome: false,
    featured: false,
    sortOrder: 60,
    placeholder: true,
    placeholderNote: `${durationPlaceholder} Calendly lists this as 20 minutes.`,
  },
  {
    id: "compression-boots-extended",
    name: "Compression Boots Recovery Session (Extended)",
    shortName: "Compression Boots (Extended)",
    slug: "compression-boots-recovery-extended",
    category: "recovery",
    pricePence: 4000,
    durationMin: 40,
    bufferMin: 5,
    active: true,
    runsConcurrently: false,
    paymentModel: null,
    depositPercent: null,
    taxRateBp: null,
    requiredConsents: ["compression_boots"],
    availableAtHome: false,
    featured: false,
    sortOrder: 70,
    placeholder: true,
    placeholderNote: durationPlaceholder,
  },
];

export const seedPractitioner = {
  id: business.practitioner.id,
  name: business.practitioner.name,
  title: business.practitioner.title,
  active: true,
};
