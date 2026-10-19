CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_dispute_id" text NOT NULL,
	"payment_id" uuid,
	"amount_pence" integer NOT NULL,
	"reason" text,
	"status" text NOT NULL,
	"evidence_due_by" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_provider_idx" ON "disputes" USING btree ("provider_dispute_id");--> statement-breakpoint
CREATE INDEX "disputes_payment_idx" ON "disputes" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "disputes" ENABLE ROW LEVEL SECURITY;
