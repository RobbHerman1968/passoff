# Launch checklist and recommendation

Maintained record for MVP Cleanup Story 8 (launch hardening). Evidence is a command you can re-run or a
file you can open. Update it before every launch decision. Companion docs:
[`SECURITY.md`](./SECURITY.md) (threat model) and
[`RELEASE_AND_OPERATIONS.md`](./RELEASE_AND_OPERATIONS.md) (deploy, jobs, monitoring, retention).

## Recommendation

**Limited launch.** Invite a small group of real teams, with a person watching logs and support, and
finish the three blocking items below before opening sign-up to everyone.

No critical or high security finding is open. The product is functionally complete for the MVP, and
every automated gate is green. The remaining risk is what automation cannot show: live provider
behavior and real assistive-technology use.

**Must be done before wider launch**

1. **Use a separate test database.** Today `TEST_DATABASE_URL` points at the same Neon database as
   `DATABASE_URL`; tests only run because of an explicit personal-machine override. Create a Neon
   branch for tests, delete `PASSOFF_TEST_DATABASE_SHARED_WITH_APP` from `.env.test.local`, and run
   `npm run db:migrate:test`. Test users and workspaces are currently in your app database.
2. **Run the money and video paths against the real providers in test mode** (Stripe test cards and
   Billing Portal; a real Mux upload and signed playback; a real Resend email). Automated tests use
   signed fake events and fake gateways. Steps are in `RELEASE_AND_OPERATIONS.md` §3.
3. **Do a manual screen-reader and zoom pass** on the workflows below (VoiceOver with Safari, NVDA with
   Firefox or Chrome; 200% zoom and 400% reflow at 320 px). Automated checks cover structure, names,
   contrast, and overflow; they cannot judge announcement quality.

## Release blockers found and fixed in this story

| Finding | Impact | Fix | Guard |
| --- | --- | --- | --- |
| No migration created `issue_verifications`, `issue_assignments`, or the unique index `issues_id_scope_unique`, though code reads them | Issue export returned a server error; marking an issue resolved would fail on any database built from the migrations | `drizzle/0028_issue_assignments_and_verifications.sql` (safe to rerun) | `src/db/schema-drift.test.ts` fails if any schema table or column is missing after migrating |
| Test and app database could be the same, and tests could fall back to `DATABASE_URL` | Tests could write to real data | `src/db/test-database-guard.ts`; Playwright and migrations use it | `test-database-guard.test.ts` |
| Test-only HTTP routes enabled by `EMAIL_TRANSPORT=test` alone | A mistaken setting in production would expose seed and reset-link routes | Also require a non-production build; `EMAIL_TRANSPORT=test` throws in production | `production-routes.test.ts` (all seven routes 404 in production) |
| Cron routes each had their own check; an unset secret in production was ambiguous | Jobs reachable without a secret | One shared constant-time check; production with no secret refuses everything | `production-guards.test.ts`, `production-routes.test.ts` |
| Outbound webhook delivery checked the address, then fetched by name | DNS rebinding could reach private networks | Blocklist covers IPv4, IPv6, mapped, NAT64, 6to4; delivery connects to the checked address | `webhooks/url.test.ts`, `webhooks/post.test.ts` |
| No security headers; share and invite links leaked as referrers | Clickjacking, link leakage | `next.config.ts` headers; private links get `no-referrer`, no-store, noindex | `security/headers.test.ts`, `e2e/launch-hardening.spec.ts` |
| Raw errors reached logs with messages; no error pages; unknown pages had no plain explanation | Possible sensitive data in logs; dead ends | Privacy-safe JSON logs, readiness check, friendly error and not-found pages | `ops/*.test.ts`, `route-error.test.tsx` |
| Review SDK overran its size budget silently | Slower host pages | `sdk:measure` now fails when over; budget raised with a recorded reason | `npm run sdk:measure` |
| Notifications page scrolled sideways at 320 px | Failed responsive rule | Filter group can shrink (`min-w-0`) | `e2e/launch-hardening.spec.ts` |
| Expired reset tokens, launch codes, sessions, and rate-limit rows were never removed | Unbounded growth, stale credentials | Daily purge in `/api/cron/workspaces` | `ops/expired-records.test.ts` |
| Pricing, help, SEO, and plan docs overstated or contradicted plan limits | Product claims that were not true | Copy corrected to `plans.ts` (see claim audit) | `pricing-page.test.tsx`, `/pricing` e2e |
| Stale browser tests (removed "Website" radio, old screenshot text, old status text) | Real regressions would have been masked | Updated | `e2e/website-install.spec.ts`, `e2e/review-issues.spec.ts` |

## Gates

Last full run: 2026-10-07.

| Gate | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | Pass |
| Types | `npm run typecheck` | Pass |
| Unit and database tests | `npm test` | 143 files, 1,011 tests. One database-sharing flake (`video/retention.test.ts`, a global job with a default batch of 20) was fixed and re-run green on its own; the full suite was not re-run end to end after that one-line test change |
| Production build | `npm run build` | Pass |
| SDK budgets | `npm run sdk:measure` | Pass: loader 12.3/4.0 KB, review 60.2/16.9, screenshot 17.9/7.0, analytics 16.2/6.2, heatmap 7.9/3.0, verification 34.5/9.4 (parsed/gzip) |
| Browser tests | `npm run test:e2e` | 48 tests across 12 files, two consecutive full runs green (1.1 min) |
| Production smoke | `next start` with `EMAIL_TRANSPORT=test` and a cron secret | Test routes 404; every cron route 401 (GET and POST, no or wrong secret); unsigned Stripe and Mux posts refused; headers present; `/r/*` sends `no-referrer`, `no-store`, noindex; health reports problems without values |

**Test-stability notes.** The project-management spec used to time out when the machine was busy: a
menu closed on its own right after the previous dialog handed focus back. The spec now waits for the
dialog to finish closing and retries opening a menu. Playwright runs with two workers and two retries
in CI (`playwright.config.ts`). If a user ever reports a menu closing by itself right after a dialog,
treat that as a real bug.

## Critical workflows and their evidence

The story's list of 20 workflows was not available to me, so this maps the product's critical paths.
Replace or reorder if your list differs.

| # | Workflow | Automated evidence |
| --- | --- | --- |
| 1 | Create an account, set up a workspace, sign out, reset a password | `auth.spec.ts` |
| 2 | Create a project and a review; rename, archive, restore | `projects.spec.ts` |
| 3 | Install on a website and verify; disable and re-enable | `website-install.spec.ts` |
| 4 | Capture page feedback with the website script | `website-sdk.spec.ts` |
| 5 | See, filter, and open issues with their screenshot | `review-issues.spec.ts` |
| 6 | Discuss an issue; public reply and private note | `issue-discussion.spec.ts` |
| 7 | Attach video; wrong file explained; works on a phone | `issue-video.spec.ts` |
| 8 | Leave notes at a moment in a video | `video-notes.spec.ts` |
| 9 | Share a guest link, open it as a guest, turn it off | `launch-hardening.spec.ts` |
| 10 | Ask for and record approval; guests approve when allowed | `approvals.spec.ts` |
| 11 | Pick a plan; only Stripe's signed event changes it; payment trouble recovers | `billing.spec.ts` |
| 12 | Free-plan limit explained; upgrade makes room | `billing.spec.ts` |
| 13 | Invite a person; join; switch workspaces; leave | `workspace-members.spec.ts` |
| 14 | Remove a member; hand over ownership | `workspace-members.spec.ts` |
| 15 | Delete a workspace; delete an account | `workspace-members.spec.ts` |
| 16 | Another workspace cannot read or export your data | `launch-hardening.spec.ts` |
| 17 | Signed-out visitors are sent to sign in and back | `auth.spec.ts`, `projects.spec.ts`, `launch-hardening.spec.ts` |
| 18 | Privacy choices and page-view recording | `website-sdk.spec.ts` |
| 19 | Public pages, pricing matches the plan catalog | `launch-hardening.spec.ts`, `billing.spec.ts` |
| 20 | Unknown page and server-error recovery | `launch-hardening.spec.ts`, `route-error.test.tsx` |

Server-side only (no browser needed, covered by tests): Stripe and Mux signed events and duplicates,
cron authorization, outbound webhook signing and delivery, expired-record purge, retention.

## Accessibility audit (WCAG 2.2 AA)

Automated, on every run: axe with `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` on the home, pricing,
alternatives, sign-in, and sign-up pages at 320, 375, 768, 1024, and 1440 px; on the 404 page; on the
guest "link turned off" page; and on every main signed-in page (dashboard, notifications, usability,
account, workspace, members, billing, notification settings, webhooks, project, review, issue). Also one
`h1` and a unique title on each sitemap page and each signed-in page, and no sideways scroll at 320 px.
Component tests run axe on dialogs, error pages, approval, billing, and workspace components.

Fixed in this story: the error page now moves focus to its heading, the 404 page has its own title, and
the notifications page no longer scrolls sideways at 320 px.

**Not verified by automation (do manually before wider launch):**

- Screen-reader announcements for dialogs, toasts, the issue discussion, the video note timeline, and
  approval decisions.
- 200% zoom and 400% reflow (320 px emulates the layout, not browser zoom).
- Touch target size of icon-only buttons on real phones; reduced-motion on real devices.
- Focus order inside the website review toolbar on pages with unusual host styles.

## Responsive checklist

Mark each at 320, 375, 768, 1024, 1440 px and 200% zoom. No sideways page scroll, primary action and
status reachable, nothing clipped.

| Area | Automated (320 and 1440) | Manual |
| --- | --- | --- |
| Public pages | Yes | 375, 768, 1024 spot check |
| Sign in, sign up, reset | Yes (axe at all five widths) | Keyboard on a phone |
| Dashboard, projects, review, issue | Yes | Issue with long text, video, and many labels |
| Settings (account, workspace, members, billing) | Yes (all five widths for members) | Long names and addresses |
| Billing page | `billing.spec.ts` at 320 | Plan picker |
| Website setup dialog | `website-install.spec.ts` | Real install on a phone |
| Review toolbar in the SDK | `website-sdk.spec.ts` at 320 | Real host sites |
| Video player and notes | `video-notes.spec.ts`, `issue-video.spec.ts` at phone width | Playback on iOS Safari |

## Product-claim audit

Source of truth for limits: `src/lib/billing/plans.ts`.

| Claim | Status |
| --- | --- |
| Plans: Free, Studio, Agency; limits and prices | Matches catalog; `/pricing` e2e compares to it |
| Video clips up to 3 minutes, 250 MB, 1080p | Matches validation; FAQ now states the limits and that the monthly allowance depends on the plan |
| Video minutes: Free 10 stored, 15 uploaded per month; Studio 30/60; Agency 60/120 | Matches catalog; stale "10 playback hours" and "Agency pilot" text removed |
| "Unlimited reviewer playback" | True: playback is not metered. Text now says watching never uses the plan |
| Reviewers can leave feedback at a specific time in a video | **Not true for guests** (no player on the guest page or in the website script). Teammates can add timestamped notes. FAQ and docs now say the team notes and clients discuss the issue |
| Approval of a version by teammates and (when allowed) guests | True (`approvals.spec.ts`) |
| Usability insights and privacy | No keystrokes, text, or form values; IP not stored; consent honored; verified in `SECURITY.md` |
| Billing only changes from Stripe's signed event | True and tested |
| Data deletion | Workspace: 30 days then permanent after provider video deletion confirmed; account anonymized immediately |
| Export all of my workspace's data on request | **Not a feature.** Issue lists export to CSV and Markdown; there is no full-workspace export. Do not promise it |
| Uptime, SOC 2, or compliance statements | None made on any page; keep it that way until true |

## Known limits and follow-ups (not launch blockers)

- No script-restricting Content Security Policy yet (only framing, base, and plugin rules). Needs nonce
  support in the framework before it can be strict.
- SDK timing targets (50 ms start, 100 ms interaction) are not measured in CI; only size is.
- Review SDK size budget was raised from 45/15 KB to 65/18 KB because verification hooks joined the
  review session. Measured 60.2/16.9 KB.
- Activity history and notifications have no retention window; they hold no secrets.
- `request.failed` also logs harmless "stream closed early" errors when a visitor navigates away during
  a server action. Safe to ignore; filter by `digest` if noisy.
- The unknown-price Stripe alert depends on someone watching logs. Wire `billing.unknown_price` and
  `cron.failed` to an alert before opening sign-up.
- One Playwright spec is sensitive to heavy parallel load (see Known flake).
