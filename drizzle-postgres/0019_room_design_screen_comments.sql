ALTER TABLE "figma_explanations" ADD COLUMN "selection_width_basis_points" integer;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD COLUMN "selection_height_basis_points" integer;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD COLUMN "author_display_name" text DEFAULT 'Former member' NOT NULL;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_selection_size_pair" CHECK (("selection_width_basis_points" IS NULL) = ("selection_height_basis_points" IS NULL));--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_selection_width_range" CHECK ("selection_width_basis_points" IS NULL OR ("selection_width_basis_points" > 0 AND "selection_width_basis_points" <= 10000));--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_selection_height_range" CHECK ("selection_height_basis_points" IS NULL OR ("selection_height_basis_points" > 0 AND "selection_height_basis_points" <= 10000));--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_selection_horizontal_bounds" CHECK ("selection_width_basis_points" IS NULL OR ("x_basis_points" - ("selection_width_basis_points" / 2.0) >= 0 AND "x_basis_points" + ("selection_width_basis_points" / 2.0) <= 10000));--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_selection_vertical_bounds" CHECK ("selection_height_basis_points" IS NULL OR ("y_basis_points" - ("selection_height_basis_points" / 2.0) >= 0 AND "y_basis_points" + ("selection_height_basis_points" / 2.0) <= 10000));--> statement-breakpoint

ALTER TABLE "room_comments" ALTER COLUMN "revision_asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_comments" ADD COLUMN "revision_design_version_id" uuid;--> statement-breakpoint
ALTER TABLE "room_comments" ADD COLUMN "design_screen_id" text;--> statement-breakpoint
ALTER TABLE "room_comments" ADD CONSTRAINT "room_comments_revision_design_version_id_revision_design_versions_id_fk" FOREIGN KEY ("revision_design_version_id") REFERENCES "public"."revision_design_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_comments" ADD CONSTRAINT "room_comments_exactly_one_target" CHECK (
	(
		"revision_asset_id" IS NOT NULL
		AND "revision_design_version_id" IS NULL
		AND "design_screen_id" IS NULL
	)
	OR
	(
		"revision_asset_id" IS NULL
		AND "revision_design_version_id" IS NOT NULL
		AND NULLIF(BTRIM("design_screen_id"), '') IS NOT NULL
	)
);--> statement-breakpoint

DROP INDEX IF EXISTS "room_comments_revision_asset_created_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "room_comments_project_status_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "room_comments_revision_idx";--> statement-breakpoint
CREATE INDEX "room_comments_revision_asset_created_idx" ON "room_comments" USING btree ("revision_asset_id","created_at");--> statement-breakpoint
CREATE INDEX "room_comments_revision_design_screen_created_idx" ON "room_comments" USING btree ("revision_design_version_id","design_screen_id","created_at");--> statement-breakpoint
CREATE INDEX "room_comments_revision_status_idx" ON "room_comments" USING btree ("revision_id","status");--> statement-breakpoint

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
BEGIN
	SELECT r.project_id, r.workspace_id
	INTO comment_revision_room_id, comment_revision_workspace_id
	FROM "revisions" r
	WHERE r.id = NEW.revision_id;

	IF comment_revision_room_id IS NULL
	   OR comment_revision_room_id <> NEW.project_id
	   OR comment_revision_workspace_id <> NEW.workspace_id THEN
		RAISE EXCEPTION 'comment revision does not belong to the room and workspace';
	END IF;

	IF NEW.revision_asset_id IS NOT NULL THEN
		SELECT ra.revision_id, a.project_id, a.workspace_id
		INTO asset_revision_id, asset_room_id, asset_workspace_id
		FROM "revision_assets" ra
		JOIN "assets" a ON a.id = ra.asset_id
		WHERE ra.id = NEW.revision_asset_id;

		IF asset_revision_id IS NULL
		   OR asset_revision_id <> NEW.revision_id
		   OR asset_room_id <> NEW.project_id
		   OR asset_workspace_id <> NEW.workspace_id THEN
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

		IF design_revision_id IS NULL
		   OR design_revision_id <> NEW.revision_id THEN
			RAISE EXCEPTION 'design target is not pinned to the room revision';
		END IF;
		IF room_project_id IS NULL
		   OR design_project_id <> room_project_id
		   OR design_workspace_id <> NEW.workspace_id THEN
			RAISE EXCEPTION 'design target does not belong to the room project and workspace';
		END IF;
		IF NOT EXISTS (
			SELECT 1
			FROM jsonb_array_elements(COALESCE(version_payload->'screens', '[]'::jsonb)) AS screen
			WHERE screen->>'id' = NEW.design_screen_id
		) THEN
			RAISE EXCEPTION 'design screen does not exist in the immutable version';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "room_comments_validate_target"
BEFORE INSERT OR UPDATE OF "workspace_id", "project_id", "revision_id", "revision_asset_id", "revision_design_version_id", "design_screen_id"
ON "room_comments"
FOR EACH ROW EXECUTE FUNCTION "validate_room_comment_target"();
