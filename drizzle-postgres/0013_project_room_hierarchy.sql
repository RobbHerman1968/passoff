-- Establish the durable Project -> Room hierarchy without breaking existing room URLs.
-- The former projects table stored approval rooms; it becomes rooms. A new projects
-- table owns design files, Figma content, explanations, and developer handoffs.

ALTER TABLE "projects" RENAME TO "rooms";
--> statement-breakpoint
ALTER TABLE "rooms" RENAME CONSTRAINT "projects_pkey" TO "rooms_pkey";
--> statement-breakpoint
ALTER INDEX IF EXISTS "projects_workspace_slug_unique" RENAME TO "rooms_workspace_slug_unique";
--> statement-breakpoint
ALTER INDEX IF EXISTS "projects_organization_idx" RENAME TO "rooms_organization_idx";
--> statement-breakpoint
ALTER INDEX IF EXISTS "projects_workspace_status_updated_idx" RENAME TO "rooms_workspace_status_updated_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rooms_workspace_status_updated_idx" ON "rooms" USING btree ("workspace_id","status","updated_at");
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "client_projects_workspace_slug_unique" ON "projects" USING btree ("workspace_id","slug");
--> statement-breakpoint
CREATE INDEX "client_projects_organization_idx" ON "projects" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "client_projects_workspace_status_updated_idx" ON "projects" USING btree ("workspace_id","status","updated_at");
--> statement-breakpoint
INSERT INTO "projects" (
	"id", "organization_id", "workspace_id", "name", "client_name", "slug",
	"status", "archived_at", "created_at", "updated_at"
)
SELECT
	"id", "organization_id", "workspace_id", "name", "client_name", "slug",
	CASE WHEN "status" = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,
	"archived_at", "created_at", "updated_at"
FROM "rooms";
--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "project_id" uuid;
--> statement-breakpoint
UPDATE "rooms" SET "project_id" = "id";
--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "rooms_project_idx" ON "rooms" USING btree ("project_id");
--> statement-breakpoint
CREATE FUNCTION "ensure_room_project_parent"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.project_id IS NULL THEN
		INSERT INTO "projects" (
			"id", "organization_id", "workspace_id", "name", "client_name", "slug",
			"status", "archived_at", "created_at", "updated_at"
		) VALUES (
			NEW.id, NEW.organization_id, NEW.workspace_id, NEW.name, NEW.client_name, NEW.slug,
			CASE WHEN NEW.status = 'ARCHIVED' THEN 'ARCHIVED' ELSE 'ACTIVE' END,
			NEW.archived_at, NEW.created_at, NEW.updated_at
		)
		ON CONFLICT (id) DO NOTHING;
		NEW.project_id := NEW.id;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM "projects" p
		WHERE p.id = NEW.project_id
		  AND p.organization_id = NEW.organization_id
		  AND p.workspace_id = NEW.workspace_id
	) THEN
		RAISE EXCEPTION 'room project must belong to the same organization and workspace';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "rooms_ensure_project_parent"
BEFORE INSERT OR UPDATE OF "project_id", "organization_id", "workspace_id" ON "rooms"
FOR EACH ROW EXECUTE FUNCTION "ensure_room_project_parent"();
--> statement-breakpoint

-- Design-domain rows now belong to the new project parent. Existing identifiers
-- remain valid because every backfilled project intentionally retains its room UUID.
ALTER TABLE "figma_questions" DROP CONSTRAINT IF EXISTS "figma_questions_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_questions" ADD CONSTRAINT "figma_questions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_comments" DROP CONSTRAINT IF EXISTS "figma_comments_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_explanations" DROP CONSTRAINT IF EXISTS "figma_explanations_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_imports" DROP CONSTRAINT IF EXISTS "figma_imports_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "openai_runs" DROP CONSTRAINT IF EXISTS "openai_runs_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "openai_runs" ADD CONSTRAINT "openai_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" DROP CONSTRAINT IF EXISTS "developer_handoff_snapshots_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD COLUMN "source_room_id" uuid;
--> statement-breakpoint
ALTER TABLE "developer_handoff_snapshots" ADD CONSTRAINT "developer_handoff_snapshots_source_room_id_rooms_id_fk" FOREIGN KEY ("source_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "reject_developer_handoff_snapshot_update"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	clear_source_import boolean;
	clear_source_room boolean;
	clear_publisher boolean;
BEGIN
	clear_source_import := TG_TABLE_NAME = 'developer_handoff_snapshots'
		AND NEW.source_import_id IS NULL
		AND OLD.source_import_id IS NOT NULL;
	clear_source_room := TG_TABLE_NAME = 'developer_handoff_snapshots'
		AND NEW.source_room_id IS NULL
		AND OLD.source_room_id IS NOT NULL;
	clear_publisher := TG_TABLE_NAME = 'developer_handoff_snapshots'
		AND NEW.published_by_user_id IS NULL
		AND OLD.published_by_user_id IS NOT NULL;
	IF clear_source_import OR clear_source_room OR clear_publisher THEN
		NEW := OLD;
		IF clear_source_import THEN
			NEW.source_import_id := NULL;
		END IF;
		IF clear_source_room THEN
			NEW.source_room_id := NULL;
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
ALTER TABLE "developer_handoff_links" DROP CONSTRAINT IF EXISTS "developer_handoff_links_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "developer_handoff_links" ADD CONSTRAINT "developer_handoff_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
