-- Launch hardening (Story 8): the issue model has always declared these two tables in
-- src/db/schema.ts, but no earlier migration created them. Without issue_verifications the
-- issue export and "mark as resolved" paths fail with a server error. Safe to run more than once.

CREATE UNIQUE INDEX IF NOT EXISTS "issues_id_scope_unique"
  ON "issues" ("id", "workspace_id", "project_id", "environment_id", "deployment_id", "review_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_assignments" (
  "issue_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "assigned_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "issue_assignments_issue_id_user_id_pk" PRIMARY KEY ("issue_id", "user_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_assignments"
    ADD CONSTRAINT "issue_assignments_issue_id_issues_id_fk"
    FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_assignments"
    ADD CONSTRAINT "issue_assignments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_assignments"
    ADD CONSTRAINT "issue_assignments_assigned_by_user_id_users_id_fk"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_assignments_user_idx" ON "issue_assignments" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "review_id" uuid NOT NULL,
  "environment_id" uuid NOT NULL,
  "deployment_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "verified_by_user_id" uuid,
  "verified_by_guest_id" uuid,
  "method" "verification_method" NOT NULL,
  "outcome" "verification_outcome" NOT NULL,
  "checked_url" text,
  "viewport_width" integer,
  "viewport_height" integer,
  "evidence_id" uuid,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "issue_verifications_has_one_verifier"
    CHECK (num_nonnulls("verified_by_user_id", "verified_by_guest_id") = 1)
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_verifications"
    ADD CONSTRAINT "issue_verifications_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_verifications"
    ADD CONSTRAINT "issue_verifications_verified_by_user_id_users_id_fk"
    FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_verifications"
    ADD CONSTRAINT "issue_verifications_verified_by_guest_id_guest_identities_id_fk"
    FOREIGN KEY ("verified_by_guest_id") REFERENCES "public"."guest_identities"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_verifications"
    ADD CONSTRAINT "issue_verifications_evidence_id_issue_evidence_id_fk"
    FOREIGN KEY ("evidence_id") REFERENCES "public"."issue_evidence"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_verifications"
    ADD CONSTRAINT "issue_verifications_issue_scope_fk"
    FOREIGN KEY ("issue_id", "workspace_id", "project_id", "environment_id", "deployment_id", "review_id")
    REFERENCES "public"."issues"("id", "workspace_id", "project_id", "environment_id", "deployment_id", "review_id")
    ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_verifications_issue_created_idx" ON "issue_verifications" ("issue_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_verifications_workspace_idx" ON "issue_verifications" ("workspace_id");
