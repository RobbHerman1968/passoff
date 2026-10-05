ALTER TABLE "issues"
  ADD COLUMN IF NOT EXISTS "assignee_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "issues"
    ADD CONSTRAINT "issues_assignee_user_id_users_id_fk"
    FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "issues_workspace_assignee_idx"
  ON "issues" ("workspace_id", "assignee_user_id");
