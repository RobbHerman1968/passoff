ALTER TABLE "projects" ADD COLUMN "figma_plugin_key_hash" text;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "figma_plugin_key_created_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_figma_plugin_key_hash_check"
CHECK ("figma_plugin_key_hash" IS NULL OR "figma_plugin_key_hash" ~ '^[0-9a-f]{64}$');
