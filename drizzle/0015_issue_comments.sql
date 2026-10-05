CREATE TABLE IF NOT EXISTS "issue_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "issue_id" uuid NOT NULL,
  "body" text NOT NULL,
  "is_private" boolean DEFAULT false NOT NULL,
  "author_user_id" uuid,
  "author_guest_id" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_issue_id_issues_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_author_user_id_users_id_fk"
  FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_author_guest_id_guest_identities_id_fk"
  FOREIGN KEY ("author_guest_id") REFERENCES "public"."guest_identities"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issue_comments_issue_created_idx"
  ON "issue_comments" ("issue_id", "created_at");
--> statement-breakpoint
ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_has_one_author";
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_has_one_author"
  CHECK (num_nonnulls("author_user_id", "author_guest_id") = 1);
--> statement-breakpoint
ALTER TABLE "issue_comments" DROP CONSTRAINT IF EXISTS "issue_comments_private_requires_user";
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ADD CONSTRAINT "issue_comments_private_requires_user"
  CHECK (not "is_private" or "author_user_id" is not null);
--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "issue_id" uuid;
--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN IF NOT EXISTS "comment_id" uuid;
--> statement-breakpoint
ALTER TABLE "mentions" DROP CONSTRAINT IF EXISTS "mentions_issue_id_issues_id_fk";
--> statement-breakpoint
ALTER TABLE "mentions"
  ADD CONSTRAINT "mentions_issue_id_issues_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentions" DROP CONSTRAINT IF EXISTS "mentions_comment_id_issue_comments_id_fk";
--> statement-breakpoint
ALTER TABLE "mentions"
  ADD CONSTRAINT "mentions_comment_id_issue_comments_id_fk"
  FOREIGN KEY ("comment_id") REFERENCES "public"."issue_comments"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mentions" DROP CONSTRAINT IF EXISTS "mentions_one_parent";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mentions' AND column_name = 'feedback_id'
  ) THEN
    ALTER TABLE "mentions"
      ADD CONSTRAINT "mentions_one_parent"
      CHECK (
        num_nonnulls("issue_id", "comment_id") = 1
        OR num_nonnulls("feedback_id", "reply_id") = 1
      );
  ELSE
    ALTER TABLE "mentions"
      ADD CONSTRAINT "mentions_one_parent"
      CHECK (num_nonnulls("issue_id", "comment_id") = 1);
  END IF;
END $$;
