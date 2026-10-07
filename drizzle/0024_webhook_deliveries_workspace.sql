-- Align webhook_deliveries with schema: workspace scope for claim/retry queries.
ALTER TABLE "webhook_deliveries"
  ADD COLUMN IF NOT EXISTS "workspace_id" uuid;
--> statement-breakpoint

UPDATE "webhook_deliveries" AS d
SET "workspace_id" = e."workspace_id"
FROM "webhook_endpoints" AS e
WHERE d."endpoint_id" = e."id"
  AND d."workspace_id" IS NULL;
--> statement-breakpoint

DELETE FROM "webhook_deliveries"
WHERE "workspace_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "webhook_deliveries"
  ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "webhook_deliveries_workspace_created_idx"
  ON "webhook_deliveries" ("workspace_id", "created_at");
