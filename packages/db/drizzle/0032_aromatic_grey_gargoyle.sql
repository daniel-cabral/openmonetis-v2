CREATE TABLE "recurring_occurrence_trips" (
	"recurring_series_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL,
	CONSTRAINT "recurring_occurrence_trips_recurring_series_id_occurrence_date_pk" PRIMARY KEY("recurring_series_id","occurrence_date")
);
--> statement-breakpoint
CREATE TABLE "transaction_trips" (
	"transaction_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"trip_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"note" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trips_name_not_blank_check" CHECK (btrim("trips"."name") <> ''),
	CONSTRAINT "trips_date_range_check" CHECK ("trips"."end_date" >= "trips"."start_date")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trips_id_user_id_unique" ON "trips" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "recurring_occurrence_trips" ADD CONSTRAINT "recurring_occurrence_trips_recurring_series_id_user_id_recurring_transaction_series_id_user_id_fk" FOREIGN KEY ("recurring_series_id","user_id") REFERENCES "public"."recurring_transaction_series"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrence_trips" ADD CONSTRAINT "recurring_occurrence_trips_trip_id_user_id_trips_id_user_id_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_trips" ADD CONSTRAINT "transaction_trips_transaction_id_user_id_transactions_id_user_id_fk" FOREIGN KEY ("transaction_id","user_id") REFERENCES "public"."transactions"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_trips" ADD CONSTRAINT "transaction_trips_trip_id_user_id_trips_id_user_id_fk" FOREIGN KEY ("trip_id","user_id") REFERENCES "public"."trips"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_occurrence_trips_user_trip_idx" ON "recurring_occurrence_trips" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "transaction_trips_user_trip_idx" ON "transaction_trips" USING btree ("user_id","trip_id");--> statement-breakpoint
CREATE INDEX "trips_user_start_idx" ON "trips" USING btree ("user_id","start_date");