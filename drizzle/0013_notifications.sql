CREATE TYPE "public"."notification_email_status" AS ENUM('pending', 'sent', 'skipped', 'failed');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_notification_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "email_assignments" boolean DEFAULT true NOT NULL,
  "email_replies" boolean DEFAULT true NOT NULL,
  "email_verification" boolean DEFAULT true NOT NULL,
  "email_approval" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_notification_settings"
  ADD CONSTRAINT "user_notification_settings_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "workspace_id" uuid NOT NULL,
  "project_id" uuid,
  "review_id" uuid,
  "issue_id" uuid,
  "type" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "href_path" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp with time zone,
  "email_status" "notification_email_status" DEFAULT 'pending' NOT NULL,
  "email_error" text,
  "emailed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk"
  FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_review_id_reviews_id_fk"
  FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_issue_id_issues_id_fk"
  FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_unique"
  ON "notifications" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_created_idx"
  ON "notifications" ("recipient_user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_recipient_unread_idx"
  ON "notifications" ("recipient_user_id", "created_at")
  WHERE "read_at" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_workspace_idx"
  ON "notifications" ("workspace_id");
