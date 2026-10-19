-- Hand-written constraints that drizzle-kit cannot express.

-- 1. NO DOUBLE BOOKING, EVER — enforced by Postgres itself.
--    A booking occupies [starts_at, occupied_until) where occupied_until = ends_at + buffer.
--    Two time-blocking bookings for the same practitioner in an active state may never overlap.
--    App code also takes a per-practitioner advisory lock (daily caps, blocked time), but this constraint is the
--    last line of defence and holds even if app code is wrong.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "practitioner_id" WITH =,
    tstzrange("starts_at", "occupied_until", '[)') WITH &&
  )
  WHERE ("blocks_time" AND "status" IN ('pending_payment', 'confirmed', 'attended'));
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_range_valid" CHECK ("ends_at" > "starts_at" AND "occupied_until" >= "ends_at");
--> statement-breakpoint
ALTER TABLE "blocked_times" ADD CONSTRAINT "blocked_range_valid" CHECK ("ends_at" > "starts_at");
--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "voucher_balance_valid" CHECK ("balance_pence" >= 0 AND "balance_pence" <= "initial_pence");
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payment_refund_valid" CHECK ("refunded_pence" >= 0 AND "refunded_pence" <= "amount_pence");
--> statement-breakpoint

-- 2. ROW LEVEL SECURITY. The app talks to Postgres with a server-side role (service role / table owner), which
--    bypasses RLS. Enabling RLS with no policies means Supabase's public `anon` and `authenticated` roles can read
--    or write nothing, even if the anon key leaks. Health data never leaves the server.
ALTER TABLE "practitioners" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "intake_forms" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "blocked_times" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "vouchers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "voucher_redemptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_links" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "package_purchases" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "enquiries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notification_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admin_users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admin_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "webhook_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "calendar_connections" ENABLE ROW LEVEL SECURITY;
