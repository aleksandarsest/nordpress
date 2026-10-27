CREATE TABLE "post_previews" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"post_id" bigint,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_previews" ADD CONSTRAINT "post_previews_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_previews" ADD CONSTRAINT "post_previews_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_previews_expires_idx" ON "post_previews" USING btree ("expires_at");