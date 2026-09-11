CREATE TABLE "project_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_key" text,
	"name" text NOT NULL,
	"current_version_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_designs_source_type_check" CHECK ("source_type" IN ('figma', 'image', 'pdf', 'video', 'url'))
);
--> statement-breakpoint
CREATE TABLE "project_design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"source_version" text,
	"source_last_modified" timestamp with time zone,
	"content_sha256" text NOT NULL,
	"payload_json" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_design_versions_positive_version_check" CHECK ("version_number" > 0),
	CONSTRAINT "project_design_versions_sha256_check" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "revision_design_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_revision_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"display_meta_json" text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_designs" ADD CONSTRAINT "project_designs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_designs" ADD CONSTRAINT "project_designs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_designs" ADD CONSTRAINT "project_designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_design_versions" ADD CONSTRAINT "project_design_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_design_versions" ADD CONSTRAINT "project_design_versions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_design_versions" ADD CONSTRAINT "project_design_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_design_versions" ADD CONSTRAINT "project_design_versions_design_id_project_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."project_designs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_design_versions" ADD CONSTRAINT "project_design_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_designs" ADD CONSTRAINT "project_designs_current_version_id_project_design_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "revision_design_versions" ADD CONSTRAINT "revision_design_versions_room_revision_id_revisions_id_fk" FOREIGN KEY ("room_revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "revision_design_versions" ADD CONSTRAINT "revision_design_versions_design_version_id_project_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "project_designs_project_source_unique" ON "project_designs" USING btree ("project_id","source_type","source_key") WHERE "source_key" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "project_designs_tenant_project_idx" ON "project_designs" USING btree ("organization_id","workspace_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_designs_project_updated_idx" ON "project_designs" USING btree ("project_id","updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_design_versions_design_version_unique" ON "project_design_versions" USING btree ("design_id","version_number");
--> statement-breakpoint
CREATE INDEX "project_design_versions_design_content_idx" ON "project_design_versions" USING btree ("design_id","content_sha256");
--> statement-breakpoint
CREATE INDEX "project_design_versions_tenant_project_idx" ON "project_design_versions" USING btree ("organization_id","workspace_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_design_versions_design_created_idx" ON "project_design_versions" USING btree ("design_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "revision_design_versions_revision_design_unique" ON "revision_design_versions" USING btree ("room_revision_id","design_version_id");
--> statement-breakpoint
CREATE INDEX "revision_design_versions_revision_sort_idx" ON "revision_design_versions" USING btree ("room_revision_id","sort_order");
--> statement-breakpoint
CREATE INDEX "revision_design_versions_design_version_idx" ON "revision_design_versions" USING btree ("design_version_id");
--> statement-breakpoint

-- Existing unversioned annotation rows cannot be assigned safely to immutable content.
DELETE FROM "figma_explanations";
--> statement-breakpoint
DELETE FROM "figma_comments";
--> statement-breakpoint
DELETE FROM "figma_questions";
--> statement-breakpoint
DELETE FROM "figma_imports";
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD COLUMN "design_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD COLUMN "design_version_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_comments" ADD COLUMN "design_version_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_questions" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_questions" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_questions" ALTER COLUMN "project_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_questions" ADD COLUMN "design_version_id" uuid NOT NULL;
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_design_id_project_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."project_designs"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_design_version_id_project_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_design_version_id_project_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "figma_questions" ADD CONSTRAINT "figma_questions_design_version_id_project_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "figma_explanations_design_version_created_idx" ON "figma_explanations" USING btree ("design_version_id","created_at");
--> statement-breakpoint
CREATE INDEX "figma_comments_design_version_created_idx" ON "figma_comments" USING btree ("design_version_id","created_at");
--> statement-breakpoint
CREATE INDEX "figma_questions_design_version_created_idx" ON "figma_questions" USING btree ("design_version_id","created_at");
--> statement-breakpoint

CREATE FUNCTION "validate_project_design_tenant"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "projects" p
		WHERE p.id = NEW.project_id
		  AND p.organization_id = NEW.organization_id
		  AND p.workspace_id = NEW.workspace_id
	) THEN
		RAISE EXCEPTION 'project design must belong to the same organization and workspace as its project';
	END IF;
	IF NEW.current_version_id IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM "project_design_versions" v
		WHERE v.id = NEW.current_version_id AND v.design_id = NEW.id
	) THEN
		RAISE EXCEPTION 'current design version must belong to the design';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "project_designs_validate_tenant"
BEFORE INSERT OR UPDATE ON "project_designs"
FOR EACH ROW EXECUTE FUNCTION "validate_project_design_tenant"();
--> statement-breakpoint
CREATE FUNCTION "validate_project_design_version_tenant"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	design_organization_id uuid;
	design_workspace_id uuid;
	design_project_id uuid;
BEGIN
	SELECT d.organization_id, d.workspace_id, d.project_id
	INTO design_organization_id, design_workspace_id, design_project_id
	FROM "project_designs" d
	WHERE d.id = NEW.design_id;
	IF design_project_id IS NULL THEN
		RAISE EXCEPTION 'design version must reference an existing design';
	END IF;
	NEW.organization_id := design_organization_id;
	NEW.workspace_id := design_workspace_id;
	NEW.project_id := design_project_id;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "project_design_versions_validate_tenant"
BEFORE INSERT OR UPDATE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "validate_project_design_version_tenant"();
--> statement-breakpoint
CREATE FUNCTION "protect_referenced_project_design_version"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	is_referenced boolean;
BEGIN
	SELECT EXISTS (
		SELECT 1 FROM "revision_design_versions" rdv
		WHERE rdv.design_version_id = OLD.id
	) INTO is_referenced;
	IF NOT is_referenced THEN
		IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
		RETURN NEW;
	END IF;
	IF TG_OP = 'UPDATE'
	   AND NEW.created_by_user_id IS NULL
	   AND OLD.created_by_user_id IS NOT NULL
	   AND ROW(NEW.id, NEW.organization_id, NEW.workspace_id, NEW.project_id, NEW.design_id,
	           NEW.version_number, NEW.source_version, NEW.source_last_modified,
	           NEW.content_sha256, NEW.payload_json, NEW.created_at)
	       IS NOT DISTINCT FROM
	       ROW(OLD.id, OLD.organization_id, OLD.workspace_id, OLD.project_id, OLD.design_id,
	           OLD.version_number, OLD.source_version, OLD.source_last_modified,
	           OLD.content_sha256, OLD.payload_json, OLD.created_at) THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'referenced project design versions are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "project_design_versions_protect_referenced"
BEFORE UPDATE OR DELETE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_referenced_project_design_version"();
--> statement-breakpoint
CREATE FUNCTION "validate_revision_design_version"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	revision_status text;
	room_project_id uuid;
	room_workspace_id uuid;
	version_project_id uuid;
	version_workspace_id uuid;
BEGIN
	SELECT r.status, rm.project_id, r.workspace_id
	INTO revision_status, room_project_id, room_workspace_id
	FROM "revisions" r
	JOIN "rooms" rm ON rm.id = r.project_id
	WHERE r.id = NEW.room_revision_id;
	IF revision_status IS NULL THEN
		RAISE EXCEPTION 'room revision not found';
	END IF;
	IF revision_status <> 'DRAFT' THEN
		RAISE EXCEPTION 'published room revision design selections are frozen';
	END IF;
	SELECT v.project_id, v.workspace_id
	INTO version_project_id, version_workspace_id
	FROM "project_design_versions" v
	WHERE v.id = NEW.design_version_id;
	IF version_project_id IS NULL
	   OR version_project_id <> room_project_id
	   OR version_workspace_id <> room_workspace_id THEN
		RAISE EXCEPTION 'room revision can only pin a design version from its parent project and workspace';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "revision_design_versions_validate"
BEFORE INSERT OR UPDATE ON "revision_design_versions"
FOR EACH ROW EXECUTE FUNCTION "validate_revision_design_version"();
--> statement-breakpoint
CREATE FUNCTION "freeze_revision_design_version"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "revisions" r
		WHERE r.id = OLD.room_revision_id AND r.status <> 'DRAFT'
	) THEN
		RAISE EXCEPTION 'published room revision design selections are frozen';
	END IF;
	RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "revision_design_versions_freeze_delete"
BEFORE DELETE ON "revision_design_versions"
FOR EACH ROW EXECUTE FUNCTION "freeze_revision_design_version"();
--> statement-breakpoint
CREATE FUNCTION "validate_figma_annotation_version"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	version_design_id uuid;
	version_project_id uuid;
	version_org_id uuid;
	version_workspace_id uuid;
BEGIN
	SELECT v.design_id, v.project_id, v.organization_id, v.workspace_id
	INTO version_design_id, version_project_id, version_org_id, version_workspace_id
	FROM "project_design_versions" v
	WHERE v.id = NEW.design_version_id;
	IF version_project_id IS NULL
	   OR version_project_id IS DISTINCT FROM NEW.project_id
	   OR version_org_id IS DISTINCT FROM NEW.organization_id
	   OR version_workspace_id IS DISTINCT FROM NEW.workspace_id THEN
		RAISE EXCEPTION 'Figma annotation must belong to the same design version tenant';
	END IF;
	IF TG_TABLE_NAME = 'figma_explanations'
	   AND version_design_id::text IS DISTINCT FROM (to_jsonb(NEW)->>'design_id') THEN
		RAISE EXCEPTION 'Figma explanation design must match its design version';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "figma_explanations_validate_version"
BEFORE INSERT OR UPDATE ON "figma_explanations"
FOR EACH ROW EXECUTE FUNCTION "validate_figma_annotation_version"();
--> statement-breakpoint
CREATE TRIGGER "figma_comments_validate_version"
BEFORE INSERT OR UPDATE ON "figma_comments"
FOR EACH ROW EXECUTE FUNCTION "validate_figma_annotation_version"();
--> statement-breakpoint
CREATE TRIGGER "figma_questions_validate_version"
BEFORE INSERT OR UPDATE ON "figma_questions"
FOR EACH ROW EXECUTE FUNCTION "validate_figma_annotation_version"();
--> statement-breakpoint
CREATE FUNCTION "protect_published_figma_explanation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.status = 'published' THEN
		IF TG_OP = 'UPDATE'
		   AND NEW.author_user_id IS NULL
		   AND OLD.author_user_id IS NOT NULL
		   AND (to_jsonb(NEW) - 'author_user_id') = (to_jsonb(OLD) - 'author_user_id') THEN
			RETURN NEW;
		END IF;
		IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
			RETURN OLD;
		END IF;
		RAISE EXCEPTION 'published Figma explanations are immutable';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "figma_explanations_protect_published"
BEFORE UPDATE OR DELETE ON "figma_explanations"
FOR EACH ROW EXECUTE FUNCTION "protect_published_figma_explanation"();
