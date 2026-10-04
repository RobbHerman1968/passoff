DO $$ BEGIN
  CREATE TYPE "public"."website_analysis_status" AS ENUM(
    'running',
    'succeeded',
    'failed',
    'unreachable',
    'fallback'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "website_analyses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "review_id" uuid NOT NULL,
  "environment_id" uuid NOT NULL,
  "status" "website_analysis_status" DEFAULT 'running' NOT NULL,
  "evidence_fingerprint" text,
  "evidence_summary" jsonb,
  "result" jsonb,
  "model_id" text,
  "source" text,
  "error_code" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "website_analyses"
    ADD CONSTRAINT "website_analyses_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "website_analyses"
    ADD CONSTRAINT "website_analyses_review_id_reviews_id_fk"
    FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "website_analyses"
    ADD CONSTRAINT "website_analyses_environment_scope_fk"
    FOREIGN KEY ("environment_id", "workspace_id", "project_id")
    REFERENCES "public"."project_environments"("id", "workspace_id", "project_id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "website_analyses_review_completed_idx"
  ON "website_analyses" USING btree ("review_id", "completed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "website_analyses_workspace_idx"
  ON "website_analyses" USING btree ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "website_analyses_review_running_unique"
  ON "website_analyses" USING btree ("review_id")
  WHERE "status" = 'running';
