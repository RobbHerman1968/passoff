CREATE OR REPLACE FUNCTION "protect_immutable_video_version"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.payload_json::jsonb->>'sourceType' = 'video' THEN
		IF NEW.created_by_user_id IS NULL
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
		RAISE EXCEPTION 'video design versions are immutable';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "project_design_versions_protect_video_update" ON "project_design_versions";--> statement-breakpoint
CREATE TRIGGER "project_design_versions_protect_video_update"
BEFORE UPDATE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_immutable_video_version"();--> statement-breakpoint

CREATE OR REPLACE FUNCTION "enqueue_deleted_video_objects"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	video jsonb;
	video_key text;
	poster_key text;
BEGIN
	IF OLD.payload_json::jsonb->>'sourceType' <> 'video' THEN RETURN OLD; END IF;
	video := OLD.payload_json::jsonb->'video';
	video_key := video->>'objectKey';
	poster_key := video->'poster'->>'objectKey';
	IF video_key IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM project_design_versions v
		WHERE v.payload_json::jsonb->>'sourceType' = 'video'
		  AND (
		    v.payload_json::jsonb->'video'->>'objectKey' = video_key
		    OR v.payload_json::jsonb->'video'->'poster'->>'objectKey' = video_key
		  )
	) THEN
		INSERT INTO blob_deletion_jobs (workspace_id, object_key, blob_url, reason)
		VALUES (OLD.workspace_id, video_key, video->>'blobUrl', 'deleted_video_version');
	END IF;
	IF poster_key IS NOT NULL AND NOT EXISTS (
		SELECT 1 FROM project_design_versions v
		WHERE v.payload_json::jsonb->>'sourceType' = 'video'
		  AND (
		    v.payload_json::jsonb->'video'->>'objectKey' = poster_key
		    OR v.payload_json::jsonb->'video'->'poster'->>'objectKey' = poster_key
		  )
	) THEN
		INSERT INTO blob_deletion_jobs (workspace_id, object_key, blob_url, reason)
		VALUES (OLD.workspace_id, poster_key, video->'poster'->>'blobUrl', 'deleted_video_poster');
	END IF;
	RETURN OLD;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "project_design_versions_enqueue_video_delete" ON "project_design_versions";--> statement-breakpoint
CREATE TRIGGER "project_design_versions_enqueue_video_delete"
AFTER DELETE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "enqueue_deleted_video_objects"();
