ALTER TYPE "public"."ai_chat_failure_code" ADD VALUE 'providerUnavailable' BEFORE 'serviceUnavailable';--> statement-breakpoint
ALTER TYPE "public"."ai_diagnosis_failure_code" ADD VALUE 'providerUnavailable' BEFORE 'invalidOutput';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'anthropic';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'openai';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'gemini';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'openrouter';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'minimax';--> statement-breakpoint
ALTER TYPE "public"."ai_provider" ADD VALUE 'ollama';--> statement-breakpoint
CREATE TABLE "ai_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "ai_provider" NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" varchar(24) NOT NULL,
	"auth_tag" varchar(32) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"secret_fingerprint" varchar(16) NOT NULL,
	"rotated_at" timestamp with time zone NOT NULL,
	"refused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_provider_credentials" ADD CONSTRAINT "ai_provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_provider_credentials_user_id_provider_unique" ON "ai_provider_credentials" USING btree ("user_id","provider");