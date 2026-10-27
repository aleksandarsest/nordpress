CREATE TABLE "agent_actions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text,
	"credential" text,
	"client" text,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"outcome" text NOT NULL,
	"message" text,
	"target" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_actions_created_idx" ON "agent_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_actions_user_idx" ON "agent_actions" USING btree ("user_id","created_at");