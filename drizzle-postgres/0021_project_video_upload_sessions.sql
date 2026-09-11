CREATE TABLE "project_video_upload_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"existing_design_id" uuid,
	"created_by_user_id" uuid,
	"pathname" text NOT NULL,
	"original_filename" text NOT NULL,
	"design_name" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"width" integer,
	"height" integer,
	"declared_sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result_design_id" uuid,
	"result_design_version_id" uuid,
	"error_code" text,
	"error_message" text,
	"completion_attempt_id" uuid,
	"completion_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_video_upload_sessions_mime_check" CHECK ("mime_type" IN ('video/mp4', 'video/webm')),
	CONSTRAINT "project_video_upload_sessions_size_check" CHECK ("byte_size" > 0),
	CONSTRAINT "project_video_upload_sessions_duration_check" CHECK ("duration_ms" > 0 AND "duration_ms" <= 86400000),
	CONSTRAINT "project_video_upload_sessions_dimensions_check" CHECK (
		("width" IS NULL AND "height" IS NULL)
		OR ("width" > 0 AND "height" > 0)
	),
	CONSTRAINT "project_video_upload_sessions_sha_check" CHECK ("declared_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "project_video_upload_sessions_status_check" CHECK ("status" IN ('pending', 'completed', 'failed')),
	CONSTRAINT "project_video_upload_sessions_result_check" CHECK (
		("status" = 'pending' AND "result_design_id" IS NULL AND "result_design_version_id" IS NULL AND "error_message" IS NULL)
		OR ("status" = 'completed' AND "result_design_id" IS NOT NULL AND "result_design_version_id" IS NOT NULL AND "error_message" IS NULL)
		OR ("status" = 'failed' AND "result_design_id" IS NULL AND "result_design_version_id" IS NULL AND "error_message" IS NOT NULL)
	)
);--> statement-breakpoint
ALTER TABLE "project_video_upload_sessions" ADD CONSTRAINT "project_video_upload_sessions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_video_upload_sessions" ADD CONSTRAINT "project_video_upload_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_video_upload_sessions" ADD CONSTRAINT "project_video_upload_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_video_upload_sessions" ADD CONSTRAINT "project_video_upload_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_video_upload_sessions_pathname_unique" ON "project_video_upload_sessions" USING btree ("pathname");--> statement-breakpoint
CREATE INDEX "project_video_upload_sessions_tenant_project_idx" ON "project_video_upload_sessions" USING btree ("organization_id","workspace_id","project_id","created_at");--> statement-breakpoint
CREATE INDEX "project_video_upload_sessions_status_created_idx" ON "project_video_upload_sessions" USING btree ("status","created_at");
