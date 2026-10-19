import { z } from "zod";

/**
 * Zod schemas for every DB-backed setting. The admin settings page and the seed are both driven by this file:
 * add a key here + a value in config/seed-settings.ts and it appears in /admin/settings.
 */

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const hoursRange = z.object({ open: hhmm, close: hhmm });

/** Index 0 = Sunday … 6 = Saturday, to match Date#getDay(). Empty array = closed. */
export const workingHoursSchema = z.object({
  0: z.array(hoursRange),
  1: z.array(hoursRange),
  2: z.array(hoursRange),
  3: z.array(hoursRange),
  4: z.array(hoursRange),
  5: z.array(hoursRange),
  6: z.array(hoursRange),
});

export const settingsSchemas = {
  workingHours: workingHoursSchema,

  /** Max appointments per local calendar day, index 0 = Sunday … 6 = Saturday. */
  dailyCaps: z.object({
    0: z.number().int().min(0),
    1: z.number().int().min(0),
    2: z.number().int().min(0),
    3: z.number().int().min(0),
    4: z.number().int().min(0),
    5: z.number().int().min(0),
    6: z.number().int().min(0),
  }),

  bookingRules: z.object({
    minNoticeHours: z.number().min(0),
    /** null = no limit */
    maxAdvanceDays: z.number().int().positive().nullable(),
    slotIntervalMin: z.number().int().min(5).max(60),
    holdMinutes: z.number().int().min(3).max(30),
    defaultBufferMin: z.number().int().min(0).max(60),
  }),

  cancellationPolicy: z.object({
    freeCancelHours: z.number().min(0),
    lateCancelFeePercent: z.number().min(0).max(100),
    noShowFeePercent: z.number().min(0).max(100),
    rescheduleDeadlineHours: z.number().min(0),
  }),

  paymentDefaults: z.object({
    model: z.enum(["full", "deposit", "card_on_file"]),
    depositPercent: z.number().min(1).max(100),
    /** Basis points, 0 = no VAT. Per-service override on the services table. */
    defaultTaxRateBp: z.number().int().min(0).max(10000),
  }),

  vouchers: z.object({
    products: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        minutes: z.number().int().positive(),
        pricePence: z.number().int().positive(),
        active: z.boolean(),
      }),
    ),
    expiryMonths: z.number().int().positive(),
  }),

  features: z.object({
    packages: z.boolean(),
    insuranceBookings: z.boolean(),
    clinicalNotes: z.boolean(),
    smsReminders: z.boolean(),
    homeVisits: z.boolean(),
    googleCalendarSync: z.boolean(),
  }),

  notifications: z.object({
    reminderHoursBefore: z.array(z.number().positive()),
    thankYouDelayHours: z.number().min(0),
    reviewRequestDelayHours: z.number().min(0),
    rebookNudgeDays: z.number().int().positive(),
    lapsedClientDays: z.number().int().positive(),
    adminAlertEmail: z.string().email(),
    adminAlertSms: z.boolean(),
    rehabVideosUrl: z.string(),
  }),

  compliance: z.object({
    dataRetentionYears: z.number().int().positive(),
    under18RetentionUntilAge: z.number().int().positive(),
  }),
} as const;

export type SettingKey = keyof typeof settingsSchemas;
export type Settings = { [K in SettingKey]: z.infer<(typeof settingsSchemas)[K]> };
export type SettingValue<K extends SettingKey> = Settings[K];

export const settingKeys = Object.keys(settingsSchemas) as SettingKey[];

/** Human labels + help for the admin settings UI. */
export const settingMeta: Record<SettingKey, { label: string; help: string }> = {
  workingHours: { label: "Working hours", help: "Bookable hours per weekday in local time. Leave a day empty to close it." },
  dailyCaps: { label: "Daily appointment caps", help: "Maximum appointments per day. 0 = closed." },
  bookingRules: { label: "Booking rules", help: "Notice, booking window, slot interval and checkout hold." },
  cancellationPolicy: { label: "Cancellation & rescheduling", help: "Shown at checkout and in emails; enforced automatically." },
  paymentDefaults: { label: "Payments", help: "Default payment model and VAT. Services can override." },
  vouchers: { label: "Gift vouchers", help: "Voucher products and expiry." },
  features: { label: "Feature flags", help: "Turn optional modules on or off." },
  notifications: { label: "Notifications & automations", help: "Reminder timing, follow-ups and admin alerts." },
  compliance: { label: "Data retention", help: "How long client records are kept." },
};

export const serviceCategories = ["rehab", "recovery", "performance"] as const;
export type ServiceCategory = (typeof serviceCategories)[number];
export const paymentModels = ["full", "deposit", "card_on_file"] as const;
export type PaymentModel = (typeof paymentModels)[number];
export const consentKinds = ["treatment", "dry_cupping", "compression_boots"] as const;
export type ConsentKind = (typeof consentKinds)[number];

export const seedServiceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  shortName: z.string(),
  slug: z.string(),
  category: z.enum(serviceCategories),
  pricePence: z.number().int().min(0),
  durationMin: z.number().int().positive(),
  bufferMin: z.number().int().min(0),
  active: z.boolean(),
  runsConcurrently: z.boolean(),
  paymentModel: z.enum(paymentModels).nullable(),
  depositPercent: z.number().nullable(),
  taxRateBp: z.number().int().nullable(),
  requiredConsents: z.array(z.enum(consentKinds)),
  availableAtHome: z.boolean(),
  featured: z.boolean(),
  sortOrder: z.number().int(),
  placeholder: z.boolean(),
  placeholderNote: z.string().optional(),
});
export type SeedService = z.infer<typeof seedServiceSchema>;
