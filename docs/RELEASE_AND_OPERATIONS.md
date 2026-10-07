# Release and operations

How to test, ship, run, and recover Passoff. Updated in MVP Cleanup Story 8. No real secrets belong
in this file or in `.env.example`.

## 1. Test database rules

Automated tests **never** use `DATABASE_URL`.

| Variable | Purpose |
| --- | --- |
| `TEST_DATABASE_URL` | The only database tests and the browser-test server open |
| `PASSOFF_TEST_DATABASE_CONFIRMED=true` | You confirm it is isolated and disposable |
| `PASSOFF_TEST_DATABASE_SHARED_WITH_APP=true` | Personal machines only: allows `TEST_DATABASE_URL` to equal `DATABASE_URL` |

How it is enforced (`src/db/test-database-guard.ts`, used by `src/db/index.ts` and `playwright.config.ts`):

- A test process without `TEST_DATABASE_URL` stops with an explanation. It does not fall back.
- Without the confirmation flag it stops.
- If `TEST_DATABASE_URL` and `DATABASE_URL` name the same host, port, and database it stops, unless the
  personal-machine override above is set. Different passwords or options do not make them different.
- Playwright starts the app with `DATABASE_URL` set to the confirmed test database, so browser tests
  cannot reach the app's real database either.
- Test-only HTTP routes under `/api/test/*` exist only with `EMAIL_TRANSPORT=test` **and** a
  non-production build.

**Known local-setup finding.** The current `.env.test.local` points at the same Neon database as
`DATABASE_URL` and only works because of the override. Replace it with a separate Neon branch, then
delete the override line:

```bash
# Create a branch in the Neon console or CLI, then:
#   .env.test.local
#   TEST_DATABASE_URL=postgresql://...branch-host.../neondb?sslmode=require
#   PASSOFF_TEST_DATABASE_CONFIRMED=true
npm run db:migrate:test      # applies drizzle/*.sql to the test database only
```

Anything created by tests (users like `*@example.com`, workspaces) is left in the test database. Reset a
Neon branch whenever you want a clean slate.

## 2. Release suite

One command runs every gate in order and prints a PASS/FAIL line for each:

```bash
npm run test:release            # lint, typecheck, unit + database tests, build, SDK budget, browser tests
npm run test:release -- --skip-e2e
npm run test:release -- --only=lint,typecheck
```

The same gates, individually:

| Gate | Command | Needs |
| --- | --- | --- |
| Lint | `npm run lint` | nothing |
| Types | `npm run typecheck` | nothing |
| Unit and database tests | `npm test` | `TEST_DATABASE_URL` + confirmation |
| Production build | `npm run build` (builds the SDK, then Next.js) | `DATABASE_URL` shape only; no connection at build |
| SDK budgets | `npm run sdk:measure` (fails when any script is over budget) | nothing |
| Browser tests | `npm run test:e2e` | `TEST_DATABASE_URL` + confirmation, Chromium |

CI (`.github/workflows/ci.yml`) runs all of them on every pull request against a throwaway Postgres
service container. CI has no production secrets and the test guard refuses a shared database.

Single browser spec: `npx playwright test e2e/launch-hardening.spec.ts`. Reuse a running dev server with
`PLAYWRIGHT_PORT=3000`; Playwright starts one on its own when none is running.

## 3. Deployment checklist

1. **Database.** Create the production database. Run `npm run db:migrate` with the production
   `DATABASE_URL` from a trusted machine. Never run it automatically on a preview that shares data.
2. **Environment** (`.env.example` lists every variable; set them in Vercel, never in git):
   `DATABASE_URL`, `AUTH_SECRET` (32+ random characters), `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (public
   https address, no localhost), `PASSOFF_EMBED_BASE_URL`, `PASSOFF_SECRET_ENCRYPTION_KEY`,
   `EMAIL_TRANSPORT=resend` with `RESEND_API_KEY` and `EMAIL_FROM`; OAuth ids if used; Stripe and Mux
   variables per `docs/BILLING.md` and `docs/VIDEO_EVIDENCE.md`.
   **Do not set** `TEST_DATABASE_URL`, `PASSOFF_TEST_DATABASE_CONFIRMED`, `PASSOFF_BILLING_GATEWAY`, or
   `EMAIL_TRANSPORT=test` in production. The startup check reports them.
3. **Stripe.** Webhook endpoint `https://HOST/api/webhooks/stripe` with the seven events in
   `docs/BILLING.md`; copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
4. **Mux.** Webhook endpoint `https://HOST/api/webhooks/mux`; signing key pair for playback;
   `MUX_WEBHOOK_SECRET` is the endpoint secret, not the API token secret.
5. **Cron.** `vercel.json` registers seven schedules. Vercel sends `Authorization: Bearer $CRON_SECRET`
   when `CRON_SECRET` is set as a project environment variable.
6. **Proxy.** Run on Vercel, or behind a proxy that **overwrites** `X-Forwarded-For`. Rate limits trust
   its first value.
7. **Verify.** After deploying:
   ```bash
   curl -s https://HOST/api/health                                   # {"ok":true,"version":"..."}
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://HOST/api/health   # adds configuration checks
   curl -s -o /dev/null -w "%{http_code}\n" https://HOST/api/test/billing-state?ownerEmail=x@y.z   # 404
   curl -s -o /dev/null -w "%{http_code}\n" https://HOST/api/cron/video                              # 401
   curl -sI https://HOST/sign-in | grep -i -E "x-frame-options|content-security-policy"
   ```
8. **Money path in test mode.** Buy a plan with a Stripe test card, watch the webhook arrive, open the
   Billing Portal, cancel.

## 4. Scheduled jobs and recovery

| Job | Schedule | What it does | If a run fails | Safe to repeat |
| --- | --- | --- | --- | --- |
| `/api/cron/webhooks` | every minute | Sends queued outbound webhooks; retries with backoff up to the attempt limit; reclaims claims abandoned by a crashed run | Delivery stays pending and is claimed again once the claim goes stale | Yes (claim-based) |
| `/api/cron/telemetry` | every 5 minutes | Rolls up usability events, deletes expired raw events, aggregates, and dedupe rows, finishes before/after comparisons | Next run continues from the checkpoint | Yes (row locks with skip-locked) |
| `/api/cron/reminders` | every 15 minutes and hourly | Review deadline reminders | Next run retries; nothing is written to reviews | Yes (unique dedupe key) |
| `/api/cron/video` | every 10 minutes | Retires stale uploads, removes expired clips (with 7-day warning), retries provider deletions | Provider deletion is retried with backoff until confirmed | Yes |
| `/api/cron/workspaces` | daily 03:30 UTC | Permanently removes workspaces 30 days after deletion, only after every stored video copy is confirmed deleted; purges expired reset tokens, launch codes, sessions, and rate-limit counters | The workspace waits for the next run | Yes |
| `/api/cron/billing` | daily 04:15 UTC | Sends the one-time "payment overdue" notice | Next run sends it; notices are de-duplicated | Yes |

Every job logs `cron.completed` (with `job` and `durationMs`) or `cron.failed` (with `job`,
`errorName`, `errorCode`). Run one by hand:

```bash
curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://HOST/api/cron/video
```

Webhooks from providers retry on their own: Stripe and Mux get a 500 when handling fails, and the
receipt rolls back with the work, so the retry does the whole job. Duplicates do nothing.

## 5. Monitoring without sensitive data

All operational logging goes through `src/lib/ops/diagnostics.ts`. A log line is one JSON object:
`ts`, `level`, `event`, and short scalar fields. It never contains comments, issue text, emails, links,
tokens, or error messages.

Events to alert on (Vercel log drain or log search on the `event` field):

| Event | Meaning | First step |
| --- | --- | --- |
| `cron.failed` | A scheduled job threw | Check `job`, then the database and provider status; run it by hand |
| `billing.webhook_failed` | A Stripe event could not be applied; Stripe will retry | Check `eventType`; confirm migrations are applied |
| `billing.unknown_price` | A subscription uses a price Passoff does not know; no plan was granted | Fix the `STRIPE_PRICE_*` mapping |
| `billing.follow_up_failed` | A notice after a plan change failed; state is correct | None unless repeated |
| `video.webhook_failed` | A Mux event could not be applied; Mux will retry | Check `eventType` |
| `request.failed` | An unexpected server error; `route` is the route template (never the real address) and `digest` matches the reference shown to the person | Search the digest |
| `config.check` | The deployment is missing or has an unsafe setting; `check` names it and `severity` is `problem` or `warning` | `/api/health` with the cron bearer secret lists plain explanations |

Support can diagnose without asking for customer content:

- **Failed website install:** Settings shows the verification state (waiting, allowed origin mismatch,
  disabled). The install page explains each in plain language.
- **Failed video upload:** the issue shows a failure reason code and a retry button
  (`video/failure-reasons.ts`); the `video_assets` row carries the same code.
- **A person sees "We couldn't load this page":** ask for the reference on the page and search it.
- **Outbound webhook failing:** Settings → Webhooks lists the last status and friendly reason per delivery.

## 6. Retention and deletion

| Data | Kept | Removed by |
| --- | --- | --- |
| Raw usability events | 72 hours (max 7 days) | `/api/cron/telemetry` |
| Usability aggregates | 90 days | `/api/cron/telemetry` |
| Video clips | While the issue is open, then 30 days after it closes; 7-day warning | `/api/cron/video` (and the provider copy is confirmed deleted) |
| Outbound webhook deliveries | `WEBHOOK_RETENTION_DAYS` | `/api/cron/webhooks` |
| Password reset tokens, launch codes, review/usability/verification sessions | 7 days after expiry | `/api/cron/workspaces` |
| Rate-limit counters | 2 days after last use | `/api/cron/workspaces` |
| Deleted workspace | 30 days, unreachable meanwhile | `/api/cron/workspaces`, after provider video deletion is confirmed |
| Deleted account | Immediately anonymized to "Former member"; sessions ended; comments and history remain | `lib/account/service.ts` |
| Member removed | Membership removed, issues unassigned, their notifications for that workspace cleared | `lib/workspaces/members.ts` |
| Billing failure or downgrade | Nothing is deleted; only new additions pause | By design (`docs/BILLING.md`) |

Verified by: `workspaces/deletion.test.ts`, `account/service.test.ts`, `video/retention.test.ts`,
`telemetry/*` tests, and `ops/expired-records.test.ts`.

Not yet automated: exporting all of one workspace's data on request, and retention for
`activity_events` and `notifications` (kept indefinitely; they contain no secrets). Both are listed in
the launch checklist as known limits.
