ALTER TABLE "figma_explanations" DROP CONSTRAINT "figma_explanations_author_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "figma_explanations" ALTER COLUMN "author_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
