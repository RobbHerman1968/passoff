DO $$ BEGIN
  CREATE TYPE "public"."platform_role" AS ENUM('user', 'admin');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "platform_role" "platform_role" DEFAULT 'user' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_platform_admin_idx"
  ON "users" ("platform_role")
  WHERE "platform_role" = 'admin' AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "target_user_id" uuid NOT NULL,
  "target_email" text NOT NULL,
  "actor" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "platform_audit_events"
    ADD CONSTRAINT "platform_audit_events_target_user_id_users_id_fk"
    FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_events_created_idx"
  ON "platform_audit_events" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_audit_events_target_user_idx"
  ON "platform_audit_events" ("target_user_id");
