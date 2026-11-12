CREATE TABLE "import_name_mappings" (
	"user_id" uuid NOT NULL,
	"description_key" varchar(160) NOT NULL,
	"name" varchar(160) NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "import_name_mappings_user_id_description_key_pk" PRIMARY KEY("user_id","description_key")
);
--> statement-breakpoint
CREATE TABLE "reconciliation_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"target_type" varchar(16) NOT NULL,
	"target_id" uuid NOT NULL,
	"undo" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_ignores" (
	"user_id" uuid NOT NULL,
	"source_fingerprint" varchar(64) NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"reason" varchar(160) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reconciliation_ignores_user_id_source_fingerprint_external_id_pk" PRIMARY KEY("user_id","source_fingerprint","external_id")
);
--> statement-breakpoint
ALTER TABLE "recurring_transaction_occurrences" ADD COLUMN "import_source_fingerprint" varchar(64);--> statement-breakpoint
ALTER TABLE "recurring_transaction_occurrences" ADD COLUMN "import_external_id" varchar(255);--> statement-breakpoint
ALTER TABLE "import_name_mappings" ADD CONSTRAINT "import_name_mappings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batches" ADD CONSTRAINT "reconciliation_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_ignores" ADD CONSTRAINT "reconciliation_ignores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_batches_user_created_at_idx" ON "reconciliation_batches" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_transaction_occurrences_import_external_unique" ON "recurring_transaction_occurrences" USING btree ("user_id","import_source_fingerprint","import_external_id") WHERE "recurring_transaction_occurrences"."import_external_id" IS NOT NULL;