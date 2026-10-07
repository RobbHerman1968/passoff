# Passoff first-pass database model

Status: implementation baseline after the workspace and issue-model realignment  
Database: PostgreSQL  
Data access: Drizzle ORM  
Authentication: Auth.js with the Drizzle adapter  
Hosting: Vercel Functions with Fluid Compute

## Design goals

The model follows the current product direction and optimizes for four things:

1. Website review is the review type. Video is short evidence on an issue, not a review type.
2. Account users and account-free guest reviewers remain distinct identities.
3. Tenant ownership is visible on high-traffic and security-sensitive records as `workspace_id`.
4. Correctness is enforced by PostgreSQL when multiple requests run at the same time.

The source of truth is [`src/db/schema.ts`](../src/db/schema.ts). Generated migrations live in `drizzle/`. Migration `0004` must rename existing workspace tables in place. Do not drop and recreate populated `teams` / `workspaces` data.

## Main relationships

```text
Auth.js
users ──< accounts
  │   └──< sessions
  │   └──< authenticators
  │
  └──< workspace_memberships >── workspaces ──< projects
                                                │
                           project_environments (from website_installations)
                                                │
                                           deployments
                                                │
                                             reviews
                                                │
                           ┌────────── issues ──────────┐
                           │                            │
                    issue_comments              issue_evidence ── video_assets ── video_annotations
                           │                            │
                    issue_anchors              issue_verifications
                                                verification_runs ── verification_check_results
                                                │
                                           approvals (review + deployment)

share_links ──< review_sessions >── guest_identities
workspaces ──< webhook_endpoints ──< webhook_deliveries
workspaces ──< subscriptions
workspaces ──< usage_records
environment_telemetry_settings ── telemetry_raw_events ── telemetry_aggregates
                                                    └── telemetry_aggregate_sessions
behavioral_findings ── behavioral_evidence_snapshots
legacy_review_rounds, legacy_video_reviews
```

## Identity and authorization

Auth.js owns `users`, `accounts`, `sessions`, `verification_tokens`, and `authenticators`. The adapter is passed these tables explicitly, so their snake-case database names are safe and intentional.

Credentials authentication stores an optional `users.password_hash` (Argon2id) and bumps `users.session_version` on password reset so JWT sessions are rejected afterward. Password-reset tokens live in `password_reset_tokens` as hashes only. Durable auth abuse protection uses `auth_rate_limits`.

Passoff authorization is not inferred from an Auth.js session. A signed-in user must also have an active `workspace_memberships` row. Product queries must establish a workspace scope (`workspace_id`) before reading or changing workspace data. Never load a record by id alone and authorize afterward.

Guests do not receive Auth.js accounts. A revocable `share_link` is exchanged for a short-lived, hashed `review_session`, which may be associated with a `guest_identity`. A guest can later be linked to a user without changing authorship history.

Only token hashes are stored for invitations, share links, and review sessions. Raw bearer tokens belong in the one-time URL or secure cookie, never in the database.

## Environments, deployments, and reviews

`project_environments` replaces `website_installations`. Each environment belongs to a project, has a kind (`preview`, `staging`, `production`, `custom`), a base URL, exact `http`/`https` allowed origins with no credentials, and a unique SDK public key. Environment names are unique within a project. Optimistic `version` concurrency remains.

`deployments` are immutable recorded versions unique per environment. A review targets one environment and one deployment. Review status is `draft`, `open`, or `closed`. There is no standalone video review type.

Approvals are tied to a review and a recorded deployment or version. They are not tied to a review round.

Automated browser checks are stored on `verification_runs` and `verification_check_results`. They are bound to the deployment actually checked and never verify, close, or approve an issue. Human verification remains on `issue_verifications` with method `human`.

## Issues

Issues replace persisted feedback items. Statuses are `open`, `in_progress`, `ready_for_verification`, `verified`, and `closed`. Closure reasons are stored separately: `fixed`, `not_planned`, `duplicate`, `cannot_reproduce`, `no_longer_relevant`.

Legacy mapping must not fabricate verification:

- `ready_for_review` and `resolved` map to `ready_for_verification`
- `not_planned` maps to `closed` with reason `not_planned`

Issue numbers are allocated from `review_issue_counters` in the same transaction as the insert.

Video assets belong to `issue_evidence`, not to a review type. `video_assets.lifecycle` (`current`, `replacement`, `retired`, `removed`) decides which clip an issue shows; partial unique indexes allow one `current` and one `replacement` per issue, and provider-deletion columns track retries. `video_annotations` is the one table for time-based notes: each row ties one `issue_comments` row (unique) to a `video_assets` row, with `timestamp_ms` and an optional normalized pin (`normalized_x`/`normalized_y`, both or neither, 0..1). Notes stay on the clip they were written for. `video_assets.retention_ends_at` is set when an issue closes (30 days) and cleared on reopen; `retention_warned_for` records the date a warning went out for. Migration 0025 carries any `legacy_video_anchors` rows over as notes when that table exists, and the table is no longer part of the model. See [`VIDEO_EVIDENCE.md`](./VIDEO_EVIDENCE.md).

## Legacy preservation

`legacy_review_rounds` preserves historical round rows. Active product code must not read or write them.

Standalone video reviews that cannot map onto website environments are moved to `legacy_video_reviews`. If any such rows exist at migrate time, they must be copied rather than dropped.

## Concurrency model

Vercel can execute several requests in one Fluid Compute instance and can also scale to several instances. No correctness rule may depend on process memory.

`src/db/index.ts` creates one module-scoped `pg` pool, registers it with Vercel's `attachDatabasePool`, and gives Drizzle that pool. `DATABASE_POOL_MAX` is a per-instance ceiling, not an application-wide ceiling.

Use the provider's pooled connection URL. Size the pool using the database's connection limit after reserving capacity for migrations, administration, preview deployments, rolling deployments, and background workers.

Telemetry workers claim raw rows with row locks and `SKIP LOCKED`, so overlapping cron invocations cannot aggregate the same event twice. `telemetry_aggregate_sessions` keeps one keyed, environment-scoped tab-session hash per hour and aggregate dimension. Reports use `COUNT(DISTINCT ...)` across those rows instead of adding partial distinct counts.

Automated tests never fall back to `DATABASE_URL`. Database-backed tests require an isolated `TEST_DATABASE_URL` plus `PASSOFF_TEST_DATABASE_CONFIRMED=true`, and the test database must not be the same host, port, and database as `DATABASE_URL` (`src/db/test-database-guard.ts`). Migrate it with `npm run db:migrate:test`. Setup, CI, and the release suite are in [`docs/RELEASE_AND_OPERATIONS.md`](./RELEASE_AND_OPERATIONS.md). Migration `0028_issue_assignments_and_verifications` creates `issue_assignments`, `issue_verifications`, and the `issues_id_scope_unique` index that earlier migrations never created; `src/db/schema-drift.test.ts` fails when any table or column in `schema.ts` is missing from the migrated database. Expired short-lived rows (reset tokens, launch codes, sessions, rate-limit counters) are purged daily by `/api/cron/workspaces`.

## Billing configuration

Subscriptions and usage records are workspace-scoped. Plan entitlements live in `src/lib/billing/plans.ts`. Stripe is the payment provider; `subscriptions` (one row per workspace) stores the plan, status, billing interval, Stripe customer/subscription/price IDs, period dates, `cancel_at_period_end`, `trial_started_at`, `trial_ends_at`, `past_due_since`, `cancelled_at`, and `provider_event_at` (migration `0027_stripe_billing`). Stripe webhook receipts reuse `provider_events` with provider `stripe`. See [`docs/BILLING.md`](./BILLING.md).

Published prices:

- Free
- Studio $29 / month billed annually ($348 yearly) or $35 billed monthly
- Agency $89 / month billed annually ($1,068 yearly) or $109 billed monthly

Published limits:

- Studio: 3 workspace members, 5 active review websites
- Agency: 6 workspace members, unlimited active review websites
- Unlimited guest reviewers and unlimited issues and comments
- Agency video-evidence pilot only; Free and Studio video evidence remain undecided

Unlimited active review websites does not grant unlimited infrastructure usage. Pooled allowances stay unpublished until each has an approved value and enforcement behavior.

## Workspace members and invitations (migration 0026)

- `workspaces`: `deleted_by_user_id`, `purge_after`; index on `purge_after` for deleted workspaces.
- `workspace_memberships`: unique partial index guaranteeing one active owner per workspace.
- `workspace_invitations`: `accepted_by_user_id`, `last_sent_at`, `send_count`; unique partial index for one open invitation per workspace and email; check that emails are lowercase.

See `docs/WORKSPACE_MEMBERS.md`.
