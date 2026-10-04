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
                    issue_comments              issue_evidence ── video_assets
                           │                            │
                    issue_anchors              issue_verifications
                                                │
                                           approvals (review + deployment)

share_links ──< review_sessions >── guest_identities
workspaces ──< webhook_endpoints ──< webhook_deliveries
workspaces ──< subscriptions
workspaces ──< usage_records
legacy_review_rounds, legacy_video_reviews, legacy_video_anchors
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

## Issues

Issues replace persisted feedback items. Statuses are `open`, `in_progress`, `ready_for_verification`, `verified`, and `closed`. Closure reasons are stored separately: `fixed`, `not_planned`, `duplicate`, `cannot_reproduce`, `no_longer_relevant`.

Legacy mapping must not fabricate verification:

- `ready_for_review` and `resolved` map to `ready_for_verification`
- `not_planned` maps to `closed` with reason `not_planned`

Issue numbers are allocated from `review_issue_counters` in the same transaction as the insert.

Video assets belong to `issue_evidence`, not to a review type.

## Legacy preservation

`legacy_review_rounds` preserves historical round rows. Active product code must not read or write them.

Standalone video reviews that cannot map onto website environments are moved to `legacy_video_reviews`. If any such rows exist at migrate time, they must be copied rather than dropped.

## Concurrency model

Vercel can execute several requests in one Fluid Compute instance and can also scale to several instances. No correctness rule may depend on process memory.

`src/db/index.ts` creates one module-scoped `pg` pool, registers it with Vercel's `attachDatabasePool`, and gives Drizzle that pool. `DATABASE_POOL_MAX` is a per-instance ceiling, not an application-wide ceiling.

Use the provider's pooled connection URL. Size the pool using the database's connection limit after reserving capacity for migrations, administration, preview deployments, rolling deployments, and background workers.

## Billing configuration

Subscriptions and usage records remain workspace-scoped so future billing can attach later. Plan entitlements live in `src/lib/billing/plans.ts`. Payment collection and limit enforcement are not part of this product-model migration.

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
