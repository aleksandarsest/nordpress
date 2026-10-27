CREATE TYPE "public"."suggestion_status" AS ENUM('pending', 'applied', 'dismissed');--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"tool" text,
	"tool_input" jsonb,
	"link" text,
	"status" "suggestion_status" DEFAULT 'pending' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_status_idx" ON "suggestions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_target_idx" ON "suggestions" USING btree ("kind","target");