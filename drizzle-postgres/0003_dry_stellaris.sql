CREATE TABLE "figma_import_interactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"figma_import_id" uuid NOT NULL,
	"source_node_id" text NOT NULL,
	"source_node_name" text NOT NULL,
	"source_screen_id" text NOT NULL,
	"destination_node_id" text,
	"destination_screen_id" text,
	"trigger" text NOT NULL,
	"actions_json" text NOT NULL,
	"source_x" integer,
	"source_y" integer,
	"source_width" integer,
	"source_height" integer,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_import_screens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"figma_import_id" uuid NOT NULL,
	"figma_node_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"image_url" text,
	"width" integer,
	"height" integer,
	"x" integer,
	"y" integer,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"figma_connection_id" uuid,
	"imported_by_user_id" uuid,
	"figma_file_key" text NOT NULL,
	"figma_file_name" text NOT NULL,
	"figma_version" text NOT NULL,
	"figma_last_modified" timestamp with time zone NOT NULL,
	"thumbnail_url" text,
	"warnings_json" text DEFAULT '[]' NOT NULL,
	"screen_count" integer DEFAULT 0 NOT NULL,
	"preview_count" integer DEFAULT 0 NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "figma_import_interactions" ADD CONSTRAINT "figma_import_interactions_figma_import_id_figma_imports_id_fk" FOREIGN KEY ("figma_import_id") REFERENCES "public"."figma_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_import_screens" ADD CONSTRAINT "figma_import_screens_figma_import_id_figma_imports_id_fk" FOREIGN KEY ("figma_import_id") REFERENCES "public"."figma_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_figma_connection_id_figma_connections_id_fk" FOREIGN KEY ("figma_connection_id") REFERENCES "public"."figma_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_imports" ADD CONSTRAINT "figma_imports_imported_by_user_id_users_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "figma_import_interactions_import_sort_idx" ON "figma_import_interactions" USING btree ("figma_import_id","sort_order");--> statement-breakpoint
CREATE INDEX "figma_import_interactions_source_idx" ON "figma_import_interactions" USING btree ("figma_import_id","source_screen_id");--> statement-breakpoint
CREATE UNIQUE INDEX "figma_import_screens_import_node_unique" ON "figma_import_screens" USING btree ("figma_import_id","figma_node_id");--> statement-breakpoint
CREATE INDEX "figma_import_screens_import_sort_idx" ON "figma_import_screens" USING btree ("figma_import_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "figma_imports_project_file_unique" ON "figma_imports" USING btree ("project_id","figma_file_key");--> statement-breakpoint
CREATE INDEX "figma_imports_workspace_updated_idx" ON "figma_imports" USING btree ("workspace_id","updated_at");