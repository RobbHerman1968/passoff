-- Bring legacy approvals (round_id) up to deployment-scoped shape before new FKs.
ALTER TABLE "approvals"
  ADD COLUMN IF NOT EXISTS "project_id" uuid,
  ADD COLUMN IF NOT EXISTS "environment_id" uuid,
  ADD COLUMN IF NOT EXISTS "deployment_id" uuid;
--> statement-breakpoint

UPDATE "approvals" AS a
SET
  "project_id" = r."project_id",
  "environment_id" = r."environment_id",
  "deployment_id" = r."deployment_id"
FROM "reviews" AS r
WHERE a."review_id" = r."id"
  AND (
    a."project_id" IS NULL
    OR a."environment_id" IS NULL
    OR a."deployment_id" IS NULL
  );
--> statement-breakpoint

-- Rows that cannot map onto a current review/deployment cannot be decided on.
DELETE FROM "approvals"
WHERE "project_id" IS NULL
   OR "environment_id" IS NULL
   OR "deployment_id" IS NULL;
--> statement-breakpoint

ALTER TABLE "approvals"
  ALTER COLUMN "project_id" SET NOT NULL,
  ALTER COLUMN "environment_id" SET NOT NULL,
  ALTER COLUMN "deployment_id" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "approvals" DROP CONSTRAINT IF EXISTS "approvals_round_id_review_rounds_id_fk";
--> statement-breakpoint

ALTER TABLE "approvals" ALTER COLUMN "round_id" DROP NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approvals"
    ADD CONSTRAINT "approvals_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approvals"
    ADD CONSTRAINT "approvals_environment_id_project_environments_id_fk"
    FOREIGN KEY ("environment_id") REFERENCES "public"."project_environments"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "approvals_review_deployment_created_idx"
  ON "approvals" ("review_id", "deployment_id", "created_at");
--> statement-breakpoint

-- Separate guest approval permission from commenting.
ALTER TABLE "share_links"
  ADD COLUMN IF NOT EXISTS "can_approve" boolean DEFAULT false NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE "public"."approval_request_state" AS ENUM(
    'awaiting_decision',
    'approved',
    'changes_requested',
    'cancelled',
    'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "environment_id" uuid NOT NULL,
  "review_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "requested_by_user_id" uuid,
  "reviewer_user_id" uuid,
  "share_link_id" uuid,
  "message" text,
  "state" "public"."approval_request_state" DEFAULT 'awaiting_decision' NOT NULL,
  "due_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "superseded_by_request_id" uuid,
  "decision_approval_id" uuid,
  "open_issue_count" integer DEFAULT 0 NOT NULL,
  "awaiting_verification_count" integer DEFAULT 0 NOT NULL,
  "verified_issue_count" integer DEFAULT 0 NOT NULL,
  "unresolved_acknowledged" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_project_id_projects_id_fk"
    FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_environment_id_project_environments_id_fk"
    FOREIGN KEY ("environment_id") REFERENCES "public"."project_environments"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_deployment_id_deployments_id_fk"
    FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_requested_by_user_id_users_id_fk"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_reviewer_user_id_users_id_fk"
    FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_share_link_id_share_links_id_fk"
    FOREIGN KEY ("share_link_id") REFERENCES "public"."share_links"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_decision_approval_id_approvals_id_fk"
    FOREIGN KEY ("decision_approval_id") REFERENCES "public"."approvals"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_superseded_by_request_id_approval_requests_id_fk"
    FOREIGN KEY ("superseded_by_request_id") REFERENCES "public"."approval_requests"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "approval_requests_review_created_idx"
  ON "approval_requests" ("review_id", "created_at");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "approval_requests_deployment_idx"
  ON "approval_requests" ("deployment_id");
--> statement-breakpoint

-- One active request per review + deployment.
CREATE UNIQUE INDEX IF NOT EXISTS "approval_requests_active_review_deployment_unique"
  ON "approval_requests" ("review_id", "deployment_id")
  WHERE "state" = 'awaiting_decision';
--> statement-breakpoint

-- Historical approvals must survive when the review points at a newer deployment.
ALTER TABLE "approvals" DROP CONSTRAINT IF EXISTS "approvals_review_scope_fk";
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approvals"
    ADD CONSTRAINT "approvals_deployment_id_deployments_id_fk"
    FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id")
    ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "approvals"
    ADD CONSTRAINT "approvals_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
