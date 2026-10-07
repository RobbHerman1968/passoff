DO $$ BEGIN
 CREATE TYPE "public"."behavioral_finding_type" AS ENUM('click_concentration', 'repeat_click_concentration', 'possible_dead_click', 'scroll_drop_off', 'sanitized_js_error_concentration', 'material_version_change');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."behavioral_finding_disposition" AS ENUM('needs_review', 'attached_to_issue', 'issue_created', 'dismissed', 'watching', 'insufficient_data', 'no_longer_occurring');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."behavioral_comparison_outcome" AS ENUM('appears_improved', 'appears_unchanged', 'appears_worse', 'not_enough_data', 'incompatible');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavioral_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"finding_type" "behavioral_finding_type" NOT NULL,
	"rule_version" text NOT NULL,
	"scope_key" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"uncertainty" text NOT NULL,
	"normalized_route" text NOT NULL,
	"deployment_version" text DEFAULT '' NOT NULL,
	"viewport_group" "telemetry_viewport_group" NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"element_category" text DEFAULT '' NOT NULL,
	"analytics_label" text DEFAULT '' NOT NULL,
	"metric_name" text NOT NULL,
	"metric_value" numeric(12, 6) NOT NULL,
	"denominator_name" text NOT NULL,
	"denominator_value" bigint NOT NULL,
	"event_count" bigint NOT NULL,
	"eligible_session_count" bigint NOT NULL,
	"sampling_percent" integer NOT NULL,
	"coverage_status" text NOT NULL,
	"data_quality" text NOT NULL,
	"disposition" "behavioral_finding_disposition" DEFAULT 'needs_review' NOT NULL,
	"related_issue_id" uuid,
	"related_review_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavioral_evidence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"issue_id" uuid,
	"review_id" uuid,
	"payload" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavioral_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"issue_id" uuid,
	"finding_id" uuid,
	"baseline_snapshot_id" uuid NOT NULL,
	"baseline_version" text NOT NULL,
	"comparison_version" text NOT NULL,
	"metric_name" text NOT NULL,
	"viewport_group" "telemetry_viewport_group" NOT NULL,
	"baseline_value" numeric(12, 6),
	"comparison_value" numeric(12, 6),
	"baseline_sample" bigint DEFAULT 0 NOT NULL,
	"comparison_sample" bigint DEFAULT 0 NOT NULL,
	"outcome" "behavioral_comparison_outcome" NOT NULL,
	"summary" text NOT NULL,
	"requested_by_user_id" uuid,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "behavioral_ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"model_id" text,
	"status" text NOT NULL,
	"input_fingerprint" text NOT NULL,
	"result" jsonb,
	"token_usage" jsonb,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "behavioral_findings"
  ADD CONSTRAINT "behavioral_findings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "behavioral_findings"
  ADD CONSTRAINT "behavioral_findings_scope_fk"
  FOREIGN KEY ("environment_id","workspace_id","project_id")
  REFERENCES "public"."project_environments"("id","workspace_id","project_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "behavioral_evidence_snapshots"
  ADD CONSTRAINT "behavioral_evidence_snapshots_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "behavioral_comparisons"
  ADD CONSTRAINT "behavioral_comparisons_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "behavioral_ai_analyses"
  ADD CONSTRAINT "behavioral_ai_analyses_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "behavioral_findings_active_scope_unique"
  ON "behavioral_findings" ("environment_id","scope_key")
  WHERE "disposition" IN ('needs_review', 'watching', 'attached_to_issue', 'issue_created');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "behavioral_findings_workspace_idx"
  ON "behavioral_findings" ("workspace_id","updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "behavioral_evidence_snapshots_issue_idx"
  ON "behavioral_evidence_snapshots" ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "behavioral_evidence_snapshots_finding_idx"
  ON "behavioral_evidence_snapshots" ("finding_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "behavioral_evidence_snapshots_finding_issue_unique"
  ON "behavioral_evidence_snapshots" ("finding_id","issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "behavioral_comparisons_issue_idx"
  ON "behavioral_comparisons" ("issue_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "behavioral_ai_analyses_finding_idx"
  ON "behavioral_ai_analyses" ("finding_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "behavioral_ai_analyses_inflight_unique"
  ON "behavioral_ai_analyses" ("finding_id","input_fingerprint")
  WHERE "status" = 'running';
