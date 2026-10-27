CREATE TYPE "public"."submission_status" AS ENUM('new', 'read', 'spam');--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"form_id" bigint NOT NULL,
	"data" jsonb NOT NULL,
	"status" "submission_status" DEFAULT 'new' NOT NULL,
	"ai_summary" text,
	"ai_spam_reason" text,
	"source" text DEFAULT 'web' NOT NULL,
	"source_post_id" bigint,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_form_idx" ON "form_submissions" USING btree ("form_id","created_at");