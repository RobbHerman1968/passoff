# Passoff and Precision Foundry delivery package

Status: Product direction and pricing recommendation; not yet published  
Last updated: October 5, 2026

## Decision

Passoff should offer an optional delivery package backed by Precision Foundry. It gives a small development team a focused place to receive Passoff issues and complete delivery work without buying the AI-heavy portfolio and requirements capabilities of the full Foundry product.

This is a direct integration between products owned by the same company, not a generic Jira-style connector and not a shared database. Passoff remains the source of truth for website review evidence and reviewer discussion. Foundry becomes the source of truth for assigned delivery work after an issue is handed off.

## Recommended offer

**Passoff Delivery Pack**

- Standard price: **$19 per month for up to 10 delivery users**
- Founding-customer price: **$10 per month for the first 12 months**
- Availability: an add-on to a paid Passoff workspace, not a standalone Foundry plan at launch
- One Delivery Coordinator included
- Up to 10 Team Members or Testers included
- Unlimited read-only Viewers
- Additional capacity: either $2 per user per month or another 10-user block for $15 per month; decide after observing real usage
- No included AI allowance and no automatic AI overages
- If the customer upgrades to full Precision Foundry, credit the current month's $19 delivery-package charge toward the upgrade

The founding price is an acquisition and learning offer. Public pricing should show the normal $19 value even when an eligible early customer receives the $10 rate.

Do not publish this pricing until billing behavior, package limits, customer-facing terms, and upgrade treatment have been approved.

## Included capabilities

- Receive a Passoff issue as linked delivery work
- Preserve the Passoff issue link, screenshot or video evidence, page, environment, and relevant discussion context
- Create, assign, prioritize, and update delivery tasks
- Use a delivery board and sprints
- Record testing results and evidence
- Coordinate release and completion status
- Use delivery progress reporting
- Send meaningful status changes back to Passoff

## Excluded capabilities

- AI generation or analysis
- Portfolio intake and prioritization
- Business-case development
- AI-assisted discovery, estimation, requirements, or delivery planning
- Organization-wide project approval workflows
- Full Foundry portfolio reporting
- A general-purpose external integration API at launch

The UI and server must enforce these boundaries. Hiding navigation alone is not sufficient.

## Foundry architecture assessment

The current Foundry codebase already provides most of the required foundation:

- Durable Full, Contributor, and Viewer billing classes are separate from project responsibilities.
- Team Member and Tester are Contributor roles and do not receive AI-generation capability.
- Contributors can update work assigned or proposed to them, with server-side authorization.
- Testing participation and evidence recording already support Contributor access.
- AI allowance is calculated from Full users only; Contributors and Viewers add no AI allowance.
- Stripe synchronization already tracks Full and Contributor quantities separately.
- The delivery domain already includes tasks, boards, sprints, testing, acceptance criteria, releases, and reporting.

The current Foundry Team plan cannot simply be reused. It costs $240 per month and bundles 10 Full users with 10 Contributors. The delivery package needs its own entitlement boundary.

## Required product work

1. Add a delivery-only plan or entitlement profile in Foundry.
2. Add a Delivery Coordinator capability set that can manage delivery work without AI, portfolio, or broad approval access.
3. Intersect role permissions with plan entitlements on the server so an administrator in a delivery-only workspace cannot reach excluded Full-product capabilities.
4. Support a delivery-only workspace without requiring a billable AI-capable Full seat.
5. Provision or link the Foundry workspace from Passoff through an authenticated service boundary.
6. Map Passoff workspaces, projects, reviews, issues, users, and Foundry delivery records with durable external IDs.
7. Make create and update operations idempotent and retryable.
8. Synchronize only meaningful workflow events; do not mirror every internal event or create notification loops.
9. Provide clear unlinking, permission-denied, unavailable, conflict, and recovery states.
10. Meter actual storage, notification, database, and support usage before finalizing long-term pricing.

## Initial synchronization boundary

Passoff to Foundry:

- Create linked delivery work from a Passoff issue
- Send the issue title, description, priority, assignee mapping, source link, environment, screenshot or video evidence link, and selected discussion context
- Notify Foundry when the Passoff issue is materially changed, reopened, or removed

Foundry to Passoff:

- Assigned
- Work started
- Ready for testing
- Testing passed or failed
- Released or completed
- Blocked, with a short explanation and direct Foundry link

Passoff should display these as delivery status, not silently replace the issue's review status. Resolution and verification remain explicit Passoff decisions.

## Pricing checkpoint

Revisit the $19 standard price after at least 10 active customer workspaces or three months of representative use, whichever comes later. Review:

- Active users and projects
- Database, storage, email, and webhook volume
- Support time per workspace
- Upgrade rate into full Foundry
- Whether teams need more than one Delivery Coordinator
- Whether $2 individual seats or $15 ten-seat blocks are easier to understand

Do not change founding-customer terms retroactively during their promised 12-month period.
