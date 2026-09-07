CREATE TABLE "figma_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid,
	"figma_file_key" text NOT NULL,
	"figma_file_name" text NOT NULL,
	"screen_id" text NOT NULL,
	"screen_name" text NOT NULL,
	"x_basis_points" integer NOT NULL,
	"y_basis_points" integer NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_comments" ADD CONSTRAINT "figma_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figma_comments_screen_created_idx" ON "figma_comments" USING btree ("organization_id","project_id","figma_file_key","screen_id","created_at");--> statement-breakpoint
CREATE INDEX "figma_comments_author_created_idx" ON "figma_comments" USING btree ("author_user_id","created_at");