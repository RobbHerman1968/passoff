ALTER TABLE "review_sessions" ADD COLUMN IF NOT EXISTS "allowed_origin" text;

CREATE TABLE IF NOT EXISTS "sdk_exchange_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE cascade,
	"share_link_id" uuid NOT NULL REFERENCES "share_links"("id") ON DELETE cascade,
	"guest_identity_id" uuid NOT NULL REFERENCES "guest_identities"("id") ON DELETE cascade,
	"environment_id" uuid NOT NULL REFERENCES "project_environments"("id") ON DELETE cascade,
	"code_hash" text NOT NULL,
	"allowed_origin" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "sdk_exchange_codes_code_hash_unique" ON "sdk_exchange_codes" ("code_hash");
CREATE INDEX IF NOT EXISTS "sdk_exchange_codes_expiry_idx" ON "sdk_exchange_codes" ("expires_at");
CREATE INDEX IF NOT EXISTS "sdk_exchange_codes_share_link_idx" ON "sdk_exchange_codes" ("share_link_id");

CREATE TABLE IF NOT EXISTS "issue_idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
	"review_id" uuid NOT NULL REFERENCES "reviews"("id") ON DELETE cascade,
	"review_session_id" uuid REFERENCES "review_sessions"("id") ON DELETE set null,
	"idempotency_key" text NOT NULL,
	"issue_id" uuid NOT NULL REFERENCES "issues"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "issue_idempotency_keys_review_key_unique" ON "issue_idempotency_keys" ("review_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "issue_idempotency_keys_issue_idx" ON "issue_idempotency_keys" ("issue_id");
