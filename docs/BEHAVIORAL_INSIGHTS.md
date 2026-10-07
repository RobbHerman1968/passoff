# Behavioral insights

This is product documentation, not legal advice. Site owners remain responsible for configuring collection appropriately for their websites and visitors.

## What is collected

When an owner turns on behavioral insights for an environment, Passoff may collect:

- Page views (normalized route only)
- Clicks on labeled or categorized controls, with coarse coordinate buckets
- Scroll milestones (25, 50, 75, 90, 100 percent)
- Repeat-click signals after multiple clicks on the same safe category in a short interval
- Possible dead-click candidates when no response is detected
- Sanitized JavaScript error categories and fingerprints

Events include a schema version, event id, batch id, public installation key (resolved server-side), route, optional host version, time, viewport group, sampling metadata, and a temporary in-memory tab value that is hashed before storage.

## What is never collected

Names, emails, user or account IDs, CRM or advertising IDs, persistent visitor IDs, device fingerprints, cookies, authorization headers, request bodies, form values, passwords, keystrokes, clipboard contents, arbitrary page text, full DOM, chat, payment information, precise geolocation, complete IP addresses in product data, session recordings, screenshots of visitors, or cross-site browsing.

## Why it is collected

To help site owners find possible usability problems. Signals are aggregated. Repeat clicks and possible dead clicks are indicators, not proven defects. Passoff does not use this data for advertising or link it to a visitor’s Passoff, website, CRM, or customer account.

## Collection modes

- **Off** (default): nothing is collected.
- **Strict consent**: no events leave the browser until the visitor allows usability data. Decline leaves the site fully usable. Withdrawal stops collection immediately.
- **Privacy-first aggregate**: the owner must choose this explicitly and confirm that notice-and-opt-out is appropriate. It is not automatically lawful everywhere. No cookies or persistent analytics identifiers.

## Visitor choices

The optional analytics module shows a compact panel and, unless the owner explicitly replaces it, keeps an accessible Privacy choices launcher available after a decision. Allow and No thanks have equal prominence. `Passoff("openPrivacyChoices")` reopens choices. `Passoff("excludeSession")` excludes the current page session without sending an identity. Global Privacy Control is treated as an opt-out.

The consent preference may persist so the website can honor it. It is not an analytics identifier.

## Retention and deletion

Raw events default to 72 hours (maximum 7 days) and are deleted automatically. They are not shown in ordinary product UI. Aggregates default to 90 days. A keyed, environment-scoped tab-session hash is retained only with aggregate dimensions so minimum-sample rules can count a tab once across batches and hours; it is never shown, joined to an account, or used across sites. Withdrawal stops future collection; previously anonymous aggregates are not reconstructed.

## Exclusions

Review sessions, preview and staging (unless test mode), local development, bots, synthetic tests, excluded routes, declined sessions, and privacy-signal opt-outs are excluded from production summaries. Test-mode events are labeled synthetic and never enter production aggregates.

## Installation

Use the existing Passoff install snippet. Analytics loads only when the current production environment has collection enabled. It does not load during an active review.

Host APIs:

```html
<script>
  window.Passoff && window.Passoff("openPrivacyChoices");
  window.Passoff && window.Passoff("excludeSession");
  window.Passoff && window.Passoff("setRouteTemplate", "/products/:id");
</script>
```

Mark interactive elements or page regions with `data-passoff-analytics-label` using short, non-personal labels. Client-side route changes create a new page view and reset scroll milestones without requiring a reload.

## Heatmaps (Phase 11)

Reports query aggregates only. Low-sample groups show “Insufficient sample,” which is different from “No data collected” and from zero recorded events. Incompatible layouts and versions are not mixed.

## Findings and AI (Phase 12)

Deterministic findings can become issues only after a person confirms. AI analysis is on-demand, bounded, and labeled. It cannot create, verify, close, or approve work. Behavioral evidence snapshots are immutable aggregates with no visitor identity.

Finding types: click concentration, repeat-click concentration, possible dead click, scroll drop-off, sanitized JavaScript error concentration, and material behavioral change between versions.

Follow-up comparisons summarize compatible before/after rates. Outcomes such as “appears improved” are evidence summaries, not verification.
