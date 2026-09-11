ALTER TABLE "room_comments" ADD COLUMN "video_time_ms" integer;--> statement-breakpoint
ALTER TABLE "room_comments" ALTER COLUMN "x_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_comments" ALTER COLUMN "y_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_comments" DROP CONSTRAINT "room_comments_exactly_one_target";--> statement-breakpoint
ALTER TABLE "room_comments" ADD CONSTRAINT "room_comments_exactly_one_target" CHECK (
	(
		"revision_asset_id" IS NOT NULL
		AND "revision_design_version_id" IS NULL
		AND "design_screen_id" IS NULL
		AND "video_time_ms" IS NULL
		AND "x_percent" IS NOT NULL
		AND "y_percent" IS NOT NULL
	)
	OR
	(
		"revision_asset_id" IS NULL
		AND "revision_design_version_id" IS NOT NULL
		AND NULLIF(BTRIM("design_screen_id"), '') IS NOT NULL
		AND "video_time_ms" IS NULL
		AND "x_percent" IS NOT NULL
		AND "y_percent" IS NOT NULL
	)
	OR
	(
		"revision_asset_id" IS NULL
		AND "revision_design_version_id" IS NOT NULL
		AND "design_screen_id" IS NULL
		AND "video_time_ms" IS NOT NULL
		AND "video_time_ms" >= 0
		AND "x_percent" IS NULL
		AND "y_percent" IS NULL
	)
);--> statement-breakpoint
CREATE INDEX "room_comments_revision_video_created_idx" ON "room_comments" USING btree ("revision_design_version_id","video_time_ms","created_at");--> statement-breakpoint

CREATE TABLE "design_version_explanations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"design_id" uuid NOT NULL,
	"design_version_id" uuid NOT NULL,
	"author_user_id" uuid,
	"author_display_name" text DEFAULT 'Former member' NOT NULL,
	"target_type" text DEFAULT 'video' NOT NULL,
	"video_time_ms" integer NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "design_version_explanations_target_check" CHECK ("target_type" = 'video'),
	CONSTRAINT "design_version_explanations_time_check" CHECK ("video_time_ms" >= 0),
	CONSTRAINT "design_version_explanations_status_check" CHECK ("status" IN ('draft', 'published'))
);--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_design_id_project_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."project_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_design_version_id_project_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."project_design_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_version_explanations" ADD CONSTRAINT "design_version_explanations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "design_version_explanations_version_time_idx" ON "design_version_explanations" USING btree ("design_version_id","video_time_ms","created_at");--> statement-breakpoint
CREATE INDEX "design_version_explanations_author_updated_idx" ON "design_version_explanations" USING btree ("organization_id","workspace_id","project_id","author_user_id","updated_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION "validate_room_comment_target"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	comment_revision_room_id uuid;
	comment_revision_workspace_id uuid;
	asset_revision_id uuid;
	asset_room_id uuid;
	asset_workspace_id uuid;
	design_revision_id uuid;
	design_project_id uuid;
	design_workspace_id uuid;
	room_project_id uuid;
	version_payload jsonb;
	video_duration_ms integer;
BEGIN
	SELECT r.project_id, r.workspace_id
	INTO comment_revision_room_id, comment_revision_workspace_id
	FROM "revisions" r WHERE r.id = NEW.revision_id;
	IF comment_revision_room_id IS NULL
	   OR comment_revision_room_id <> NEW.project_id
	   OR comment_revision_workspace_id <> NEW.workspace_id THEN
		RAISE EXCEPTION 'comment revision does not belong to the room and workspace';
	END IF;

	IF NEW.revision_asset_id IS NOT NULL THEN
		SELECT ra.revision_id, a.project_id, a.workspace_id
		INTO asset_revision_id, asset_room_id, asset_workspace_id
		FROM "revision_assets" ra JOIN "assets" a ON a.id = ra.asset_id
		WHERE ra.id = NEW.revision_asset_id;
		IF asset_revision_id IS NULL OR asset_revision_id <> NEW.revision_id
		   OR asset_room_id <> NEW.project_id OR asset_workspace_id <> NEW.workspace_id THEN
			RAISE EXCEPTION 'asset target does not belong to the room revision';
		END IF;
	ELSE
		SELECT rdv.room_revision_id, pdv.project_id, pdv.workspace_id, pdv.payload_json::jsonb, rm.project_id
		INTO design_revision_id, design_project_id, design_workspace_id, version_payload, room_project_id
		FROM "revision_design_versions" rdv
		JOIN "project_design_versions" pdv ON pdv.id = rdv.design_version_id
		JOIN "revisions" rr ON rr.id = rdv.room_revision_id
		JOIN "rooms" rm ON rm.id = rr.project_id
		WHERE rdv.id = NEW.revision_design_version_id;
		IF design_revision_id IS NULL OR design_revision_id <> NEW.revision_id THEN
			RAISE EXCEPTION 'design target is not pinned to the room revision';
		END IF;
		IF room_project_id IS NULL OR design_project_id <> room_project_id
		   OR design_workspace_id <> NEW.workspace_id THEN
			RAISE EXCEPTION 'design target does not belong to the room project and workspace';
		END IF;
		IF NEW.video_time_ms IS NOT NULL THEN
			IF version_payload->>'sourceType' <> 'video' THEN
				RAISE EXCEPTION 'video comments require an immutable video version';
			END IF;
			video_duration_ms := (version_payload->'video'->>'durationMs')::integer;
			IF NEW.video_time_ms < 0 OR NEW.video_time_ms > video_duration_ms THEN
				RAISE EXCEPTION 'video comment timestamp is outside the immutable video duration';
			END IF;
		ELSIF NOT EXISTS (
			SELECT 1 FROM jsonb_array_elements(COALESCE(version_payload->'screens', '[]'::jsonb)) AS screen
			WHERE screen->>'id' = NEW.design_screen_id
		) THEN
			RAISE EXCEPTION 'design screen does not exist in the immutable version';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
DROP TRIGGER "room_comments_validate_target" ON "room_comments";--> statement-breakpoint
CREATE TRIGGER "room_comments_validate_target"
BEFORE INSERT OR UPDATE OF "workspace_id", "project_id", "revision_id", "revision_asset_id", "revision_design_version_id", "design_screen_id", "video_time_ms"
ON "room_comments" FOR EACH ROW EXECUTE FUNCTION "validate_room_comment_target"();--> statement-breakpoint

CREATE FUNCTION "validate_video_explanation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	version_record record;
	duration_ms integer;
BEGIN
	SELECT v.organization_id, v.workspace_id, v.project_id, v.design_id, v.payload_json::jsonb AS payload
	INTO version_record FROM "project_design_versions" v WHERE v.id = NEW.design_version_id;
	IF version_record.design_id IS NULL
	   OR version_record.organization_id <> NEW.organization_id
	   OR version_record.workspace_id <> NEW.workspace_id
	   OR version_record.project_id <> NEW.project_id
	   OR version_record.design_id <> NEW.design_id THEN
		RAISE EXCEPTION 'video explanation must belong to the same immutable design version tenant';
	END IF;
	IF version_record.payload->>'sourceType' <> 'video' THEN
		RAISE EXCEPTION 'video explanation target must be a video version';
	END IF;
	duration_ms := (version_record.payload->'video'->>'durationMs')::integer;
	IF NEW.video_time_ms < 0 OR NEW.video_time_ms > duration_ms THEN
		RAISE EXCEPTION 'video explanation timestamp is outside the immutable video duration';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "design_version_explanations_validate"
BEFORE INSERT OR UPDATE ON "design_version_explanations"
FOR EACH ROW EXECUTE FUNCTION "validate_video_explanation"();--> statement-breakpoint

CREATE FUNCTION "protect_published_video_explanation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF OLD.status = 'published' THEN
		IF TG_OP = 'UPDATE'
		   AND NEW.author_user_id IS NULL
		   AND OLD.author_user_id IS NOT NULL
		   AND (to_jsonb(NEW) - 'author_user_id' - 'updated_at') =
		       (to_jsonb(OLD) - 'author_user_id' - 'updated_at') THEN
			RETURN NEW;
		END IF;
		IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
		RAISE EXCEPTION 'published video explanations are immutable';
	END IF;
	IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "design_version_explanations_protect_published"
BEFORE UPDATE OR DELETE ON "design_version_explanations"
FOR EACH ROW EXECUTE FUNCTION "protect_published_video_explanation"();--> statement-breakpoint

CREATE FUNCTION "protect_immutable_video_version"() RETURNS trigger
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
CREATE TRIGGER "project_design_versions_protect_video_update"
BEFORE UPDATE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_immutable_video_version"();--> statement-breakpoint

CREATE FUNCTION "enqueue_deleted_video_objects"() RETURNS trigger
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
CREATE TRIGGER "project_design_versions_enqueue_video_delete"
AFTER DELETE ON "project_design_versions"
FOR EACH ROW EXECUTE FUNCTION "enqueue_deleted_video_objects"();
