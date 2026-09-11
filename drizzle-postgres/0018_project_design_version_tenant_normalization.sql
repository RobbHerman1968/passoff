CREATE OR REPLACE FUNCTION "validate_project_design_version_tenant"() RETURNS trigger
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
