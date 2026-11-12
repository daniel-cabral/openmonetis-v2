ALTER TABLE "user_preferences" ADD COLUMN "transactions_column_order" text[];--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "group_transactions_by_date" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "hide_anticipated_installments" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "show_transaction_summary" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "transaction_note_as_column" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD COLUMN "attachment_max_size_mb" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_attachment_max_size_mb_check" CHECK ("user_preferences"."attachment_max_size_mb" in (5, 10, 25, 50));