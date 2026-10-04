-- Normalize review_status to the product model: draft | open | closed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'review_status' AND e.enumlabel = 'client_review_open'
  ) THEN
    CREATE TYPE "public"."review_status_v2" AS ENUM('draft', 'open', 'closed');

    ALTER TABLE "reviews" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "reviews"
      ALTER COLUMN "status" TYPE "public"."review_status_v2"
      USING (
        CASE "status"::text
          WHEN 'draft' THEN 'draft'::"public"."review_status_v2"
          WHEN 'closed' THEN 'closed'::"public"."review_status_v2"
          WHEN 'approved' THEN 'closed'::"public"."review_status_v2"
          WHEN 'client_review_open' THEN 'open'::"public"."review_status_v2"
          WHEN 'internal_review' THEN 'open'::"public"."review_status_v2"
          WHEN 'changes_in_progress' THEN 'open'::"public"."review_status_v2"
          WHEN 'ready_for_another_look' THEN 'open'::"public"."review_status_v2"
          WHEN 'open' THEN 'open'::"public"."review_status_v2"
          ELSE 'draft'::"public"."review_status_v2"
        END
      );

    DROP TYPE "public"."review_status";
    ALTER TYPE "public"."review_status_v2" RENAME TO "review_status";
    ALTER TABLE "reviews" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."review_status";
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."screenshot_capture_kind" AS ENUM(
    'browser_reconstruction',
    'worker_capture',
    'manual_attachment'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "project_environments_id_scope_unique"
  ON "project_environments" ("id", "workspace_id", "project_id");

CREATE TABLE IF NOT EXISTS "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL REFERENCES "project_environments"("id") ON DELETE cascade,
	"normalized_route" text NOT NULL,
	"route_template" text,
	"last_known_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "pages_environment_route_unique"
  ON "pages" ("environment_id", "normalized_route");
CREATE INDEX IF NOT EXISTS "pages_workspace_idx" ON "pages" ("workspace_id");

CREATE TABLE IF NOT EXISTS "issue_anchors" (
	"issue_id" uuid PRIMARY KEY NOT NULL REFERENCES "issues"("id") ON DELETE cascade,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"page_url" text NOT NULL,
	"route" text,
	"page_title" text,
	"selected_text" text,
	"stable_element_id" text,
	"approved_data_attributes" jsonb,
	"dom_fingerprint" text,
	"css_selector" text,
	"normalized_x" numeric(8, 7),
	"normalized_y" numeric(8, 7),
	"document_x" integer,
	"document_y" integer,
	"element_bounds" jsonb,
	"viewport_width" integer NOT NULL,
	"viewport_height" integer NOT NULL,
	"browser" text,
	"operating_system" text,
	"device_pixel_ratio" numeric(6, 3),
	"application_build_id" text,
	"match_confidence" "match_confidence" DEFAULT 'unchecked' NOT NULL,
	"html_excerpt" text,
	"computed_styles" jsonb,
	"console_errors" jsonb,
	"failed_requests" jsonb,
	"host_session_reference" text,
	"screenshot_asset_id" uuid REFERENCES "assets"("id") ON DELETE set null,
	"screenshot_capture_kind" "screenshot_capture_kind",
	"screenshot_unavailable_reason" text,
	"captured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_anchor_normalized_x_range"
	  CHECK ("normalized_x" is null or ("normalized_x" >= 0 and "normalized_x" <= 1)),
	CONSTRAINT "issue_anchor_normalized_y_range"
	  CHECK ("normalized_y" is null or ("normalized_y" >= 0 and "normalized_y" <= 1))
);

CREATE INDEX IF NOT EXISTS "issue_anchors_page_url_idx" ON "issue_anchors" ("page_url");

ALTER TABLE "issues" ALTER COLUMN "environment_id" DROP NOT NULL;
ALTER TABLE "issues" ALTER COLUMN "deployment_id" DROP NOT NULL;
