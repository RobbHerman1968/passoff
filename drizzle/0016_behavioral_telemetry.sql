DO $$ BEGIN
 CREATE TYPE "public"."telemetry_collection_mode" AS ENUM('off', 'strict_consent', 'privacy_first_aggregate');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."telemetry_event_type" AS ENUM('page_view', 'element_click', 'scroll_milestone', 'repeat_click_signal', 'dead_click_candidate', 'sanitized_javascript_error');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."telemetry_viewport_group" AS ENUM('mobile', 'tablet', 'desktop');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."telemetry_traffic_kind" AS ENUM('production', 'test');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."telemetry_consent_state" AS ENUM('granted', 'aggregate_notice');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "environment_telemetry_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"collection_mode" "telemetry_collection_mode" DEFAULT 'off' NOT NULL,
	"enabled_origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_routes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sampling_percent" integer DEFAULT 100 NOT NULL,
	"raw_retention_hours" integer DEFAULT 72 NOT NULL,
	"aggregate_retention_days" integer DEFAULT 90 NOT NULL,
	"min_sample_sessions" integer DEFAULT 10 NOT NULL,
	"organization_name" text,
	"privacy_policy_url" text,
	"hide_built_in_privacy_link" boolean DEFAULT false NOT NULL,
	"test_mode_enabled" boolean DEFAULT false NOT NULL,
	"environment_kill_switch" boolean DEFAULT false NOT NULL,
	"last_accepted_event_at" timestamp with time zone,
	"last_aggregated_at" timestamp with time zone,
	"last_limit_notified_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_raw_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"schema_version" integer NOT NULL,
	"event_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"event_type" "telemetry_event_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"traffic_kind" "telemetry_traffic_kind" DEFAULT 'production' NOT NULL,
	"consent_state" "telemetry_consent_state" NOT NULL,
	"normalized_route" text NOT NULL,
	"deployment_version" text DEFAULT '' NOT NULL,
	"viewport_group" "telemetry_viewport_group" NOT NULL,
	"sampling_percent" integer NOT NULL,
	"coordinate_bucket_x" integer,
	"coordinate_bucket_y" integer,
	"element_category" text,
	"analytics_label" text,
	"scroll_milestone" integer,
	"error_category" text,
	"error_fingerprint" text,
	"source_category" text,
	"tab_session_hash" text NOT NULL,
	"hour_bucket" timestamp with time zone NOT NULL,
	"aggregated_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_ingest_dedup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedup_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"traffic_kind" "telemetry_traffic_kind" DEFAULT 'production' NOT NULL,
	"hour_bucket" timestamp with time zone NOT NULL,
	"deployment_version" text DEFAULT '' NOT NULL,
	"normalized_route" text NOT NULL,
	"viewport_group" "telemetry_viewport_group" NOT NULL,
	"event_type" "telemetry_event_type" NOT NULL,
	"element_category" text DEFAULT '' NOT NULL,
	"analytics_label" text DEFAULT '' NOT NULL,
	"coordinate_bucket_x" integer DEFAULT -1 NOT NULL,
	"coordinate_bucket_y" integer DEFAULT -1 NOT NULL,
	"scroll_milestone" integer DEFAULT -1 NOT NULL,
	"error_category" text DEFAULT '' NOT NULL,
	"error_fingerprint" text DEFAULT '' NOT NULL,
	"event_count" bigint DEFAULT 0 NOT NULL,
	"tab_session_count" bigint DEFAULT 0 NOT NULL,
	"first_occurred_at" timestamp with time zone,
	"last_occurred_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_aggregation_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"environment_id" uuid NOT NULL,
	"last_aggregated_at" timestamp with time zone,
	"last_raw_event_id" uuid,
	"accepted_event_count" bigint DEFAULT 0 NOT NULL,
	"aggregated_event_count" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"accepted_events" bigint DEFAULT 0 NOT NULL,
	"dropped_events" bigint DEFAULT 0 NOT NULL,
	"sampled_out_events" bigint DEFAULT 0 NOT NULL,
	"error_events" bigint DEFAULT 0 NOT NULL,
	"test_events" bigint DEFAULT 0 NOT NULL,
	"limited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_view_exchanges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"view_scope" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_view_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"view_scope" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_telemetry_controls" (
	"id" text PRIMARY KEY NOT NULL,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"updated_by_user_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "platform_telemetry_controls" ("id", "kill_switch")
VALUES ('platform', false)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_settings_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_settings_scope_fk"
  FOREIGN KEY ("environment_id","workspace_id","project_id")
  REFERENCES "public"."project_environments"("id","workspace_id","project_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_raw_events"
  ADD CONSTRAINT "telemetry_raw_events_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_raw_events"
  ADD CONSTRAINT "telemetry_raw_events_scope_fk"
  FOREIGN KEY ("environment_id","workspace_id","project_id")
  REFERENCES "public"."project_environments"("id","workspace_id","project_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_aggregates"
  ADD CONSTRAINT "telemetry_aggregates_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_aggregates"
  ADD CONSTRAINT "telemetry_aggregates_scope_fk"
  FOREIGN KEY ("environment_id","workspace_id","project_id")
  REFERENCES "public"."project_environments"("id","workspace_id","project_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_usage_counters"
  ADD CONSTRAINT "telemetry_usage_counters_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_view_exchanges"
  ADD CONSTRAINT "telemetry_view_exchanges_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_view_sessions"
  ADD CONSTRAINT "telemetry_view_sessions_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "platform_telemetry_controls"
  ADD CONSTRAINT "platform_telemetry_controls_updated_by_user_id_users_id_fk"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "environment_telemetry_settings_environment_unique"
  ON "environment_telemetry_settings" ("environment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "environment_telemetry_settings_workspace_idx"
  ON "environment_telemetry_settings" ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_raw_events_event_id_unique"
  ON "telemetry_raw_events" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_raw_events_env_received_idx"
  ON "telemetry_raw_events" ("environment_id","received_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_raw_events_unaggregated_idx"
  ON "telemetry_raw_events" ("environment_id","received_at")
  WHERE "aggregated_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_raw_events_expires_idx"
  ON "telemetry_raw_events" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_ingest_dedup_key_unique"
  ON "telemetry_ingest_dedup" ("environment_id","kind","dedup_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_ingest_dedup_expires_idx"
  ON "telemetry_ingest_dedup" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_aggregates_dimension_unique"
  ON "telemetry_aggregates" (
    "environment_id",
    "traffic_kind",
    "hour_bucket",
    "deployment_version",
    "normalized_route",
    "viewport_group",
    "event_type",
    "element_category",
    "analytics_label",
    "coordinate_bucket_x",
    "coordinate_bucket_y",
    "scroll_milestone",
    "error_category",
    "error_fingerprint"
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_aggregates_query_idx"
  ON "telemetry_aggregates" ("environment_id","traffic_kind","hour_bucket","normalized_route","event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_aggregates_expires_idx"
  ON "telemetry_aggregates" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_aggregation_checkpoints_env_unique"
  ON "telemetry_aggregation_checkpoints" ("environment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_usage_counters_env_period_unique"
  ON "telemetry_usage_counters" ("environment_id","period_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_usage_counters_workspace_period_idx"
  ON "telemetry_usage_counters" ("workspace_id","period_start");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_view_exchanges_code_hash_unique"
  ON "telemetry_view_exchanges" ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_view_exchanges_expiry_idx"
  ON "telemetry_view_exchanges" ("expires_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_view_sessions_token_hash_unique"
  ON "telemetry_view_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_view_sessions_expiry_idx"
  ON "telemetry_view_sessions" ("expires_at");
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings" DROP CONSTRAINT IF EXISTS "environment_telemetry_sampling_range";
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_sampling_range"
  CHECK ("sampling_percent" >= 1 AND "sampling_percent" <= 100);
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings" DROP CONSTRAINT IF EXISTS "environment_telemetry_raw_retention_range";
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_raw_retention_range"
  CHECK ("raw_retention_hours" >= 1 AND "raw_retention_hours" <= 168);
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings" DROP CONSTRAINT IF EXISTS "environment_telemetry_aggregate_retention_range";
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_aggregate_retention_range"
  CHECK ("aggregate_retention_days" >= 1 AND "aggregate_retention_days" <= 365);
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings" DROP CONSTRAINT IF EXISTS "environment_telemetry_version_positive";
--> statement-breakpoint
ALTER TABLE "environment_telemetry_settings"
  ADD CONSTRAINT "environment_telemetry_version_positive"
  CHECK ("version" > 0);
