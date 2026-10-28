CREATE TYPE "public"."newsletter_status" AS ENUM('queued', 'sending', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed');--> statement-breakpoint
CREATE TABLE "newsletters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"post_id" bigint,
	"subject" text NOT NULL,
	"preheader" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT 'everyone' NOT NULL,
	"status" "newsletter_status" DEFAULT 'queued' NOT NULL,
	"send_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cursor" bigint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletters_post_id_unique" UNIQUE("post_id")
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'form' NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletters_status_idx" ON "newsletters" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status","id");