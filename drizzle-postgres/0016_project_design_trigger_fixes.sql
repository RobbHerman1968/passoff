CREATE OR REPLACE FUNCTION "validate_figma_annotation_version"() RETURNS trigger
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
DROP TRIGGER IF EXISTS "figma_explanations_protect_published" ON "figma_explanations";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "protect_published_figma_explanation"() RETURNS trigger
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
