-- Align video evidence storage with the workspace issue model and add Mux playback support.

ALTER TYPE "public"."asset_status" ADD VALUE IF NOT EXISTS 'needs_attention' BEFORE 'failed';--> statement-breakpoint

-- Legacy review-type columns block current website-review inserts.
ALTER TABLE "reviews" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "current_round_number" DROP NOT NULL;--> statement-breakpoint

-- project_environments evolved from website_installations; environments are created
-- before reviews, so review_id and other legacy required columns must be nullable.
ALTER TABLE "project_environments" DROP CONSTRAINT IF EXISTS "website_installations_review_id_reviews_id_fk";--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "review_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "starting_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "private_selectors" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "allowed_environments" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "capture_screenshots" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "capture_console_errors" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "project_environments" ALTER COLUMN "capture_network_failures" DROP NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "review_issue_counters" (
	"review_id" uuid PRIMARY KEY NOT NULL REFERENCES "reviews"("id") ON DELETE cascade,
	"next_issue_number" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "review_issue_counters_next_issue_positive" CHECK ("next_issue_number" > 0)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE cascade,
	"asset_id" uuid REFERENCES "assets"("id") ON DELETE set null,
	"kind" "evidence_kind" NOT NULL,
	"capture_method" "evidence_capture_method" NOT NULL,
	"capture_status" "evidence_capture_status" DEFAULT 'pending' NOT NULL,
	"sanitized_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_by_guest_id" uuid REFERENCES "guest_identities"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_evidence_at_most_one_creator" CHECK (num_nonnulls("created_by_user_id", "created_by_guest_id") <= 1)
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_evidence_issue_idx" ON "issue_evidence" ("issue_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_evidence_workspace_idx" ON "issue_evidence" ("workspace_id");--> statement-breakpoint

-- Reshape legacy standalone video_assets rows into issue-evidence video assets.
ALTER TABLE "video_assets" DROP CONSTRAINT IF EXISTS "video_assets_review_id_reviews_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "video_assets_review_unique";--> statement-breakpoint
ALTER TABLE "video_assets" ALTER COLUMN "review_id" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "evidence_id" uuid;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "processing_status" "asset_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "failure_reason" text;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "provider_upload_id" text;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "provider_asset_id" text;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "provider_playback_id" text;--> statement-breakpoint
ALTER TABLE "video_assets" ADD COLUMN IF NOT EXISTS "retention_ends_at" timestamp with time zone;--> statement-breakpoint

-- Backfill workspace ownership from the linked original asset when possible.
UPDATE "video_assets" va
SET "workspace_id" = a."workspace_id"
FROM "assets" a
WHERE va."original_asset_id" = a."id" AND va."workspace_id" IS NULL;--> statement-breakpoint

-- Any remaining orphan rows inherit workspace from the old review link.
UPDATE "video_assets" va
SET "workspace_id" = r."workspace_id"
FROM "reviews" r
WHERE va."review_id" = r."id" AND va."workspace_id" IS NULL;--> statement-breakpoint

DELETE FROM "video_assets" WHERE "workspace_id" IS NULL;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "video_assets" ALTER COLUMN "workspace_id" SET NOT NULL;
EXCEPTION
 WHEN others THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_evidence_id_issue_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."issue_evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_original_asset_unique" ON "video_assets" ("original_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_evidence_unique" ON "video_assets" ("evidence_id") WHERE "evidence_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_provider_upload_unique" ON "video_assets" ("provider_upload_id") WHERE "provider_upload_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_provider_asset_unique" ON "video_assets" ("provider_asset_id") WHERE "provider_asset_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_assets_provider_playback_unique" ON "video_assets" ("provider_playback_id") WHERE "provider_playback_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_assets_workspace_idx" ON "video_assets" ("workspace_id");--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "video_assets" ADD CONSTRAINT "video_assets_duration_nonnegative" CHECK ("duration_ms" is null or "duration_ms" >= 0);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"workspace_id" uuid,
	"video_asset_id" uuid,
	"event_created_at" timestamp with time zone,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "provider_events" ADD CONSTRAINT "provider_events_video_asset_id_video_assets_id_fk" FOREIGN KEY ("video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "provider_events_provider_event_unique" ON "provider_events" ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_events_video_asset_idx" ON "provider_events" ("video_asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_events_workspace_idx" ON "provider_events" ("workspace_id");
