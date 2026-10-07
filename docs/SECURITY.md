# Security and privacy

Last reviewed: October 7, 2026 (MVP Cleanup Story 8). This is an engineering threat model, not a
certification and not legal advice. It lists what could go wrong, what stops it, where the control
lives, and which test proves it.

## What Passoff protects

| Asset | Why it matters |
| --- | --- |
| Customer feedback, issues, comments, approvals, screenshots, video evidence | Unreleased client work |
| Guest links and review sessions | Anyone holding one can read and comment on a review |
| Workspace membership and ownership | Controls billing, deletion, and who sees everything |
| Billing state | Decides what a workspace may use |
| Visitors of customer websites (behavioral insights) | Must not become tracked individuals |
| Webhook endpoints and their signing secrets | Passoff makes outbound requests on a customer's behalf |

## Trust boundaries

1. **Browser of a signed-in member** → Next.js server actions and route handlers. Identity from Auth.js;
   workspace membership is re-read from the database on every action (`requireWorkspaceContext`).
2. **Guest reviewer on a customer's website** → `/api/sdk/v1/*`. Identity is a short-lived review
   session; the installation key alone grants nothing.
3. **Visitor of a customer's website** → `/api/sdk/v1/events` only, and only if the owner turned
   behavioral insights on.
4. **Stripe, Mux** → `/api/webhooks/*`. Authenticated only by signature.
5. **Vercel Cron** → `/api/cron/*`. Authenticated only by `Authorization: Bearer $CRON_SECRET`.
6. **Passoff → customer webhook endpoints.** Outbound; a server-side request forgery (SSRF) risk.

## Threats, controls, and proof

Severity is the pre-fix rating. Items marked **fixed in Story 8** were real findings.

| # | Threat | Sev. | Control | Proof |
| --- | --- | --- | --- | --- |
| 1 | Test-only routes (seed data, read the mailbox, grant a paid plan) reachable in production if `EMAIL_TRANSPORT=test` is set by mistake | **High, fixed in Story 8** | Every `/api/test/*` route calls `testRoutesEnabled()`: needs test email mode **and** a non-production build (`src/lib/security/production-guards.ts`). `EMAIL_TRANSPORT=test` is also refused by the email layer in production and reported by the startup check. | `production-guards.test.ts`, `production-routes.test.ts` (all seven routes answer 404 with production settings) |
| 2 | Cron endpoints open or guessable | Medium, hardened | One shared check: exact bearer secret, constant-time compare, refuses everything in production when `CRON_SECRET` is blank, ignores query-string secrets and `x-vercel-cron` headers. Duplicated per-route copies removed. | `production-routes.test.ts` (6 routes × GET/POST × 5 bad credentials) |
| 3 | Forged Stripe or Mux webhook grants a plan or changes video state | High, already controlled | Raw body verified with the provider SDK before parsing; missing secret = 503, bad signature = 400; Stripe handling is idempotent, ordered, and refuses unknown prices. | `webhooks/stripe/route.test.ts`, `mux-webhook.test.ts`, `production-routes.test.ts` |
| 4 | SSRF through customer webhook URLs (internal addresses, cloud metadata) | **High, fixed in Story 8** | URL rules block loopback, private, link-local, carrier-grade NAT, benchmarking, documentation, multicast, reserved, IPv4-in-IPv6 (mapped, NAT64, 6to4), `.local`, `.internal`, and bracketed IPv6 literals. Resolution is **pinned**: delivery connects to the exact address that was checked, so DNS rebinding cannot redirect it. Redirects are never followed; response bodies are discarded; production allows only https on 443. | `webhooks/url.test.ts`, `webhooks/post.test.ts` |
| 5 | Guest link leaks or lives on after being turned off | High, already controlled | Link tokens are random and stored only as hashes. Every SDK request re-reads link revocation, expiry, review status, and installation status, so turning a link off stops guests immediately. Launch codes are one-time and fragment-delivered. | `e2e/launch-hardening.spec.ts` (guest sees "Review link turned off" right after "Turn off"), `sdk/session.test.ts` |
| 6 | Guest link or reset or invitation token leaks through `Referer`, caches, or search | Medium, **fixed in Story 8** | `/r/*`, `/invite/*`, `/reset-password/*` send `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`; robots.txt disallows them. | `security/headers.test.ts`, `e2e/launch-hardening.spec.ts` |
| 7 | Clickjacking and MIME sniffing | Medium, **fixed in Story 8** | `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, HSTS, restrictive `Permissions-Policy`, `X-Powered-By` removed. The SDK script stays embeddable on customer sites. | `security/headers.test.ts`, `e2e/launch-hardening.spec.ts` |
| 8 | Cross-workspace access (read or change another workspace's project, review, issue, video, export, screenshot) | High, already controlled | All service functions take a `WorkspaceContext` and filter by `workspaceId`; roles are re-read inside the transaction. | Service tests per area, `e2e/launch-hardening.spec.ts` (a second workspace gets 404 for pages, export, and screenshot) |
| 9 | Stored XSS through comments, issue text, file names, page titles | High, already controlled | React escapes all text; the only `dangerouslySetInnerHTML` uses are JSON-LD built from static catalog data; the SDK builds its interface with `textContent` and static markup only; file names are sanitized. | Code audit (grep for `innerHTML`, `dangerouslySetInnerHTML`, `eval`), `sdk/sanitize.test.ts`, `attachments/types.test.ts` |
| 10 | CSV/spreadsheet formula injection in exports | Medium, already controlled | Cells starting with `=`, `+`, `-`, `@`, tab, or CR are neutralized. | `issues/export-format.test.ts` |
| 11 | Hostile uploads | Medium, already controlled | Passoff stores no uploaded files itself. Video goes straight to Mux with a one-time address; clip length and size are limited before the address is issued. Screenshots must be PNG data (magic number checked) and are served only as `image/png`. Attachments only link existing assets. | `video/validation.test.ts`, `sdk/sanitize.test.ts`, `issues/list` screenshot tests |
| 12 | Video link sharing / token theft | Medium, already controlled | Signed playback only (no public playback ids); tokens expire in 15 minutes and are issued only after Passoff authorizes the person and the clip's state; removed links cannot mint new tokens. | `video/playback-service.test.ts` |
| 13 | Invitation abuse (enumeration, replay, wrong account) | Medium, already controlled | Tokens hashed, 7-day expiry, per-workspace send limit and per-browser lookup limit; accepting needs the invited email; every failure state is distinct but never reveals the invited address. | `workspaces/invitations.test.ts`, `e2e/workspace-members.spec.ts` |
| 14 | Credential stuffing, signup and reset abuse | Medium, already controlled | Durable, hashed rate limits for sign-in, sign-up, reset, invitation, re-authentication, and billing sessions. Passwords hashed with Argon2. | `auth/auth-flow.test.ts` |
| 15 | Open redirects after sign-in | Medium, already controlled | Callback URLs are validated to same-site paths. | `auth/callback-url.test.ts` |
| 16 | Webhook signing secrets exposed from the database | Medium, already controlled | Encrypted at rest with `PASSOFF_SECRET_ENCRYPTION_KEY`; shown once when created. | `webhooks` tests |
| 17 | Visitor tracking by behavioral insights | High if wrong, already controlled | See "Privacy verification" below. | `telemetry/*.test.ts`, `website-sdk/src/analytics/analytics.test.ts` |
| 18 | Sensitive data in logs | Medium, **fixed in Story 8** | One logging path (`src/lib/ops/diagnostics.ts`) records event names, counts, durations, ids, and an error's class and code, never its message. Emails, bearer tokens, provider ids, long tokens, and `?token=` values are scrubbed. | `ops/diagnostics.test.ts` |
| 19 | Raw errors shown to people | Medium, **fixed in Story 8** | Added `error.tsx`, `global-error.tsx`, and `not-found.tsx`. They show a plain explanation, retry, and a way back; only a hash reference is shown. | `components/route-error.test.tsx`, `e2e/launch-hardening.spec.ts` |
| 20 | Production misconfiguration (missing cron secret, test mode, fake billing gateway, localhost site address) | Medium, **fixed in Story 8** | `evaluateReadiness` runs at startup in production and on `/api/health` (details only for the cron secret). The fake billing gateway is also impossible in production inside the billing code. | `ops/readiness.test.ts` |
| 21 | Tests touching real data | High, **fixed in Story 8** | Tests use only `TEST_DATABASE_URL`, require explicit confirmation, and now refuse to start when it points at the same database as `DATABASE_URL` unless a personal-machine override is set. | `db/test-database-guard.test.ts` |

## Findings that remain open (none critical or high)

| Finding | Severity | Why it is acceptable for launch | Planned fix |
| --- | --- | --- | --- |
| No script-restricting Content Security Policy | Medium | All user text is escaped; only static JSON-LD uses raw HTML. Framing, plugins, and `<base>` are already blocked. A nonce-based script policy needs per-request nonces and a full regression pass. | Post-launch: nonce-based CSP in report-only mode first |
| Request fingerprint trusts the first `X-Forwarded-For` value | Low | Correct on Vercel, which sets it. Deploying behind a proxy that does not overwrite it would let an attacker rotate rate-limit buckets. | Documented in `docs/RELEASE_AND_OPERATIONS.md` deployment checklist |
| Rate limits are per fingerprint, not global | Low | A distributed attack on sign-in is slowed per address; accounts are never locked out permanently. | Add a global backstop if abuse appears |
| Behavioral AI analysis sends aggregates to OpenAI | Low | Aggregates only, no visitor identity, on demand, with a kill switch. | Keep the kill switch documented |
| Automated dependency scanning is not wired into CI | Low | Lockfile is pinned. | Add `npm audit` / Dependabot after launch |

## Privacy verification

Checked against `docs/BEHAVIORAL_INSIGHTS.md`:

- **Off by default.** Nothing is collected until an owner turns on a mode for an environment.
- **Strict consent** sends nothing until the visitor allows it; declining leaves the site usable;
  Global Privacy Control is treated as a decline; withdrawal stops collection immediately.
- **No identity.** Event schema rejects keys named like passwords, cookies, authorization, or HTML
  (`telemetry/event-schema.ts`); tab sessions are hashed with a keyed hash before storage; the
  network address is used only for a short-lived, hashed rate-limit bucket and is never stored in
  product data.
- **Retention.** Raw events expire in 72 hours by default (7 days at most); aggregates in 90 days;
  `/api/cron/telemetry` deletes expired rows every five minutes.
- **Exclusions.** Review sessions, preview and staging, local development, bots, and synthetic tests
  stay out of production summaries.
- **Kill switches.** `PASSOFF_TELEMETRY_KILL_SWITCH=true` stops visitor collection without affecting
  review tools. `PASSOFF_BEHAVIORAL_AI_KILL_SWITCH=true` stops on-demand analysis only.
- **Review data on host pages.** The review script is only loaded for an active review session.
  Reviewers can mark selectors private; those are excluded from capture.
- **Story 8 additions.** Operational logs never carry visitor or customer content (above). Expired
  launch codes, reset tokens, sessions, and rate-limit counters are now purged daily.

Not legal advice: site owners choose their collection mode and remain responsible for notice and
consent where the law requires it.

## Website SDK hardening (Story 8)

- Dormant script: 12.3 KB parsed / 4.0 KB gzip, well inside the 20 / 8 KB budget. It is the only part
  loaded for ordinary visitors.
- Review script (only for active reviewers): 60.2 KB / 16.9 KB gzip. This is over the original
  45 / 15 KB proposal. The growth came from comments, approvals, video notes, and verification hooks.
  Budgets in `packages/website-sdk/scripts/measure.mjs` were raised to 65 / 18 KB **deliberately** and
  `npm run sdk:measure` now **fails** when any file goes over, including the heatmap and verification
  scripts that were previously unmeasured.
- Host-page safety: every public entry point runs inside `withHostSafety`, the session token lives in
  `sessionStorage` (never `localStorage`), no `eval`, no dynamic HTML, and the browser suite proves the
  host page survives a forced init error, a screenshot failure, and teardown (`e2e/website-sdk.spec.ts`).
- Cross-origin: the SDK API echoes only an exact, validated origin that the environment allows; it never
  answers `*` (`e2e/launch-hardening.spec.ts`).
- Remaining measured claim: the 50 ms init and 100 ms add-feedback budgets are still proposals. They have
  not been measured as passing and are not promised publicly.
