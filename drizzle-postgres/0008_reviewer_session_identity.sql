-- Reviewer identity is session-bound, not email-unique.
-- Multiple browser sessions may share a display email without claiming each other.
DROP INDEX IF EXISTS "reviewers_project_email_unique";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviewers_project_email_idx" ON "reviewers" ("project_id", "email");
