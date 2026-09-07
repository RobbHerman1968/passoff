ALTER TABLE "figma_questions" DROP CONSTRAINT "figma_questions_figma_connection_id_figma_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "figma_questions" ALTER COLUMN "figma_connection_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "figma_questions" ADD CONSTRAINT "figma_questions_figma_connection_id_figma_connections_id_fk" FOREIGN KEY ("figma_connection_id") REFERENCES "public"."figma_connections"("id") ON DELETE set null ON UPDATE no action;