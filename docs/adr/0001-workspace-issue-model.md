# ADR 0001: Workspace, environment, issue, and version-specific approval

Status: Accepted  
Date: 2026-10-04

## Context

The first Passoff schema used teams, review rounds, persisted feedback, and a standalone video review type. The current product is website review in a workspace, with video as short issue evidence and approvals bound to a recorded deployment.

## Decision

- Rename `teams` to `workspaces` in PostgreSQL with `ALTER TABLE ... RENAME` so membership and project rows keep their identities.
- Evolve `website_installations` into `project_environments` and introduce immutable `deployments`.
- Replace feedback with `issues` using statuses `open`, `in_progress`, `ready_for_verification`, `verified`, and `closed`. Closure reasons are stored separately.
- Map legacy `resolved` to `ready_for_verification`. Do not fabricate a verification record.
- Preserve `review_rounds` as `legacy_review_rounds`. Preserve unmappable video reviews as `legacy_video_reviews`.
- Keep existing Passoff prices. Apply the published member and active-review-website limits. Publish only the Agency video-evidence pilot. Leave Free and Studio video evidence undecided.
- Do not collect payment or enforce plan limits in this migration.

## Consequences

Application code must scope every product query by `workspace_id`. Guest review and SDK submit remain later slices. Billing enforcement remains later work.
