import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();
const uuidPk = () => uuid("id").primaryKey().defaultRandom();

/* ------------------------------------------------------------------ enums */

export const bookingStatus = pgEnum("booking_status", [
  "pending_payment", // slot held during checkout
  "confirmed",
  "attended",
  "no_show",
  "late_cancelled",
  "cancelled",
]);
export const bookingSource = pgEnum("booking_source", ["online", "admin", "payment_link", "calendly_import"]);
export const locationType = pgEnum("location_type", ["clinic", "home"]);
export const paymentModel = pgEnum("payment_model", ["full", "deposit", "card_on_file", "insurer", "package"]);
export const paymentKind = pgEnum("payment_kind", ["payment", "deposit", "fee", "setup", "voucher", "package"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "succeeded", "failed", "refunded", "partially_refunded"]);
export const voucherStatus = pgEnum("voucher_status", ["pending", "active", "redeemed", "expired", "void"]);
export const voucherSource = pgEnum("voucher_source", ["online", "calendly_import", "admin"]);
export const notificationChannel = pgEnum("notification_channel", ["email", "sms"]);
export const notificationStatus = pgEnum("notification_status", ["scheduled", "sent", "logged", "failed", "cancelled"]);
export const enquiryStatus = pgEnum("enquiry_status", ["new", "quoted", "booked", "closed"]);
export const serviceCategory = pgEnum("service_category", ["rehab", "recovery", "performance"]);
export const blockSource = pgEnum("block_source", ["manual", "google"]);

/* ------------------------------------------------------------- practice */

export const practitioners = pgTable("practitioners", {
  id: text("id").primaryKey(), // e.g. "christoph-williams"
  name: text("name").notNull(),
  title: text("title").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(), // stable slug-like ID from config/seed-settings.ts
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    slug: text("slug").notNull(),
    category: serviceCategory("category").notNull(),
    pricePence: integer("price_pence").notNull(),
    durationMin: integer("duration_min").notNull(),
    bufferMin: integer("buffer_min").notNull().default(10),
    active: boolean("active").notNull().default(true),
    archivedAt: ts("archived_at"),
    runsConcurrently: boolean("runs_concurrently").notNull().default(false),
    /** null = use paymentDefaults setting */
    paymentModel: paymentModel("payment_model"),
    depositPercent: integer("deposit_percent"),
    taxRateBp: integer("tax_rate_bp"),
    requiredConsents: jsonb("required_consents").$type<string[]>().notNull().default([]),
    availableAtHome: boolean("available_at_home").notNull().default(true),
    featured: boolean("featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    placeholder: boolean("placeholder").notNull().default(false),
    placeholderNote: text("placeholder_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("services_slug_idx").on(t.slug)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  placeholder: boolean("placeholder").notNull().default(false),
  placeholderNote: text("placeholder_note"),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------- clients */

export const clients = pgTable(
  "clients",
  {
    id: uuidPk(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    dob: date("dob", { mode: "string" }),
    /** encrypted JSON { name, phone, relationship } */
    emergencyContactEnc: text("emergency_contact_enc"),
    sport: text("sport"),
    trainingLevel: text("training_level"),
    goals: text("goals"),
    referralSource: text("referral_source"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    marketingOptInAt: ts("marketing_opt_in_at"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** encrypted free text, admin only */
    adminNotesEnc: text("admin_notes_enc"),
    stripeCustomerId: text("stripe_customer_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("clients_email_idx").on(sql`lower(${t.email})`), index("clients_name_idx").on(t.lastName, t.firstName)],
);

export const intakeForms = pgTable("intake_forms", {
  id: uuidPk(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id"),
  /** encrypted JSON: complaint, history, medications, redFlags, under18, guardian … */
  dataEnc: text("data_enc").notNull(),
  /** plaintext summary flags used for admin filtering, no health detail */
  hasRedFlags: boolean("has_red_flags").notNull().default(false),
  isMinor: boolean("is_minor").notNull().default(false),
  consents: jsonb("consents").$type<Record<string, { granted: boolean; at: string; version: string }>>().notNull(),
  guardianConsent: jsonb("guardian_consent").$type<{ name: string; relationship: string; at: string } | null>(),
  createdAt: createdAt(),
});

/** One-time codes letting a returning client prefill their details by proving they own the email. */
export const clientOtps = pgTable("client_otps", {
  id: uuidPk(),
  clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------- bookings */

export const bookings = pgTable(
  "bookings",
  {
    id: uuidPk(),
    practitionerId: text("practitioner_id").notNull().references(() => practitioners.id),
    serviceId: text("service_id").notNull().references(() => services.id),
    clientId: uuid("client_id").references(() => clients.id),
    status: bookingStatus("status").notNull().default("pending_payment"),
    source: bookingSource("source").notNull().default("online"),
    locationType: locationType("location_type").notNull().default("clinic"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    /** copied from the service at creation so later edits don't move existing bookings */
    bufferMin: integer("buffer_min").notNull().default(10),
    /** endsAt + bufferMin. Stored (not computed) so the exclusion constraint uses an immutable range. */
    occupiedUntil: ts("occupied_until").notNull(),
    /** false for services that run concurrently (e.g. boots alongside treatment) — excluded from the overlap constraint */
    blocksTime: boolean("blocks_time").notNull().default(true),
    pricePence: integer("price_pence").notNull(),
    discountPence: integer("discount_pence").notNull().default(0),
    voucherPence: integer("voucher_pence").notNull().default(0),
    paidPence: integer("paid_pence").notNull().default(0),
    feeChargedPence: integer("fee_charged_pence").notNull().default(0),
    paymentModel: paymentModel("payment_model").notNull().default("full"),
    discountCodeId: uuid("discount_code_id"),
    voucherId: uuid("voucher_id"),
    packagePurchaseId: uuid("package_purchase_id"),
    insurerName: text("insurer_name"),
    insurerAuthorisation: text("insurer_authorisation"),
    insurerBalancePence: integer("insurer_balance_pence"),
    holdExpiresAt: ts("hold_expires_at"),
    /** Token given to the browser that created the hold (checkout + confirmation page). */
    holdTokenHash: text("hold_token_hash"),
    /** Token emailed to the client for self-service reschedule/cancel. Rotated on confirmation. */
    manageTokenHash: text("manage_token_hash"),
    clientNotes: text("client_notes"),
    /** encrypted, admin only */
    adminNotesEnc: text("admin_notes_enc"),
    /** encrypted SOAP notes, behind clinicalNotes flag */
    clinicalNotesEnc: text("clinical_notes_enc"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    rescheduledFromId: uuid("rescheduled_from_id"),
    googleEventId: text("google_event_id"),
    homeAddressEnc: text("home_address_enc"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("bookings_starts_idx").on(t.practitionerId, t.startsAt),
    index("bookings_client_idx").on(t.clientId),
    index("bookings_status_idx").on(t.status),
    // Exclusion constraint (no double booking) is added in migrations/0001_constraints.sql — it needs btree_gist.
  ],
);

export const blockedTimes = pgTable(
  "blocked_times",
  {
    id: uuidPk(),
    practitionerId: text("practitioner_id").notNull().references(() => practitioners.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    reason: text("reason"),
    source: blockSource("source").notNull().default("manual"),
    externalId: text("external_id"),
    createdAt: createdAt(),
  },
  (t) => [index("blocked_range_idx").on(t.practitionerId, t.startsAt, t.endsAt), uniqueIndex("blocked_external_idx").on(t.source, t.externalId)],
);

/* ------------------------------------------------------------- payments */

export const payments = pgTable(
  "payments",
  {
    id: uuidPk(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    voucherId: uuid("voucher_id"),
    packagePurchaseId: uuid("package_purchase_id"),
    clientId: uuid("client_id").references(() => clients.id),
    provider: text("provider").notNull(), // "stripe" | "mock" | "manual"
    providerSessionId: text("provider_session_id"),
    providerPaymentId: text("provider_payment_id"),
    providerPaymentMethodId: text("provider_payment_method_id"),
    kind: paymentKind("kind").notNull().default("payment"),
    amountPence: integer("amount_pence").notNull(),
    refundedPence: integer("refunded_pence").notNull().default(0),
    taxPence: integer("tax_pence").notNull().default(0),
    currency: text("currency").notNull().default("gbp"),
    status: paymentStatus("status").notNull().default("pending"),
    description: text("description"),
    receiptNumber: text("receipt_number"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("payments_session_idx").on(t.providerSessionId), index("payments_booking_idx").on(t.bookingId)],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuidPk(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id),
    amountPence: integer("amount_pence").notNull(),
    reason: text("reason"),
    /** Stripe refund id (re_…). Unique, so a webhook can never record the same refund twice. */
    providerRefundId: text("provider_refund_id"),
    status: text("status").notNull().default("succeeded"),
    automatic: boolean("automatic").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("refunds_provider_refund_idx").on(t.providerRefundId)],
);

/** Chargebacks raised by a client's bank (charge.dispute.* webhooks). */
export const disputes = pgTable(
  "disputes",
  {
    id: uuidPk(),
    providerDisputeId: text("provider_dispute_id").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    amountPence: integer("amount_pence").notNull(),
    reason: text("reason"),
    status: text("status").notNull(), // Stripe status: warning_needs_response | needs_response | under_review | won | lost …
    evidenceDueBy: ts("evidence_due_by"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("disputes_provider_idx").on(t.providerDisputeId), index("disputes_payment_idx").on(t.paymentId)],
);

export const vouchers = pgTable(
  "vouchers",
  {
    id: uuidPk(),
    code: text("code").notNull(),
    productId: text("product_id"),
    minutes: integer("minutes"),
    initialPence: integer("initial_pence").notNull(),
    balancePence: integer("balance_pence").notNull(),
    purchaserName: text("purchaser_name"),
    purchaserEmail: text("purchaser_email"),
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email"),
    message: text("message"),
    status: voucherStatus("status").notNull().default("pending"),
    source: voucherSource("source").notNull().default("online"),
    expiresAt: ts("expires_at").notNull(),
    paymentId: uuid("payment_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("vouchers_code_idx").on(t.code)],
);

export const voucherRedemptions = pgTable("voucher_redemptions", {
  id: uuidPk(),
  voucherId: uuid("voucher_id").notNull().references(() => vouchers.id),
  bookingId: uuid("booking_id").notNull().references(() => bookings.id),
  amountPence: integer("amount_pence").notNull(),
  reversedAt: ts("reversed_at"),
  createdAt: createdAt(),
});

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuidPk(),
    code: text("code").notNull(),
    kind: text("kind").notNull(), // "percent" | "fixed"
    value: integer("value").notNull(), // percent or pence
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    validFrom: ts("valid_from"),
    validTo: ts("valid_to"),
    serviceIds: jsonb("service_ids").$type<string[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("discount_codes_code_idx").on(sql`upper(${t.code})`)],
);

export const paymentLinks = pgTable(
  "payment_links",
  {
    id: uuidPk(),
    token: text("token").notNull(),
    clientId: uuid("client_id").references(() => clients.id),
    serviceId: text("service_id").references(() => services.id),
    enquiryId: uuid("enquiry_id"),
    startsAt: ts("starts_at"),
    locationType: locationType("location_type").notNull().default("clinic"),
    amountPence: integer("amount_pence").notNull(),
    description: text("description").notNull(),
    recipientName: text("recipient_name"),
    recipientEmail: text("recipient_email"),
    status: text("status").notNull().default("open"), // open | paid | expired | cancelled
    bookingId: uuid("booking_id"),
    expiresAt: ts("expires_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_links_token_idx").on(t.token)],
);

/* ------------------------------------------------------------ packages (flag) */

export const packages = pgTable("packages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  serviceId: text("service_id").references(() => services.id),
  credits: integer("credits").notNull(),
  pricePence: integer("price_pence").notNull(),
  validityDays: integer("validity_days").notNull().default(365),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const packagePurchases = pgTable("package_purchases", {
  id: uuidPk(),
  /** Code the client enters at checkout to use a credit. */
  code: text("code").unique(),
  status: text("status").notNull().default("pending"), // pending | active | void
  packageId: text("package_id").notNull().references(() => packages.id),
  clientId: uuid("client_id").notNull().references(() => clients.id),
  creditsTotal: integer("credits_total").notNull(),
  creditsRemaining: integer("credits_remaining").notNull(),
  expiresAt: ts("expires_at").notNull(),
  paymentId: uuid("payment_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------ enquiries */

export const enquiries = pgTable("enquiries", {
  id: uuidPk(),
  kind: text("kind").notNull(), // "home_visit" | "contact"
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  postcode: text("postcode"),
  serviceId: text("service_id"),
  preferredTimes: text("preferred_times"),
  message: text("message"),
  status: enquiryStatus("status").notNull().default("new"),
  quotePence: integer("quote_pence"),
  paymentLinkId: uuid("payment_link_id"),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

/* -------------------------------------------------------- notifications */

export const notificationTemplates = pgTable("notification_templates", {
  key: text("key").primaryKey(),
  channel: notificationChannel("channel").notNull(),
  name: text("name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: updatedAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: uuidPk(),
    channel: notificationChannel("channel").notNull(),
    templateKey: text("template_key").notNull(),
    to: text("to").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    html: text("html"),
    attachments: jsonb("attachments").$type<{ filename: string; content: string; contentType: string }[]>(),
    bookingId: uuid("booking_id"),
    clientId: uuid("client_id"),
    /** extra template variables captured at enqueue time (voucher code, refund line, enquiry details…) */
    vars: jsonb("vars").$type<Record<string, string>>().notNull().default({}),
    /** dedupe key e.g. "reminder-48h:<bookingId>" */
    dedupeKey: text("dedupe_key"),
    status: notificationStatus("status").notNull().default("scheduled"),
    scheduledFor: ts("scheduled_for").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    providerId: text("provider_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_due_idx").on(t.status, t.scheduledFor), uniqueIndex("notifications_dedupe_idx").on(t.dedupeKey)],
);

/* ----------------------------------------------------------- admin/auth */

export const adminUsers = pgTable("admin_users", {
  id: uuidPk(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  totpSecretEnc: text("totp_secret_enc"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  recoveryCodesHash: jsonb("recovery_codes_hash").$type<string[]>().notNull().default([]),
  lastLoginAt: ts("last_login_at"),
  previousLoginAt: ts("previous_login_at"),
  createdAt: createdAt(),
});

export const adminSessions = pgTable("admin_sessions", {
  id: uuidPk(),
  userId: uuid("user_id").notNull().references(() => adminUsers.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  mfaVerified: boolean("mfa_verified").notNull().default(false),
  ip: text("ip"),
  userAgent: text("user_agent"),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuidPk(),
    actor: text("actor").notNull(), // admin email | "system" | "client"
    action: text("action").notNull(), // "booking.cancel", "client.view", …
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_created_idx").on(t.createdAt)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // provider event id
  provider: text("provider").notNull(),
  type: text("type").notNull(),
  processedAt: ts("processed_at"),
  error: text("error"),
  createdAt: createdAt(),
});

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

export const calendarConnections = pgTable("calendar_connections", {
  id: uuidPk(),
  practitionerId: text("practitioner_id").notNull().references(() => practitioners.id),
  provider: text("provider").notNull().default("google"),
  accountEmail: text("account_email"),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  calendarId: text("calendar_id").notNull().default("primary"),
  syncToken: text("sync_token"),
  lastSyncedAt: ts("last_synced_at"),
  lastError: text("last_error"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------ relations */

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  service: one(services, { fields: [bookings.serviceId], references: [services.id] }),
  client: one(clients, { fields: [bookings.clientId], references: [clients.id] }),
  practitioner: one(practitioners, { fields: [bookings.practitionerId], references: [practitioners.id] }),
  payments: many(payments),
}));
export const clientsRelations = relations(clients, ({ many }) => ({
  bookings: many(bookings),
  intakeForms: many(intakeForms),
  payments: many(payments),
}));
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
  client: one(clients, { fields: [payments.clientId], references: [clients.id] }),
  refunds: many(refunds),
}));
export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, { fields: [refunds.paymentId], references: [payments.id] }),
}));
export const intakeFormsRelations = relations(intakeForms, ({ one }) => ({
  client: one(clients, { fields: [intakeForms.clientId], references: [clients.id] }),
}));
export const servicesRelations = relations(services, ({ many }) => ({ bookings: many(bookings) }));

export type Service = typeof services.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Voucher = typeof vouchers.$inferSelect;
export type BlockedTime = typeof blockedTimes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Enquiry = typeof enquiries.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
