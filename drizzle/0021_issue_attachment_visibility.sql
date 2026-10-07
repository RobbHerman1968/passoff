-- Ensure issue-scoped attachment/label tables exist (legacy DBs still have
-- feedback_attachments / feedback_labels from the pre-issue model).
CREATE TABLE IF NOT EXISTS "issue_attachments" (
  "asset_id" uuid PRIMARY KEY NOT NULL,
  "issue_id" uuid,
  "comment_id" uuid,
  "is_private" boolean DEFAULT true NOT NULL,
  "attached_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "issue_attachments_one_parent"
    CHECK (num_nonnulls("issue_id", "comment_id") = 1)
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_attachments"
    ADD CONSTRAINT "issue_attachments_asset_id_assets_id_fk"
    FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_attachments"
    ADD CONSTRAINT "issue_attachments_issue_id_issues_id_fk"
    FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_attachments"
    ADD CONSTRAINT "issue_attachments_comment_id_issue_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "public"."issue_comments"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_attachments_issue_idx"
  ON "issue_attachments" ("issue_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_attachments_comment_idx"
  ON "issue_attachments" ("comment_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "issue_labels" (
  "issue_id" uuid NOT NULL,
  "label_id" uuid NOT NULL,
  CONSTRAINT "issue_labels_issue_id_label_id_pk" PRIMARY KEY ("issue_id", "label_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_labels"
    ADD CONSTRAINT "issue_labels_issue_id_issues_id_fk"
    FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "issue_labels"
    ADD CONSTRAINT "issue_labels_label_id_labels_id_fk"
    FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "issue_labels_label_idx"
  ON "issue_labels" ("label_id");
--> statement-breakpoint

-- Attachments default to private (members only). Guest-visible files must be chosen explicitly.
ALTER TABLE "issue_attachments"
  ADD COLUMN IF NOT EXISTS "is_private" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "issue_attachments"
  ADD COLUMN IF NOT EXISTS "attached_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issue_attachments"
    ADD CONSTRAINT "issue_attachments_attached_by_user_id_users_id_fk"
    FOREIGN KEY ("attached_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_attachments_issue_public_idx"
  ON "issue_attachments" ("issue_id") WHERE "is_private" = false;
