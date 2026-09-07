CREATE TABLE `figma_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`figma_connection_id` text NOT NULL,
	`figma_file_key` text NOT NULL,
	`figma_file_name` text NOT NULL,
	`screen_id` text NOT NULL,
	`screen_name` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`analysis_source` text NOT NULL,
	`evidence_json` text NOT NULL,
	`gaps_json` text NOT NULL,
	`created_at` integer NOT NULL
);
