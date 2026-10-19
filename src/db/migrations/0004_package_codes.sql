ALTER TABLE "package_purchases" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "package_purchases" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "package_purchases" ADD CONSTRAINT "package_purchases_code_unique" UNIQUE("code");