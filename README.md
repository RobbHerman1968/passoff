# Pass-Off Approval Rooms

Get client sign-off on the exact design revision—and deliver final files from the same link.

**Product hierarchy:** Workspace → Approval room → Revision → Review link → Handoff

This is the first production release focused on the approval-room workflow for freelancers, studios, and agencies. Process maps, AI gap analysis, screen specifications, developer contracts, team management, custom domains, and advanced white labeling remain **prototypes or deferred**—not advertised as shipping features.

## Architecture

- **Next.js 16** App Router on **Vercel**
- **Auth.js** (credentials + optional Google/GitHub OAuth)
- **Neon/Vercel Postgres** via Drizzle ORM
- **Private Vercel Blob** for review assets, handoff files, and Figma previews
- **Direct client uploads** (`@vercel/blob/client`) so files up to 25 MB never cross the 4.5 MB Function body limit
- **Resend** transactional email via a DB-backed outbox
- **Vercel Cron** (`GET /api/internal/outbox`) processes the outbox (UTC schedules)
- **Stripe Checkout** for Solo; Trial is persisted at workspace creation

## Tenant model

Every new account receives a **private organization and workspace**. Authentication alone never grants access to the seeded development workspace. All protected operations verify active workspace membership. Cross-tenant misses return **404**.

Seeded owner data (`npm run db:seed-owner`) continues to work for local Figma prototypes.

## Local development

```bash
cp .env.example .env
# Fill DATABASE_URL, AUTH_SECRET, AUTH_URL, NEXT_PUBLIC_SITE_URL
npm install
npm run db:migrate
npm run db:seed-owner   # optional — seeded owner workspace for prototypes
npm run dev
```

Without `BLOB_READ_WRITE_TOKEN`, local development uses the filesystem adapter under `.data/`. Production **never** falls back to local storage.

## Database migrations

```bash
npm run db:generate   # after schema changes
npm run db:migrate    # apply forward-only SQL in drizzle-postgres/
```

First-release migrations:

- `0006_approval_rooms_core.sql` — approval-room tables (idempotent)
- `0007_first_release_hardening.sql` — Blob metadata, outbox claims, Stripe event idempotency, password reset tokens, trial backfill

## Vercel Blob setup

1. Create a **private** Blob store in the Vercel project.
2. Set `BLOB_READ_WRITE_TOKEN` in the project environment.
3. Redeploy.

Uploads:

1. Browser requests a token from `POST /api/projects/:id/uploads`
2. Server verifies auth, membership, draft revision, MIME, size, storage entitlement
3. Browser uploads directly to Blob
4. Completion callback records the asset in Postgres (idempotent)

Private files are served only through `GET /api/assets/:id` (owner session or valid share token).

## Resend setup

1. Create a Resend API key and verified from-address.
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
3. Workspace notification email defaults to the owner’s account email (editable in Account settings).

If email is unconfigured, the UI/API reports skipped/error—never fake success.

## Vercel Cron setup

`vercel.json` schedules `GET /api/internal/outbox` every 5 minutes (**UTC**).

Set `CRON_SECRET`. Vercel sends:

```http
Authorization: Bearer ${CRON_SECRET}
```

The route atomically claims outbox rows (`FOR UPDATE SKIP LOCKED`), sends with Resend idempotency keys, and recovers abandoned claims.

## Stripe setup

1. Create Solo monthly/annual Prices.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_SOLO_MONTHLY`, `STRIPE_PRICE_SOLO_ANNUAL`.
3. Point the webhook to `{NEXT_PUBLIC_SITE_URL}/api/stripe/webhook`.
4. Events are verified with the Stripe SDK and deduplicated by Stripe event ID.

Paid plans are **never** activated manually in production. Studio/Agency are “Coming later.”

## OAuth setup

- **Auth Google/GitHub:** callback `{NEXT_PUBLIC_SITE_URL}/api/auth/callback/{provider}`
- **Figma REST:** `{NEXT_PUBLIC_SITE_URL}/api/integrations/figma/callback`
- Always use `NEXT_PUBLIC_SITE_URL` (canonical) for production callbacks—not ephemeral deployment URLs.

The local Figma plugin import path remains **development-only** (payloads exceed Function limits).

## Required environment variables

See `.env.example`. Production-critical:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `AUTH_SECRET` / `AUTH_URL` | Auth.js |
| `NEXT_PUBLIC_SITE_URL` | Canonical links |
| `BLOB_READ_WRITE_TOKEN` | Private Blob |
| `CRON_SECRET` | Outbox cron |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Email |
| `STRIPE_*` | Solo billing |
| `FIGMA_*` | Optional Figma REST |
| `OPENAI_*` | Optional Ask features |

## Tests

```bash
npm run lint
npm test                 # Vitest unit + contract + optional DB integration
npm run build
RUN_E2E=1 npm run test:e2e   # Playwright happy-path (app must be running)
```

## Deployment

1. Connect the repo to Vercel (region close to Neon).
2. Set environment variables.
3. Run migrations against production Postgres (`npm run db:migrate`).
4. Deploy.
5. Verify Cron, Blob, Stripe webhook, and a full owner/client walkthrough.

### Rollback considerations

- Migrations are forward-only; reverse with a new migration if needed.
- Keep prior deployment available in Vercel for instant rollback.
- Blob objects referenced by published revisions must not be deleted.

## Manual acceptance test

1. Sign up → confirm private workspace (not the seeded one).
2. Create an approval room (project + client name).
3. Upload image/PDF via direct Blob upload; confirm asset appears.
4. Publish revision; create review link; copy URL; optionally email client.
5. Open link in a private window; identify; comment; request changes.
6. Confirm owner notification queued/sent.
7. Owner creates/publishes a new revision; client approves with confirmation.
8. Owner releases handoff; client downloads via the same link.
9. Revoke link → client gets fail-closed error.
10. Second account cannot open the first account’s room (404).
11. Archive the room; assets remain.

## Known non-release-blocking limitations

- In-memory rate limits are per-instance (not distributed).
- Studio/Agency, team seats, custom domains, and white-label are deferred.
- Figma plugin import is development-only.
- Playwright E2E is opt-in (`RUN_E2E=1`).
- Legal pages are starter copy, not counsel-reviewed.

## Deferred features (intentionally out of first release)

- Team invitations / multi-seat management
- Custom domains and full white labeling
- Vendor-badge removal
- Process maps, AI gap analysis, screen specs, developer contracts (prototype lab only)
- Advanced branding controls beyond notification email
