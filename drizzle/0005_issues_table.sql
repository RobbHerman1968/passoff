-- Dashboard listProjects joins issues. Create the table without requiring
-- every review to already have a deployment (29 leftover video reviews do not).

CREATE TABLE IF NOT EXISTS "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"project_id" uuid NOT NULL,
	"environment_id" uuid,
	"deployment_id" uuid,
	"review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE cascade,
	"page_id" uuid,
	"number" integer NOT NULL,
	"body" text NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"priority" "issue_priority" DEFAULT 'normal' NOT NULL,
	"closure_reason" "issue_closure_reason",
	"author_user_id" uuid,
	"author_guest_id" uuid,
	"verified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"reopened_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_number_positive" CHECK ("number" > 0),
	CONSTRAINT "issues_version_positive" CHECK ("version" > 0),
	CONSTRAINT "issues_has_one_author" CHECK (num_nonnulls("author_user_id", "author_guest_id") = 1),
	CONSTRAINT "issues_closure_reason_matches_status" CHECK (
		("status" = 'closed' AND "closure_reason" IS NOT NULL)
		OR ("status" <> 'closed' AND "closure_reason" IS NULL)
	),
	CONSTRAINT "issues_closed_requires_closed_at" CHECK ("status" <> 'closed' OR "closed_at" IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS "issues_review_number_unique" ON "issues" ("review_id", "number");
CREATE INDEX IF NOT EXISTS "issues_review_status_updated_idx" ON "issues" ("review_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "issues_workspace_idx" ON "issues" ("workspace_id");

ALTER TABLE "activity_events" ADD COLUMN IF NOT EXISTS "issue_id" uuid REFERENCES "issues"("id") ON DELETE cascade;
