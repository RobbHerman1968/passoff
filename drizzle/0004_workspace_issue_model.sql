-- Product-model realignment. Preserve tenant rows.
-- Do not DROP teams, memberships, projects, reviews, or feedback.
-- drizzle-kit generate cannot be used as-is because it prompts to drop/recreate enums.
-- After this SQL is applied, regenerate the snapshot with an interactive `drizzle-kit generate`
-- once enum rename prompts can be answered, then replace any drop/create SQL it emits.

-- 1. Copy unmappable video reviews before changing reviews.type.
CREATE TABLE IF NOT EXISTS "legacy_video_reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid,
	"owner_user_id" uuid,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"archived_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"original_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables
		WHERE table_schema = 'public' AND table_name = 'reviews'
	) AND EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public' AND table_name = 'reviews' AND column_name = 'type'
	) THEN
		INSERT INTO "legacy_video_reviews" (
			"id", "workspace_id", "project_id", "owner_user_id", "name", "status",
			"archived_at", "closed_at", "closed_by_user_id", "original_payload",
			"created_at", "updated_at"
		)
		SELECT
			r."id",
			r."team_id",
			r."project_id",
			r."owner_user_id",
			r."name",
			r."status"::text,
			r."archived_at",
			r."closed_at",
			r."closed_by_user_id",
			to_jsonb(r),
			r."created_at",
			r."updated_at"
		FROM "reviews" r
		WHERE r."type"::text = 'video'
		ON CONFLICT ("id") DO NOTHING;
	END IF;
END $$;

-- 2. Rename tenant tables in place.
ALTER TABLE IF EXISTS "teams" RENAME TO "workspaces";
ALTER TABLE IF EXISTS "team_memberships" RENAME TO "workspace_memberships";
ALTER TABLE IF EXISTS "team_invitations" RENAME TO "workspace_invitations";

ALTER INDEX IF EXISTS "teams_slug_unique" RENAME TO "workspaces_slug_unique";
ALTER INDEX IF EXISTS "team_memberships_team_user_unique" RENAME TO "workspace_memberships_workspace_user_unique";
ALTER INDEX IF EXISTS "team_memberships_user_status_idx" RENAME TO "workspace_memberships_user_status_idx";
ALTER INDEX IF EXISTS "team_invitations_token_hash_unique" RENAME TO "workspace_invitations_token_hash_unique";
ALTER INDEX IF EXISTS "team_invitations_team_email_idx" RENAME TO "workspace_invitations_workspace_email_idx";

DO $$
DECLARE
	tbl text;
BEGIN
	FOR tbl IN
		SELECT table_name
		FROM information_schema.columns
		WHERE table_schema = 'public' AND column_name = 'team_id'
	LOOP
		EXECUTE format('ALTER TABLE %I RENAME COLUMN team_id TO workspace_id', tbl);
	END LOOP;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_role') THEN
		CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member');
	END IF;
END $$;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'workspace_memberships' AND column_name = 'role'
	) THEN
		ALTER TABLE "workspace_memberships" ALTER COLUMN "role" DROP DEFAULT;
		ALTER TABLE "workspace_memberships" ALTER COLUMN "role" TYPE "workspace_role" USING "role"::text::"workspace_role";
		ALTER TABLE "workspace_memberships" ALTER COLUMN "role" SET DEFAULT 'member';
	END IF;
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'workspace_invitations' AND column_name = 'role'
	) THEN
		ALTER TABLE "workspace_invitations" ALTER COLUMN "role" DROP DEFAULT;
		ALTER TABLE "workspace_invitations" ALTER COLUMN "role" TYPE "workspace_role" USING "role"::text::"workspace_role";
		ALTER TABLE "workspace_invitations" ALTER COLUMN "role" SET DEFAULT 'member';
	END IF;
END $$;

-- 3. Preserve review rounds.
ALTER TABLE IF EXISTS "review_rounds" RENAME TO "legacy_review_rounds";
ALTER INDEX IF EXISTS "review_rounds_team_status_idx" RENAME TO "legacy_review_rounds_workspace_idx";

DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_name = 'legacy_review_rounds' AND column_name = 'audience'
	) THEN
		ALTER TABLE "legacy_review_rounds" ALTER COLUMN "audience" TYPE text USING "audience"::text;
		ALTER TABLE "legacy_review_rounds" ALTER COLUMN "status" TYPE text USING "status"::text;
	END IF;
END $$;

-- Remaining environment/deployment/issue mapping is applied by later statements in this file
-- only after workspace_id exists on reviews and projects.

DO $$ BEGIN
	CREATE TYPE "public"."environment_kind" AS ENUM('preview', 'staging', 'production', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."deployment_source" AS ENUM('host_supplied', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."issue_status" AS ENUM('open', 'in_progress', 'ready_for_verification', 'verified', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."issue_priority" AS ENUM('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."issue_closure_reason" AS ENUM('fixed', 'not_planned', 'duplicate', 'cannot_reproduce', 'no_longer_relevant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."match_confidence" AS ENUM('unchecked', 'exact', 'likely', 'ambiguous', 'missing');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."evidence_kind" AS ENUM('screenshot', 'video', 'technical_context', 'verification_capture');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."evidence_capture_method" AS ENUM('browser_reconstruction', 'worker_capture', 'manual_attachment', 'host_upload');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."evidence_capture_status" AS ENUM('pending', 'ready', 'unavailable', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."verification_method" AS ENUM('human', 'element_visibility', 'bounding_box_overlap', 'named_test_hook');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
	CREATE TYPE "public"."verification_outcome" AS ENUM('passed', 'failed', 'uncertain');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE IF EXISTS "website_installations" RENAME TO "project_environments";

ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "project_id" uuid;
ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "kind" "environment_kind" DEFAULT 'custom' NOT NULL;
ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "base_url" text;
ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "host_release_id" text;
ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "consent_settings" jsonb DEFAULT '{"version":1,"captureScreenshots":true,"captureConsoleErrors":false,"captureNetworkFailures":false,"privateSelectors":[]}'::jsonb NOT NULL;
ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;

UPDATE "project_environments" pe
SET
	"project_id" = r."project_id",
	"base_url" = COALESCE(NULLIF(pe."starting_url", ''), 'https://example.invalid')
FROM "reviews" r
WHERE pe."review_id" = r."id" AND pe."project_id" IS NULL;

UPDATE "project_environments"
SET "base_url" = COALESCE("base_url", 'https://example.invalid')
WHERE "base_url" IS NULL;

ALTER TABLE "project_environments" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "project_environments" ALTER COLUMN "base_url" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"identifier" text NOT NULL,
	"display_label" text,
	"url" text,
	"source" "deployment_source" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

INSERT INTO "deployments" (
	"workspace_id", "project_id", "environment_id", "identifier", "url", "source", "recorded_at"
)
SELECT pe."workspace_id", pe."project_id", pe."id", 'initial', pe."base_url", 'manual', pe."created_at"
FROM "project_environments" pe
WHERE NOT EXISTS (
	SELECT 1 FROM "deployments" d WHERE d."environment_id" = pe."id" AND d."identifier" = 'initial'
);

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "environment_id" uuid;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "deployment_id" uuid;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "opened_at" timestamp with time zone;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "opened_by_user_id" uuid;
ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "feedback_deadline" timestamp with time zone;

UPDATE "reviews" r
SET
	"environment_id" = pe."id",
	"deployment_id" = d."id"
FROM "project_environments" pe
JOIN "deployments" d ON d."environment_id" = pe."id" AND d."identifier" = 'initial'
WHERE pe."review_id" = r."id" AND r."environment_id" IS NULL;

-- Website reviews without an installation still need an environment before NOT NULL.
-- Video reviews already copied to legacy_video_reviews remain until type is dropped.
