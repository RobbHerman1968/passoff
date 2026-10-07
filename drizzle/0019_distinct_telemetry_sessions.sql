CREATE TABLE IF NOT EXISTS "telemetry_aggregate_sessions" (
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
	"tab_session_hash" text NOT NULL,
	"first_occurred_at" timestamp with time zone NOT NULL,
	"last_occurred_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telemetry_aggregate_sessions"
  ADD CONSTRAINT "telemetry_aggregate_sessions_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "telemetry_aggregate_sessions"
  ADD CONSTRAINT "telemetry_aggregate_sessions_scope_fk"
  FOREIGN KEY ("environment_id","workspace_id","project_id")
  REFERENCES "public"."project_environments"("id","workspace_id","project_id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_aggregate_sessions_dimension_unique"
  ON "telemetry_aggregate_sessions" (
    "environment_id","traffic_kind","hour_bucket","deployment_version",
    "normalized_route","viewport_group","event_type","element_category",
    "analytics_label","coordinate_bucket_x","coordinate_bucket_y",
    "scroll_milestone","error_category","error_fingerprint","tab_session_hash"
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_aggregate_sessions_query_idx"
  ON "telemetry_aggregate_sessions" (
    "environment_id","traffic_kind","normalized_route","deployment_version",
    "viewport_group","event_type","hour_bucket"
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telemetry_aggregate_sessions_expires_idx"
  ON "telemetry_aggregate_sessions" ("expires_at");
--> statement-breakpoint
INSERT INTO "telemetry_aggregate_sessions" (
  "workspace_id","project_id","environment_id","traffic_kind","hour_bucket",
  "deployment_version","normalized_route","viewport_group","event_type",
  "element_category","analytics_label","coordinate_bucket_x","coordinate_bucket_y",
  "scroll_milestone","error_category","error_fingerprint","tab_session_hash",
  "first_occurred_at","last_occurred_at","expires_at"
)
SELECT
  raw."workspace_id", raw."project_id", raw."environment_id", raw."traffic_kind",
  raw."hour_bucket", raw."deployment_version", raw."normalized_route",
  raw."viewport_group", raw."event_type", COALESCE(raw."element_category", ''),
  COALESCE(raw."analytics_label", ''), COALESCE(raw."coordinate_bucket_x", -1),
  COALESCE(raw."coordinate_bucket_y", -1), COALESCE(raw."scroll_milestone", -1),
  COALESCE(raw."error_category", ''), COALESCE(raw."error_fingerprint", ''),
  raw."tab_session_hash", MIN(raw."occurred_at"), MAX(raw."occurred_at"),
  now() + make_interval(days => settings."aggregate_retention_days")
FROM "telemetry_raw_events" raw
INNER JOIN "environment_telemetry_settings" settings
  ON settings."environment_id" = raw."environment_id"
GROUP BY
  raw."workspace_id", raw."project_id", raw."environment_id", raw."traffic_kind",
  raw."hour_bucket", raw."deployment_version", raw."normalized_route",
  raw."viewport_group", raw."event_type", COALESCE(raw."element_category", ''),
  COALESCE(raw."analytics_label", ''), COALESCE(raw."coordinate_bucket_x", -1),
  COALESCE(raw."coordinate_bucket_y", -1), COALESCE(raw."scroll_milestone", -1),
  COALESCE(raw."error_category", ''), COALESCE(raw."error_fingerprint", ''),
  raw."tab_session_hash", settings."aggregate_retention_days"
ON CONFLICT DO NOTHING;
