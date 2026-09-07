CREATE TABLE "figma_explanations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"figma_file_key" text NOT NULL,
	"figma_file_name" text NOT NULL,
	"screen_id" text NOT NULL,
	"screen_name" text NOT NULL,
	"figma_node_id" text,
	"figma_node_name" text,
	"x_basis_points" integer NOT NULL,
	"y_basis_points" integer NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figma_explanations_x_range" CHECK ("x_basis_points" >= 0 AND "x_basis_points" <= 10000),
	CONSTRAINT "figma_explanations_y_range" CHECK ("y_basis_points" >= 0 AND "y_basis_points" <= 10000),
	CONSTRAINT "figma_explanations_category_allowed" CHECK ("category" IN ('intent','behavior','content','data','animation','responsive','accessibility','edge_case','developer_note')),
	CONSTRAINT "figma_explanations_status_allowed" CHECK ("status" IN ('draft','published')),
	CONSTRAINT "figma_explanations_title_length" CHECK (char_length("title") BETWEEN 1 AND 120),
	CONSTRAINT "figma_explanations_body_length" CHECK (char_length("body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_explanations" ADD CONSTRAINT "figma_explanations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figma_explanations_tenant_screen_created_idx" ON "figma_explanations" USING btree ("organization_id","workspace_id","project_id","figma_file_key","screen_id","created_at");--> statement-breakpoint
CREATE INDEX "figma_explanations_author_updated_idx" ON "figma_explanations" USING btree ("organization_id","workspace_id","project_id","author_user_id","updated_at");
