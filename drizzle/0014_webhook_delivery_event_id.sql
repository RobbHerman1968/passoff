CREATE TABLE IF NOT EXISTS "webhook_deliveries_event_id_tmp" (
  "unused" integer
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "event_id" uuid;
--> statement-breakpoint
UPDATE "webhook_deliveries" SET "event_id" = "id" WHERE "event_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ALTER COLUMN "event_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "last_http_status" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_event_unique"
  ON "webhook_deliveries" ("endpoint_id", "event_id");
--> statement-breakpoint
DROP TABLE IF EXISTS "webhook_deliveries_event_id_tmp";
