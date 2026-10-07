ALTER TABLE "issue_comments"
  ADD COLUMN IF NOT EXISTS "author_display_name" text;
--> statement-breakpoint
UPDATE "issue_comments" AS comments
SET "author_display_name" = COALESCE(
  (
    SELECT NULLIF(BTRIM(users.name), '')
    FROM "users" AS users
    WHERE users.id = comments.author_user_id
  ),
  (
    SELECT NULLIF(BTRIM(guests.name), '')
    FROM "guest_identities" AS guests
    WHERE guests.id = comments.author_guest_id
  ),
  (
    SELECT NULLIF(BTRIM(users.email), '')
    FROM "users" AS users
    WHERE users.id = comments.author_user_id
  ),
  (
    SELECT NULLIF(BTRIM(guests.email), '')
    FROM "guest_identities" AS guests
    WHERE guests.id = comments.author_guest_id
  ),
  'Someone'
)
WHERE comments.author_display_name IS NULL;
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ALTER COLUMN "author_display_name" SET DEFAULT 'Someone';
--> statement-breakpoint
ALTER TABLE "issue_comments"
  ALTER COLUMN "author_display_name" SET NOT NULL;
