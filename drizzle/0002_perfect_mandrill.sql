CREATE TABLE `openai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriber_id` text,
	`question_id` text NOT NULL,
	`figma_connection_id` text NOT NULL,
	`figma_file_key` text NOT NULL,
	`figma_file_name` text NOT NULL,
	`screen_id` text NOT NULL,
	`screen_name` text NOT NULL,
	`question` text NOT NULL,
	`model` text NOT NULL,
	`response_id` text,
	`status` text NOT NULL,
	`input_tokens` integer NOT NULL,
	`cached_input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`total_tokens` integer NOT NULL,
	`input_rate_per_million` real,
	`cached_input_rate_per_million` real,
	`output_rate_per_million` real,
	`estimated_cost_usd` real,
	`latency_ms` integer NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscriber_id`) REFERENCES `subscribers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`plan` text DEFAULT 'prototype' NOT NULL,
	`billing_provider` text,
	`billing_customer_id` text,
	`billing_subscription_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscribers_email_unique` ON `subscribers` (`email`);--> statement-breakpoint
ALTER TABLE `figma_connections` ADD `subscriber_id` text REFERENCES subscribers(id);--> statement-breakpoint
ALTER TABLE `figma_questions` ADD `subscriber_id` text REFERENCES subscribers(id);