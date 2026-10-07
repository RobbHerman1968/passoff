-- Time-based video notes (MVP Cleanup Story 5): one canonical annotation table, retention
-- deadlines for clips on closed issues, and a carry-over of any older anchors.
-- Safe to run more than once.

CREATE TABLE IF NOT EXISTS "video_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "comment_id" uuid NOT NULL,
  "video_asset_id" uuid NOT NULL,
  "timestamp_ms" integer NOT NULL,
  "normalized_x" numeric(8, 7),
  "normalized_y" numeric(8, 7),
  "duration_at_creation_ms" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "video_annotations_timestamp_nonnegative" CHECK ("timestamp_ms" >= 0),
  CONSTRAINT "video_annotations_pin_complete" CHECK (("normalized_x" IS NULL) = ("normalized_y" IS NULL)),
  CONSTRAINT "video_annotations_pin_range" CHECK (
    "normalized_x" IS NULL
    OR ("normalized_x" BETWEEN 0 AND 1 AND "normalized_y" BETWEEN 0 AND 1)
  )
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_annotations"
    ADD CONSTRAINT "video_annotations_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_annotations"
    ADD CONSTRAINT "video_annotations_issue_id_issues_id_fk"
    FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_annotations"
    ADD CONSTRAINT "video_annotations_comment_id_issue_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "public"."issue_comments"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "video_annotations"
    ADD CONSTRAINT "video_annotations_video_asset_id_video_assets_id_fk"
    FOREIGN KEY ("video_asset_id") REFERENCES "public"."video_assets"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "video_annotations_comment_unique"
  ON "video_annotations" ("comment_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "video_annotations_asset_time_idx"
  ON "video_annotations" ("video_asset_id", "timestamp_ms");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "video_annotations_issue_idx"
  ON "video_annotations" ("issue_id");
--> statement-breakpoint

-- Retention: clips on a closed issue are kept for 30 days after the issue closed. Issues that
-- closed before this change get 30 days from now at the earliest, so nothing disappears the
-- moment this ships. Clips on open issues keep no deadline.
UPDATE "video_assets" AS v
SET "retention_ends_at" = GREATEST(i."closed_at" + interval '30 days', now() + interval '30 days')
FROM "issues" AS i
WHERE v."issue_id" = i."id"
  AND i."status" = 'closed'
  AND i."closed_at" IS NOT NULL
  AND v."lifecycle" IN ('current', 'replacement')
  AND v."retention_ends_at" IS NULL;
--> statement-breakpoint

UPDATE "video_assets" AS v
SET "retention_ends_at" = NULL
FROM "issues" AS i
WHERE v."issue_id" = i."id"
  AND i."status" <> 'closed'
  AND v."retention_ends_at" IS NOT NULL
  AND v."lifecycle" IN ('current', 'replacement');
--> statement-breakpoint

-- Remembers which removal date members were already warned about, so a repeated or retried
-- job never warns twice for the same date.
ALTER TABLE "video_assets"
  ADD COLUMN IF NOT EXISTS "retention_warned_for" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "video_assets_retention_idx"
  ON "video_assets" ("retention_ends_at")
  WHERE "retention_ends_at" IS NOT NULL AND "lifecycle" IN ('current', 'replacement');
--> statement-breakpoint

-- Carry over earlier video anchors, if that table exists. Each becomes a public note on the
-- clip it pointed at, written by the issue's author. Anchors that cannot be tied to a clip
-- and an author are skipped, so nothing is invented.
DO $$
DECLARE
  anchor record;
  new_comment_id uuid;
BEGIN
  IF to_regclass('public.legacy_video_anchors') IS NULL THEN
    RETURN;
  END IF;

  FOR anchor IN EXECUTE $q$
    SELECT a.issue_id, a.timestamp_ms, a.normalized_x, a.normalized_y, a.created_at,
           i.workspace_id, i.author_user_id, i.author_guest_id,
           coalesce(
             (SELECT v.id FROM video_assets v
               WHERE v.id = a.video_asset_id AND v.issue_id = a.issue_id),
             (SELECT v.id FROM video_assets v
               WHERE v.issue_id = a.issue_id AND v.lifecycle = 'current' LIMIT 1)
           ) AS video_asset_id,
           coalesce(u.name, g.name, 'Earlier reviewer') AS author_name
    FROM legacy_video_anchors a
    JOIN issues i ON i.id = a.issue_id
    LEFT JOIN users u ON u.id = i.author_user_id
    LEFT JOIN guest_identities g ON g.id = i.author_guest_id
  $q$
  LOOP
    CONTINUE WHEN anchor.video_asset_id IS NULL;
    CONTINUE WHEN anchor.author_user_id IS NULL AND anchor.author_guest_id IS NULL;
    CONTINUE WHEN anchor.timestamp_ms < 0;
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM video_annotations x
      WHERE x.issue_id = anchor.issue_id
        AND x.video_asset_id = anchor.video_asset_id
        AND x.timestamp_ms = anchor.timestamp_ms
    );

    INSERT INTO issue_comments (
      workspace_id, issue_id, body, is_private, author_display_name,
      author_user_id, author_guest_id, created_at, updated_at
    ) VALUES (
      anchor.workspace_id, anchor.issue_id,
      'Note carried over from earlier video feedback.', false, anchor.author_name,
      CASE WHEN anchor.author_user_id IS NOT NULL THEN anchor.author_user_id ELSE NULL END,
      CASE WHEN anchor.author_user_id IS NULL THEN anchor.author_guest_id ELSE NULL END,
      anchor.created_at, anchor.created_at
    ) RETURNING id INTO new_comment_id;

    INSERT INTO video_annotations (
      workspace_id, issue_id, comment_id, video_asset_id, timestamp_ms,
      normalized_x, normalized_y, duration_at_creation_ms, created_at
    ) VALUES (
      anchor.workspace_id, anchor.issue_id, new_comment_id, anchor.video_asset_id,
      anchor.timestamp_ms,
      CASE WHEN anchor.normalized_x BETWEEN 0 AND 1 AND anchor.normalized_y BETWEEN 0 AND 1
        THEN anchor.normalized_x END,
      CASE WHEN anchor.normalized_x BETWEEN 0 AND 1 AND anchor.normalized_y BETWEEN 0 AND 1
        THEN anchor.normalized_y END,
      (SELECT duration_ms FROM video_assets WHERE id = anchor.video_asset_id),
      anchor.created_at
    );
  END LOOP;
END $$;
