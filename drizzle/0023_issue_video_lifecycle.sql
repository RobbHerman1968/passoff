-- Issue video evidence (MVP Cleanup Story 4): lifecycle, replacement, removal, provider deletion.
-- Builds on the existing video_assets table. Safe to run more than once.

ALTER TABLE "video_assets"
  ADD COLUMN IF NOT EXISTS "issue_id" uuid,
  ADD COLUMN IF NOT EXISTS "lifecycle" text DEFAULT 'current' NOT NULL,
  ADD COLUMN IF NOT EXISTS "declared_duration_ms" integer,
  ADD COLUMN IF NOT EXISTS "declared_bytes" bigint,
  ADD COLUMN IF NOT EXISTS "max_height" integer,
  ADD COLUMN IF NOT EXISTS "metadata_verified_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "removed_by_user_id" uuid,
  ADD COLUMN IF NOT EXISTS "removal_reason" text,
  ADD COLUMN IF NOT EXISTS "provider_delete_requested_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "provider_deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "provider_delete_attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "provider_delete_next_attempt_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "provider_delete_last_error" text;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_assets"
    ADD CONSTRAINT "video_assets_issue_id_issues_id_fk"
    FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_assets"
    ADD CONSTRAINT "video_assets_removed_by_user_id_users_id_fk"
    FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_assets"
    ADD CONSTRAINT "video_assets_lifecycle_valid"
    CHECK ("lifecycle" in ('current', 'replacement', 'retired', 'removed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Existing clips belong to the issue their evidence row points at.
UPDATE "video_assets" AS v
SET "issue_id" = e."issue_id"
FROM "issue_evidence" AS e
WHERE v."evidence_id" = e."id" AND v."issue_id" IS NULL;
--> statement-breakpoint

UPDATE "video_assets"
SET "declared_duration_ms" = "duration_ms"
WHERE "declared_duration_ms" IS NULL;
--> statement-breakpoint

-- Before enforcing one current clip per issue, keep only the newest and retire older ones.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "issue_id" ORDER BY "created_at" DESC, "id") AS rank
  FROM "video_assets"
  WHERE "lifecycle" = 'current' AND "issue_id" IS NOT NULL
)
UPDATE "video_assets" AS v
SET "lifecycle" = 'retired',
    "removed_at" = now(),
    "removal_reason" = 'superseded',
    "provider_playback_id" = NULL,
    "provider_delete_requested_at" = CASE
      WHEN v."provider_asset_id" IS NOT NULL OR v."provider_upload_id" IS NOT NULL THEN now()
      ELSE NULL
    END,
    "provider_deleted_at" = CASE
      WHEN v."provider_asset_id" IS NULL AND v."provider_upload_id" IS NULL THEN now()
      ELSE NULL
    END
FROM ranked
WHERE v."id" = ranked."id" AND ranked.rank > 1;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_one_current_per_issue"
  ON "video_assets" ("issue_id")
  WHERE "lifecycle" = 'current' AND "issue_id" IS NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_one_replacement_per_issue"
  ON "video_assets" ("issue_id")
  WHERE "lifecycle" = 'replacement' AND "issue_id" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "video_assets_issue_idx" ON "video_assets" ("issue_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "video_assets_provider_delete_pending_idx"
  ON "video_assets" ("provider_delete_next_attempt_at")
  WHERE "provider_delete_requested_at" IS NOT NULL AND "provider_deleted_at" IS NULL;
