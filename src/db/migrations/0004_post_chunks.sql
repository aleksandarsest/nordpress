CREATE TABLE "post_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"post_id" bigint NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_chunks" ADD CONSTRAINT "post_chunks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_chunks_post_chunk_idx" ON "post_chunks" USING btree ("post_id","chunk_index");--> statement-breakpoint
CREATE INDEX "post_chunks_embedding_idx" ON "post_chunks" USING hnsw ("embedding" vector_cosine_ops);