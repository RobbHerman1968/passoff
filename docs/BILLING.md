# Billing, plan usage, and limits

Passoff sells two paid plans, Studio and Agency, on top of Free. Payment is handled entirely by Stripe: Passoff sends people to Stripe Checkout to pay and to the Stripe Billing Portal to change or cancel, and **never sees or stores a card number**.

## Sources of truth

| Question | Where the answer lives |
| --- | --- |
| What does a plan cost and include? | `src/lib/billing/plans.ts`. Nothing else may hard-code a price, seat count, website limit, video allowance, or trial length. |
| Which Stripe Price is which plan and schedule? | Environment variables read by `src/lib/billing/stripe-config.ts`. |
| What plan does a workspace have right now? | The `subscriptions` row, turned into an answer by `src/lib/billing/subscription-state.ts` (`resolveEntitlement`). |
| Did the customer actually pay? | **Stripe webhooks only.** Returning from Checkout proves nothing. |

Components format catalog numbers through `src/lib/billing/format.ts`. `src/components/pricing-page.test.tsx` fails if a dollar figure appears in component source.

## Setup checklist

1. **Create products and prices in Stripe** (test mode first). One product per paid plan, each with a monthly and a yearly recurring Price whose amounts match `plans.ts` (`monthlyPriceUsd` per month and `annualTotalUsd` per year).
2. **Set the environment** (see `.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STUDIO_MONTHLY`, `STRIPE_PRICE_STUDIO_ANNUAL`, `STRIPE_PRICE_AGENCY_MONTHLY`, `STRIPE_PRICE_AGENCY_ANNUAL`. Optional: `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`, `STRIPE_AUTOMATIC_TAX=true`. All four price IDs must exist and be different, or Checkout stays unavailable and the page says so.
3. **Add the webhook endpoint** `https://YOUR_HOST/api/webhooks/stripe` with these events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Configure the Billing Portal**: allow updating the payment method and viewing invoices; allow switching between the four Prices; set cancellation to *at the end of the billing period*. Optionally pin it with `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`.
5. **Decide on tax.** Stripe Tax must be configured before setting `STRIPE_AUTOMATIC_TAX=true`.
6. **Cron**: `vercel.json` runs `/api/cron/billing` daily at 04:15 UTC (protected by `CRON_SECRET`). It sends the one-time "payment overdue, Free limits now apply" notice.
7. Replay a test-mode purchase end to end: Checkout, webhook delivery, billing page shows the plan, portal opens, cancel, plan ends.

## Subscription state

The `subscriptions` table (one row per workspace) keeps Stripe's view plus what Passoff needs: `plan`, `status` (`trialing | active | past_due | cancelled`), `billing_interval`, `provider_price_id`, `current_period_*`, `cancel_at_period_end`, `trial_started_at`, `trial_ends_at`, `past_due_since`, `cancelled_at`, and `provider_event_at` (the time of the newest Stripe event applied).

A workspace that has only opened Checkout has a *placeholder* row (plan `free`, Stripe customer ID set, no subscription ID) so that later events can be matched to it.

`resolveEntitlement` maps a row to one of these states, and the plan whose limits apply:

| State | Meaning | Limits that apply |
| --- | --- | --- |
| `free` | Never subscribed | Free |
| `trialing` | Agency trial running | Agency |
| `active` | Paid | Purchased plan |
| `cancelling` | Paid, ends at period end | Purchased plan until the period ends |
| `past_due` | A payment failed, within the 7-day grace period | Purchased plan |
| `payment_lapsed` | Grace period ended without payment | Free |
| `trial_ended` | Trial ended without a paid plan | Free |
| `cancelled` | Paid plan ended | Free |

Trial end and period end get 24 hours of slack so the workspace is not downgraded in the gap before Stripe's notice arrives.

**Nothing is ever deleted for non-payment, a downgrade, or a cancelled plan.** The worst outcome is Free limits: existing projects, reviews, issues, comments, and video stay readable and editable, and only *new additions* beyond the limit pause.

## Trial

- 14 days of Agency (`AGENCY_TRIAL_DAYS`), **once per workspace, ever**. Studio has no trial.
- Checkout collects no card for the trial (`payment_method_collection: if_required`). If no payment method is added by the end, Stripe cancels the subscription and the workspace moves to Free (`trial_settings.end_behavior.missing_payment_method: cancel`).
- Eligibility is recorded on the row (`trial_started_at` or any past subscription), so cancelling and starting over does not give a second trial. If Stripe still creates a second trial (for example from the Dashboard), the webhook cancels it.

## Who can do what

- `billing.manage` is an owner-only permission. Owners are re-checked against the database inside the action (a stale or forged role is refused). Checkout and portal sessions are rate limited to 20 per workspace per hour.
- Every member can open Settings → Billing and see the plan and usage. Only the owner sees the buttons.
- Starting a second subscription for a workspace that already has a live one is refused, both in the action and in the webhook (the duplicate is cancelled at Stripe).

## Webhooks (`src/app/api/webhooks/stripe/route.ts`, `src/lib/billing/webhook-service.ts`)

- The raw body is read as text and verified with `Stripe.webhooks.constructEvent` before anything is parsed. Bad or missing signatures get 400, a missing secret gets 503 (Stripe retries). Responses never echo the payload or the secret.
- **Idempotent.** The event receipt (`provider_events`, provider `stripe`) and the state change commit in one transaction. A repeated event finds its receipt and does nothing. If handling fails, the receipt rolls back with it and Stripe's retry does the whole job (the route returns 500).
- **Ordered.** The workspace's subscription row is locked (`FOR UPDATE`) per Stripe customer, and an event older than `provider_event_at` is ignored.
- A Stripe Price that is not one of the four configured prices **never grants a plan**. It is ignored and logged as the structured line `billing.unknown_price` (see `docs/RELEASE_AND_OPERATIONS.md`); alert on that event.
- `incomplete` and `incomplete_expired` subscriptions grant nothing. `unpaid` is treated as `past_due`.
- Notifications and duplicate-subscription cancels run after commit. A lost notice is logged, never retried by failing the event.

## Past due and downgrade

1. `invoice.payment_failed` → `past_due`, `past_due_since` set to the first failure (retries do not restart the clock). Owners get one notice per run of failures. The paid plan stays for 7 days (`PAST_DUE_GRACE_DAYS`).
2. `invoice.paid` while past due → `active`, `past_due_since` cleared, owners told.
3. After the grace period, `resolveEntitlement` returns Free limits (`payment_lapsed`) with no webhook needed. The daily cron sends one notice per lapse.
4. If Stripe ends the subscription, `customer.subscription.deleted` → `cancelled`, owners told, work kept.

## Limit enforcement (server side)

All limits come from `PLAN_ENTITLEMENTS` through `resolveWorkspacePlanId` in `src/lib/billing/effective-plan.ts`.

| Limit | Enforced in |
| --- | --- |
| Workspace members (including open invitations) | `src/lib/workspaces/capacity.ts` and `invitations.ts` (Story 6) |
| Active review websites | `src/lib/billing/review-websites.ts`, called from `createWebsiteReview`, `restoreReview`, `restoreProject`, and `openReview` in `src/lib/projects/service.ts` |
| Video evidence minutes | `src/lib/video/usage.ts` and `checkVideoEvidenceUpload` |

An **active review website** is one environment with at least one review that is not archived and not closed, inside a project that is active and not deleted. Distinct environments are counted, so several reviews of one website count once.

Enforcement is race safe: the workspace row is locked (`FOR UPDATE`) inside the same transaction that recounts and inserts, so two people adding at once cannot both squeeze past the limit.

At **80%** of a limit the page shows a warning and the owner gets a notice; at **100%** only the specific action is blocked, with a message that names the next step (owners see "Billing page", members see "ask your workspace owner"). Reading, comments, and issues are never blocked. Each plan and level notifies once (`billing.usage_warning`, de-duplicated). A one-person workspace is not warned about seats.

## Notifications

`billing.plan_started`, `billing.plan_changed`, `billing.trial_ending`, `billing.payment_failed`, `billing.payment_recovered`, `billing.payment_lapsed`, `billing.subscription_ended`, and `billing.usage_warning` go to every active owner in the app and by email. Billing emails are essential, so they ignore the optional-email preferences. Each is de-duplicated per recipient.

## Testing

- Unit and database tests use fixtures from `src/test/stripe-events.ts` and a fake gateway; no real Stripe account, key, or charge is involved. Tests use `TEST_DATABASE_URL` only.
- Playwright (`e2e/billing.spec.ts`) runs with `PASSOFF_BILLING_GATEWAY=fake`, which is only honored when `EMAIL_TRANSPORT=test` and not in production. It delivers signed webhooks itself with `Stripe.webhooks.generateTestHeaderString`.
- To exercise real Stripe in test mode, install the Stripe CLI and run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then use the printed signing secret.

## Known limits

- Passoff does not issue refunds or pro-rate by itself; both follow the Stripe and Portal configuration.
- Moving plans in the Billing Portal is reflected only when the subscription event arrives.
- Notifications sent after commit can be lost if the process dies at that moment. State is never lost.
