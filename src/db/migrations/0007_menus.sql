CREATE TYPE "public"."menu_item_type" AS ENUM('custom', 'post', 'term');--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"menu_id" bigint NOT NULL,
	"parent_id" bigint,
	"position" integer DEFAULT 0 NOT NULL,
	"type" "menu_item_type" NOT NULL,
	"object_id" bigint,
	"url" text DEFAULT '' NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"open_in_new_tab" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menus" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_items_menu_idx" ON "menu_items" USING btree ("menu_id","position");