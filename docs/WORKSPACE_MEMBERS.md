# Workspace members, invitations, and account management

Reuses `workspace_memberships` and `workspace_invitations`. There are two roles: **Owner** and **Member**. There are no custom roles.

## Permissions

All checks live in `src/lib/workspaces/permissions.ts` (`can(subject, action)`). Owner-only actions: invite, resend or cancel invitations, remove people, transfer ownership, rename or delete the workspace, delete projects, manage webhooks. Services never trust the role carried by the caller: they re-read it from the database inside the transaction, so a stale owner session cannot act after being demoted.

## Active workspace

Preference only. Cookie `passoff_active_workspace` = `workspaceId.HMAC(userId, workspaceId)` (httpOnly, sameSite lax, secure in production). Membership is re-checked on every request; an invalid, forged, or stale cookie falls back to the oldest membership. Secret: `WORKSPACE_COOKIE_SECRET`, falling back to `AUTH_SECRET`.

## Invitations

- Email is lowercased; one open invitation per workspace and email (partial unique index).
- Token: 32 random bytes, only its SHA-256 hash is stored. The raw link exists only in the email.
- Expires after 7 days. Resend rotates the token (old link dies), waits 60 seconds between sends, and stops after 8 sends.
- Rate limit: 20 sends per workspace per hour (`workspace_invite`); link views and accepts are limited per browser (`invitation_lookup`).
- Seats = active members + open, unexpired invitations. Guests are free.
- Accept: needs a signed-in account whose email matches. Mismatch, expired, cancelled, used, and invalid links each have their own page state. Accepting twice as the same person succeeds.

## Capacity

`getMemberCapacity(workspaceId)` reads `PLAN_ENTITLEMENTS[plan].workspaceMembers` for the plan that applies right now (`resolveWorkspacePlanId`, which accounts for trials, payment trouble, and cancellation). Plans are changed on Settings → Billing; see [`docs/BILLING.md`](./BILLING.md). A workspace that moves to a smaller plan keeps everyone: `overCapacity` is reported and new invitations pause until seats are free.

## Removal, leaving, ownership

Removing or leaving deletes the membership, unassigns issues, and clears that person's notifications for the workspace. Comments, issues, and history stay. Ownership transfer demotes then promotes in one transaction under a workspace row lock; a partial unique index guarantees one active owner.

## Deleting a workspace

Owner types the workspace name. The workspace is marked deleted (nobody can open it), invitations, guest links and sessions are revoked, website installs and webhooks are disabled, and stored video is queued for deletion. Data is kept for 30 days. `/api/cron/workspaces` then removes it, but only after every stored video copy is confirmed deleted. Repeating the request is safe.

## Deleting an account

Requires the password (or the account email for accounts without one). Blocked while the person owns a workspace with other people. Workspaces where they are the only person are closed as above. Other memberships are removed. The user row is anonymized ("Former member") and every session is invalidated; comments and history remain.

## Audit

`activity_events` records `workspace.*` events (no project, review, or issue). Data is sanitized so tokens, links, secrets, and hashes are never stored.
