CREATE TABLE "availability_days" (
	"practitioner_id" text NOT NULL,
	"date" date NOT NULL,
	"ranges" jsonb NOT NULL,
	"cap" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_days_practitioner_id_date_pk" PRIMARY KEY("practitioner_id","date")
);
--> statement-breakpoint
ALTER TABLE "availability_days" ADD CONSTRAINT "availability_days_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_days" ENABLE ROW LEVEL SECURITY;
