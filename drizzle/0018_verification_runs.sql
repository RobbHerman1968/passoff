ALTER TABLE "project_environments" ADD COLUMN IF NOT EXISTS "verification_hook_allowlist" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_run_state" AS ENUM('preparing', 'locating', 'running', 'capturing', 'complete', 'needs_attention', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_run_overall" AS ENUM('passed', 'failed', 'uncertain', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_check_kind" AS ENUM('element_visibility', 'bounding_box_overlap', 'named_test_hook');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_version_source" AS ENUM('installation_deployment', 'application_release', 'environment_metadata', 'manual_confirmation', 'missing');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_evidence_capture_state" AS ENUM('not_requested', 'pending', 'ready', 'failed', 'skipped');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"initiating_user_id" uuid,
	"state" "verification_run_state" DEFAULT 'preparing' NOT NULL,
	"overall_result" "verification_run_overall",
	"selected_checks" jsonb NOT NULL,
	"named_hook" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"actual_url" text,
	"actual_route" text,
	"viewport_width" integer,
	"viewport_height" integer,
	"device_pixel_ratio" numeric(6, 3),
	"orientation" text,
	"viewport_group" text,
	"version_detection_method" "verification_version_source",
	"expected_version" text,
	"detected_version" text,
	"anchor_match_confidence" "match_confidence",
	"evidence_id" uuid,
	"evidence_capture_state" "verification_evidence_capture_state" DEFAULT 'not_requested' NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" text,
	"runner_version" text,
	"contract_version" integer DEFAULT 1 NOT NULL,
	"result_idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"run_id" uuid,
	"code_hash" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"page_route" text,
	"target_url" text NOT NULL,
	"selected_checks" jsonb NOT NULL,
	"named_hook" text,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"deployment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"page_route" text,
	"selected_checks" jsonb NOT NULL,
	"named_hook" text,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification_check_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" "verification_check_kind" NOT NULL,
	"outcome" "verification_outcome" NOT NULL,
	"summary" text NOT NULL,
	"measurements" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hook_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_initiating_user_id_users_id_fk" FOREIGN KEY ("initiating_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_evidence_id_issue_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."issue_evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_issue_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_runs" ADD CONSTRAINT "verification_runs_deployment_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_exchanges" ADD CONSTRAINT "verification_exchanges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_exchanges" ADD CONSTRAINT "verification_exchanges_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_sessions" ADD CONSTRAINT "verification_sessions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_check_results" ADD CONSTRAINT "verification_check_results_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "verification_check_results" ADD CONSTRAINT "verification_check_results_run_id_verification_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."verification_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verification_exchanges_code_hash_unique" ON "verification_exchanges" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_exchanges_expiry_idx" ON "verification_exchanges" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_exchanges_run_idx" ON "verification_exchanges" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verification_sessions_token_hash_unique" ON "verification_sessions" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_sessions_expiry_idx" ON "verification_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_sessions_run_idx" ON "verification_sessions" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_runs_issue_created_idx" ON "verification_runs" USING btree ("issue_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_runs_workspace_idx" ON "verification_runs" USING btree ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verification_check_results_run_idx" ON "verification_check_results" USING btree ("run_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "verification_check_results_run_kind_hook_unique" ON "verification_check_results" USING btree ("run_id","kind","hook_name");
