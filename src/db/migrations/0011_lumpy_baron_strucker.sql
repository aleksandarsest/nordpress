CREATE TABLE "traffic_daily" (
	"day" date NOT NULL,
	"path" text NOT NULL,
	"source" text NOT NULL,
	"agent" text DEFAULT '' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "traffic_daily_day_path_source_agent_pk" PRIMARY KEY("day","path","source","agent")
);
--> statement-breakpoint
CREATE INDEX "traffic_daily_source_idx" ON "traffic_daily" USING btree ("source","day");