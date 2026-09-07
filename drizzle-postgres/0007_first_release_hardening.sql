-- First-release hardening: private tenants, Blob metadata, outbox claims, Stripe idempotency.

ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "notification_email" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_name" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "current_published_revision_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "approved_revision_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "handoff_released_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "storage_provider" text DEFAULT 'local' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "blob_url" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "upload_status" text DEFAULT 'ready' NOT NULL;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "upload_session_id" text;
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "revision_id" uuid;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "claimed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "claim_token" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blob_deletion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"blob_url" text,
	"reason" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_events_event_id_unique" ON "stripe_webhook_events" USING btree ("stripe_event_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_hash_unique" ON "password_reset_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blob_deletion_jobs_pending_idx" ON "blob_deletion_jobs" USING btree ("processed_at","available_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assets_upload_status_created_idx" ON "assets" USING btree ("upload_status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "assets_upload_session_unique" ON "assets" USING btree ("upload_session_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_events_idempotency_unique" ON "outbox_events" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "outbox_events_claim_idx" ON "outbox_events" USING btree ("claimed_at","processed_at");
--> statement-breakpoint
-- Persist trial rows for orgs that have none (14 days from now, one-time backfill).
INSERT INTO "subscriptions" (
  "organization_id",
  "provider",
  "plan",
  "status",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end"
)
SELECT
  o.id,
  'passoff',
  'trial',
  'trialing',
  now(),
  now() + interval '14 days',
  0
FROM "organizations" o
WHERE NOT EXISTS (
  SELECT 1 FROM "subscriptions" s WHERE s.organization_id = o.id
);
--> statement-breakpoint
-- Default workspace notification email from owner membership when unset.
UPDATE "workspaces" w
SET "notification_email" = u.email,
    "updated_at" = now()
FROM "workspace_memberships" wm
JOIN "users" u ON u.id = wm.user_id
WHERE wm.workspace_id = w.id
  AND wm.role = 'owner'
  AND (w.notification_email IS NULL OR w.notification_email = '');
