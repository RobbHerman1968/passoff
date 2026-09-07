CREATE TABLE "developer_handoff_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"figma_file_key" text NOT NULL,
	"source_import_id" uuid,
	"version" integer NOT NULL,
	"source_approved_revision_id" uuid,
	"source_approved_revision_number" integer,
	"source_approved_revision_digest" text,
	"source_approval_id" uuid,
	"source_approved_at" timestamp with time zone,
	"source_approver_display_name" text,
	"payload_json" text NOT NULL,
	"content_sha256" text NOT NULL,
	"published_by_user_id" uuid,
	"published_by_display_name" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_handoff_snapshot_screens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"figma_file_key" text NOT NULL,
	"figma_node_id" text NOT NULL,
	"storage_provider" text NOT NULL,
	"object_key" text NOT NULL,
	"blob_url" text,
	"content_type" text DEFAULT 'image/png' NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_handoff_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_viewed_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_source_import_id_figma_imports_id_fk" FOREIGN KEY ("source_import_id") REFERENCES "public"."figma_imports"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshot_screens" ADD CONSTRAINT "developer_handoff_snapshot_screens_snapshot_id_developer_handoff_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."developer_handoff_snapshots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_snapshot_id_developer_handoff_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."developer_handoff_snapshots"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "developer_handoff_snapshots_project_file_version_unique" ON "developer_handoff_snapshots" USING btree ("project_id","figma_file_key","version");
--> statement-breakpoint
CREATE INDEX "developer_handoff_snapshots_tenant_project_idx" ON "developer_handoff_snapshots" USING btree ("organization_id","workspace_id","project_id","published_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "developer_handoff_snapshot_screens_snapshot_node_unique" ON "developer_handoff_snapshot_screens" USING btree ("snapshot_id","figma_file_key","figma_node_id");
--> statement-breakpoint
CREATE INDEX "developer_handoff_snapshot_screens_snapshot_idx" ON "developer_handoff_snapshot_screens" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "developer_handoff_links_token_hash_unique" ON "developer_handoff_links" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX "developer_handoff_links_project_created_idx" ON "developer_handoff_links" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX "developer_handoff_links_snapshot_idx" ON "developer_handoff_links" USING btree ("snapshot_id");
--> statement-breakpoint
CREATE FUNCTION "reject_developer_handoff_snapshot_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	clear_source_import boolean;
	clear_publisher boolean;
BEGIN
	clear_source_import := TG_TABLE_NAME = 'developer_handoff_snapshots'
		AND NEW.source_import_id IS NULL
		AND OLD.source_import_id IS NOT NULL;
	clear_publisher := TG_TABLE_NAME = 'developer_handoff_snapshots'
		AND NEW.published_by_user_id IS NULL
		AND OLD.published_by_user_id IS NOT NULL;
	IF clear_source_import OR clear_publisher THEN
		NEW := OLD;
		IF clear_source_import THEN
			NEW.source_import_id := NULL;
		END IF;
		IF clear_publisher THEN
			NEW.published_by_user_id := NULL;
		END IF;
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'developer handoff snapshots are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "developer_handoff_snapshots_no_update"
BEFORE UPDATE ON "developer_handoff_snapshots"
FOR EACH ROW EXECUTE FUNCTION "reject_developer_handoff_snapshot_update"();
--> statement-breakpoint
CREATE TRIGGER "developer_handoff_snapshot_screens_no_update"
BEFORE UPDATE ON "developer_handoff_snapshot_screens"
FOR EACH ROW EXECUTE FUNCTION "reject_developer_handoff_snapshot_update"();
