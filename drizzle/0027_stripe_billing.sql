-- Stripe billing (MVP Cleanup Story 7). Extends the existing subscriptions table.
-- Nothing is deleted or rewritten. Safe to run more than once.

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "billing_interval" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provider_price_id" text;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "past_due_since" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provider_event_at" timestamp with time zone;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_billing_interval_valid"
    CHECK ("billing_interval" IS NULL OR "billing_interval" IN ('month', 'year'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

-- Any workspace that already had a trialing subscription has used its trial.
UPDATE "subscriptions"
SET "trial_started_at" = COALESCE("trial_started_at", "created_at")
WHERE "status" = 'trialing' AND "trial_started_at" IS NULL;
