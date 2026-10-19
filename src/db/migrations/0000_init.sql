CREATE TYPE "public"."block_source" AS ENUM('manual', 'google');--> statement-breakpoint
CREATE TYPE "public"."booking_source" AS ENUM('online', 'admin', 'payment_link', 'calendly_import');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'attended', 'no_show', 'late_cancelled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."enquiry_status" AS ENUM('new', 'quoted', 'booked', 'closed');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('clinic', 'home');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('scheduled', 'sent', 'logged', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('payment', 'deposit', 'fee', 'setup', 'voucher', 'package');--> statement-breakpoint
CREATE TYPE "public"."payment_model" AS ENUM('full', 'deposit', 'card_on_file', 'insurer', 'package');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('rehab', 'recovery', 'performance');--> statement-breakpoint
CREATE TYPE "public"."voucher_source" AS ENUM('online', 'calendly_import', 'admin');--> statement-breakpoint
CREATE TYPE "public"."voucher_status" AS ENUM('pending', 'active', 'redeemed', 'expired', 'void');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"recovery_codes_hash" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone,
	"previous_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocked_times" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"source" "block_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" text NOT NULL,
	"service_id" text NOT NULL,
	"client_id" uuid,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"source" "booking_source" DEFAULT 'online' NOT NULL,
	"location_type" "location_type" DEFAULT 'clinic' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"buffer_min" integer DEFAULT 10 NOT NULL,
	"occupied_until" timestamp with time zone NOT NULL,
	"blocks_time" boolean DEFAULT true NOT NULL,
	"price_pence" integer NOT NULL,
	"discount_pence" integer DEFAULT 0 NOT NULL,
	"voucher_pence" integer DEFAULT 0 NOT NULL,
	"paid_pence" integer DEFAULT 0 NOT NULL,
	"fee_charged_pence" integer DEFAULT 0 NOT NULL,
	"payment_model" "payment_model" DEFAULT 'full' NOT NULL,
	"discount_code_id" uuid,
	"voucher_id" uuid,
	"package_purchase_id" uuid,
	"insurer_name" text,
	"insurer_authorisation" text,
	"insurer_balance_pence" integer,
	"hold_expires_at" timestamp with time zone,
	"manage_token_hash" text,
	"client_notes" text,
	"admin_notes_enc" text,
	"clinical_notes_enc" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"rescheduled_from_id" uuid,
	"google_event_id" text,
	"home_address_enc" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practitioner_id" text NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"account_email" text,
	"refresh_token_enc" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"sync_token" text,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"dob" date,
	"emergency_contact_enc" text,
	"sport" text,
	"training_level" text,
	"goals" text,
	"referral_source" text,
	"marketing_opt_in" boolean DEFAULT false NOT NULL,
	"marketing_opt_in_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"admin_notes_enc" text,
	"stripe_customer_id" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"service_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"postcode" text,
	"service_id" text,
	"preferred_times" text,
	"message" text,
	"status" "enquiry_status" DEFAULT 'new' NOT NULL,
	"quote_pence" integer,
	"payment_link_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"booking_id" uuid,
	"data_enc" text NOT NULL,
	"has_red_flags" boolean DEFAULT false NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"consents" jsonb NOT NULL,
	"guardian_consent" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"key" text PRIMARY KEY NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"name" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"template_key" text NOT NULL,
	"to" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"html" text,
	"attachments" jsonb,
	"booking_id" uuid,
	"client_id" uuid,
	"dedupe_key" text,
	"status" "notification_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"provider_id" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "package_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" text NOT NULL,
	"client_id" uuid NOT NULL,
	"credits_total" integer NOT NULL,
	"credits_remaining" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payment_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"service_id" text,
	"credits" integer NOT NULL,
	"price_pence" integer NOT NULL,
	"validity_days" integer DEFAULT 365 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"client_id" uuid,
	"service_id" text,
	"enquiry_id" uuid,
	"starts_at" timestamp with time zone,
	"location_type" "location_type" DEFAULT 'clinic' NOT NULL,
	"amount_pence" integer NOT NULL,
	"description" text NOT NULL,
	"recipient_name" text,
	"recipient_email" text,
	"status" text DEFAULT 'open' NOT NULL,
	"booking_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"voucher_id" uuid,
	"package_purchase_id" uuid,
	"client_id" uuid,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"provider_payment_id" text,
	"provider_payment_method_id" text,
	"kind" "payment_kind" DEFAULT 'payment' NOT NULL,
	"amount_pence" integer NOT NULL,
	"refunded_pence" integer DEFAULT 0 NOT NULL,
	"tax_pence" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'gbp' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"receipt_number" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practitioners" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_pence" integer NOT NULL,
	"reason" text,
	"provider_refund_id" text,
	"status" text DEFAULT 'succeeded' NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"slug" text NOT NULL,
	"category" "service_category" NOT NULL,
	"price_pence" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"buffer_min" integer DEFAULT 10 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"runs_concurrently" boolean DEFAULT false NOT NULL,
	"payment_model" "payment_model",
	"deposit_percent" integer,
	"tax_rate_bp" integer,
	"required_consents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"available_at_home" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"placeholder_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"placeholder" boolean DEFAULT false NOT NULL,
	"placeholder_note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voucher_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voucher_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"amount_pence" integer NOT NULL,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"product_id" text,
	"minutes" integer,
	"initial_pence" integer NOT NULL,
	"balance_pence" integer NOT NULL,
	"purchaser_name" text,
	"purchaser_email" text,
	"recipient_name" text,
	"recipient_email" text,
	"message" text,
	"status" "voucher_status" DEFAULT 'pending' NOT NULL,
	"source" "voucher_source" DEFAULT 'online' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"payment_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_user_id_admin_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_times_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_forms" ADD CONSTRAINT "intake_forms_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_voucher_id_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ADD CONSTRAINT "voucher_redemptions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "blocked_range_idx" ON "blocked_times" USING btree ("practitioner_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_external_idx" ON "blocked_times" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "bookings_starts_idx" ON "bookings" USING btree ("practitioner_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_client_idx" ON "bookings" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_email_idx" ON "clients" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "clients_name_idx" ON "clients" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_code_idx" ON "discount_codes" USING btree (upper("code"));--> statement-breakpoint
CREATE INDEX "notifications_due_idx" ON "notifications" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_token_idx" ON "payment_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_session_idx" ON "payments" USING btree ("provider_session_id");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "vouchers_code_idx" ON "vouchers" USING btree ("code");