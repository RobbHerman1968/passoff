-- Workspace members, invitations, and deletion (MVP Cleanup Story 6).
-- Reuses workspace_memberships and workspace_invitations. Safe to run more than once.

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "deleted_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "purge_after" timestamp with time zone;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "workspaces"
    ADD CONSTRAINT "workspaces_deleted_by_user_id_users_id_fk"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "workspaces_purge_after_idx"
  ON "workspaces" ("purge_after") WHERE "deleted_at" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "accepted_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "workspace_invitations" ADD COLUMN IF NOT EXISTS "send_count" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_accepted_by_user_id_users_id_fk"
    FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Store email addresses the same way every time, then keep only the newest open
-- invitation for each person before the unique index is created.
UPDATE "workspace_invitations" SET "email" = lower(btrim("email")) WHERE "email" <> lower(btrim("email"));
--> statement-breakpoint

UPDATE "workspace_invitations" i
SET "revoked_at" = now()
WHERE i."accepted_at" IS NULL
  AND i."revoked_at" IS NULL
  AND EXISTS (
    SELECT 1 FROM "workspace_invitations" n
    WHERE n."workspace_id" = i."workspace_id"
      AND n."email" = i."email"
      AND n."accepted_at" IS NULL
      AND n."revoked_at" IS NULL
      AND (n."created_at", n."id") > (i."created_at", i."id")
  );
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "workspace_invitations"
    ADD CONSTRAINT "workspace_invitations_email_normalized"
    CHECK ("email" = lower(btrim("email")));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitations_pending_email_unique"
  ON "workspace_invitations" ("workspace_id", "email")
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
--> statement-breakpoint

-- A workspace has exactly one active owner. If older data has more, keep the earliest.
UPDATE "workspace_memberships" m
SET "role" = 'member', "updated_at" = now()
WHERE m."role" = 'owner'
  AND m."status" = 'active'
  AND m."id" <> (
    SELECT o."id" FROM "workspace_memberships" o
    WHERE o."workspace_id" = m."workspace_id" AND o."role" = 'owner' AND o."status" = 'active'
    ORDER BY o."created_at", o."id"
    LIMIT 1
  );
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_memberships_one_active_owner_unique"
  ON "workspace_memberships" ("workspace_id")
  WHERE "role" = 'owner' AND "status" = 'active';
