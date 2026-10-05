# Signed-in app UI/UX guidelines

These rules cover everything behind sign-in: the workspace shell, projects, reviews, website setup, issues, verification, approval, video evidence, usage, and settings. They sit on top of `AGENTS.md` (accessibility, responsive, and quality rules) and follow the product scope in `Pass_off_Product_and_build` and `docs/adr/0001-workspace-issue-model.md`.

The app should feel like a calm, capable work tool: dense enough to scan many issues, clear enough that a first-time project owner always knows the next step.

## 1. The job the app does

Every screen serves one loop:

> Project → install on the website → share a review → client pins an issue with evidence → assign → fix → **human verification** → **approval tied to a version**.

Design decisions should shorten that loop or make its state more obvious. If a screen does neither, it probably belongs later.

## 2. Information architecture

```
Workspace
└── Projects                     /dashboard
    └── Project                  /projects/[projectId]
        └── Review               /projects/[projectId]/reviews/[reviewId]
            ├── Setup            (website address, install, environment, version)
            ├── Guest links      (expiring, revocable)
            ├── Issues           (list + issue detail)
            └── Approval         (version-bound sign-off and history)
```

Planned top-level sections, to add only when their route exists:

| Section | Purpose | Release |
| --- | --- | --- |
| Projects | Everything the workspace reviews | Now |
| My issues | Issues assigned to me, across projects | A (with assignment) |
| Activity | Workspace audit trail | A |
| Settings → Workspace, Members, Usage and plan | Owner administration | A (A12, A15) |
| Insights | Behavioral data per route and version | B |

Never add a navigation item, tab, or button that leads to an unbuilt page. If a step in the workflow is not built yet, show it as **Later** in a checklist with one honest sentence, as the review page does for guest links.

## 3. Shell and page anatomy

The shell lives in `src/app/(app)/layout.tsx` and renders `AppShell` once, so the sidebar and header never re-render or flash during navigation.

- **Sidebar (desktop ≥ `lg`):** logo, workspace card (name + role), primary nav, recent projects, Help, and the `AccountMenu` at the bottom.
- **Mobile header (< `lg`):** menu button (opens the same sidebar in a `Sheet`), logo, Help, avatar `AccountMenu`.
- **`<main id="main-content">`** is rendered only by the shell. Pages must not render their own `<main>`. A skip link targets it.
- Pages render content only. They start with `PageHeader`.

`PageHeader` order: breadcrumbs → `h1` + status pill → one-line description → actions on the right. Actions are: **one** primary button, plus secondary actions in an outline "…" menu (`ProjectActionsMenu`, `ReviewActionsMenu`). Do not add a "Back to …" button; breadcrumbs do that job.

Route-level `loading.tsx` files render `LoadingState withHeader` so the skeleton appears inside the shell.

## 4. Page patterns

Use one of these three layouts. Do not invent a fourth without updating this document.

**List page** (dashboard, project, future "My issues"):

1. `PageHeader`
2. `SuccessNotice` (when a `?notice=` is present)
3. `SummaryStats` (optional; only real counts, hidden while filters are active)
4. `ListToolbar` (visible search label, debounced search, segmented "Show" filter, Clear filters)
5. `ResourceList` rows, or an `EmptyState` with the next action

**Detail page** (review, future issue full page):

1. `PageHeader`
2. Read-only `Alert` when archived or historical
3. Two columns at `lg`: main work area (`minmax(0,1fr)`) and a `20rem` `<aside aria-label="… details">` for setup and metadata cards. One column below `lg`, with the main area first.
4. `SetupChecklist` at the top of the main column until setup is finished.

**Triage view** (issues inside a review):

- Keep the issue list full width on the review page. Do not use a desktop split-preview layout.
- Selecting an issue navigates to `/projects/[projectId]/reviews/[reviewId]/issues/[issueNumber]`.
- Preserve the list’s search, filters, status selection, and page in a validated `return` query on the detail URL so “Back to issues” restores the same list state. Never accept an external redirect.

## 5. Shared building blocks

| Component | Use for |
| --- | --- |
| `AppShell`, `AccountMenu`, `HelpTrigger` | Chrome. Already wired in the layout. |
| `PageHeader` + `ProjectBreadcrumb` | Every page header. |
| `ResourceList`, `ResourceListHeader`, `ResourceRow`, `ResourceRowTitle`, `ResourceTile` | Any list of workspace objects. The title is the single stretched link. Menus and inline controls go in a `relative z-10` wrapper. |
| `ListToolbar` | Search + one segmented filter. For more than one filter, add a "Filters" `Sheet` (mobile) or popover (desktop) built on shadcn components, and keep active filters visible as removable chips. |
| `SummaryStats` | 3–4 headline numbers. Each needs a label and, if useful, a hint. |
| `SetupChecklist` | Multi-step readiness (install, guest link, first issue). States: Done, Next step, Later. |
| `StatusPill`, `StatusBadge`, `ProjectStatusBadge`, `ReviewStatusBadge` | All statuses. Tinted pill + dot + words. Never color alone. |
| `EmptyState`, `ErrorState`, `PermissionDeniedState`, `OfflineState`, `LoadingState` | All non-happy states. Pass `headingLevel={3}` when inside a section that already has an `h2`. |
| `ConfirmDialog` / `AlertDialog` | Destructive or hard-to-reverse actions. Name the object in the title ("Delete Acme Launch?"). |
| `SuccessNotice` | Confirmation after redirects. Use an `aria-live="polite"` region for in-place updates. |

If a new pattern repeats across two routes, make it a shared component before the second use.

## 6. Visual rules for the app

The app is quieter than the marketing site.

- Cards: `rounded-xl border border-border bg-card`. No glows, `hero-backdrop`, or `rounded-2xl` marketing treatments inside the app.
- Rows: `px-4 py-3`, `text-sm`, title `font-semibold`, meta `text-xs text-muted-foreground`. Column headers live in `ResourceListHeader` (`md` and up only).
- Primary color is for the one primary action, the current-step marker, and focus. Status color belongs only to `StatusPill`.
- Controls use `border-input` / `ring-input` (3:1). `border-border` is for decorative dividers only.
- Numbers use `tabular-nums`. Relative times use `formatRelativeActivity` inside `<time dateTime>`.
- Section headings use `type-section-title`; page titles use `type-page-title`.

## 7. Issues

### Status, priority, and assignment

Statuses come from `src/lib/issues/statuses.ts`. Always use `ISSUE_STATUS_LABELS`; never write status words by hand.

| Status | Tone | Who can move an issue here |
| --- | --- | --- |
| Open | `open` | Anyone who can comment; also a reopen (reason required) |
| In progress | `in-progress` | Workspace members; also a failed verification |
| Ready for verification | `ready` | Workspace members (the developer) |
| Verified | `positive` | Authorized reviewer only, by recording a verification |
| Closed | `muted` | Authorized reviewer only, with a closure reason |

- The status control shows only transitions the current person is allowed to make. Disallowed transitions are absent, not disabled with no explanation. If an expected action is missing, explain why in one line ("Only reviewers can verify fixes.").
- Priority (`Low`, `Normal`, `High`, `Urgent`) and assignee are separate fields beside status. Show priority as an icon plus a word, never color alone.
- Closing asks for a closure reason (`ISSUE_CLOSURE_REASON_LABELS`). Reopening asks for a reason, and both are kept in history.

### Issue list

- Columns (desktop): number (`#12`), title + page path, status, priority, assignee, last updated. Mobile rows: title, status pill, then a single meta line.
- Filters: status (default "Open, In progress, Ready for verification"), priority, assignee ("Me" first), page, version, "Has video". Put the filter state in the URL.
- Sort by most recently updated by default. Group or sort by status when the person asks for it; do not invent a kanban board until list triage is proven.
- Bulk actions (assign, change priority) appear in a toolbar only when rows are selected, with a visible selected count.

### Issue detail

Top to bottom (or main column then aside on desktop):

1. **Header:** `#number`, title, status control, primary action for the current state (for example "Mark ready for verification", "Record verification", "Reopen issue").
2. **Evidence:** screenshot with an honest **capture label**:
   - *Original screenshot*: taken in the reviewer's browser.
   - *Reconstruction*: generated from the page structure; it may not match pixel for pixel.
   - *Later capture*: taken afterwards by our worker; the page may have changed.
   - *Screenshot unavailable*: the comment was saved, the image wasn't. Offer "Try capturing again" when possible.
3. **Location:** page URL, element description, and **anchor confidence**: "Matched", "Possible match: check before fixing", or "Element not found on the latest version". Low or missing confidence offers **Relink to an element** and keeps the original evidence.
4. **Technical context** (collapsed by default): browser, viewport, OS, version, console summary. Redacted values say "Hidden for privacy", never blank.
5. **Video evidence** (if present): see section 10.
6. **Conversation:** the original comment first and visually distinct; replies below. Original text is never edited by AI.
7. **History:** every status change, assignment, verification, and reopen with actor and time.
8. **Aside fields:** assignee, priority, environment, version, reporter, created/updated.

## 8. Verification

A verification is a record, not a checkbox.

- "Record verification" opens a dialog that captures: checked URL, version (defaults to the latest deployment), viewport, method (Manual check, Element visible, Bounding box overlap, Named test hook), outcome (Fixed / Not fixed), note, and new evidence (screenshot or clip).
- Outcome **Fixed** moves the issue to Verified. **Not fixed** moves it back to In progress and requires a note for the developer.
- Show past verifications as compact record cards in history: "Verified by Maya on v13 · 1440 × 900 · Manual check".
- Automated or AI results are labeled "Suggested" and route to a person. Nothing verifies or closes an issue automatically.

## 9. Approval

- Approval belongs to a review **and** a recorded version. The approval card shows approver, time, environment, version, and the open-issue count at the time.
- Before approving, show what is being approved: version, viewport checked, and any issues not yet Verified, with a clear warning if any remain.
- When the deployment changes, the previous approval stays visible but becomes **historical**: muted pill "Approved for v12", an `Alert` saying "The site now runs v13. Ask for a fresh approval.", and the primary action becomes "Ask for approval on v13".
- Never word an approval as covering future versions.

## 10. Video evidence

Phase 7 video is a provisional hybrid workflow inside a website review, not a standalone project or review type. A short clip may be attached to an existing issue or may create a draft issue when the person starts "Add video feedback" from the review. Revisit limits, plan allowances, resolution, retention, and entry points at the Phase 7 decision checkpoint in `docs/VIDEO_PLATFORM_DIRECTION.md` before implementation.

Point-in-time video feedback uses the normal issue workflow. A person pauses the video, places one numbered pin on the frame, and writes feedback. Store the timestamp and normalized coordinates relative to the rendered video content—not the player shell, controls, or letterbox space. Opening the issue seeks to that time, pauses, and reveals the pin. Timeline markers must also be available as a keyboard-operable, screen-reader accessible list.

Player states, each with plain copy and a next step:

| State | What the person sees |
| --- | --- |
| Uploading | Progress bar with percentage and "Keep this tab open". Cancel available. |
| Processing | "Getting your clip ready. You can keep working; we'll add it here." |
| Ready | Player with captions control, keyboard-operable timeline, numbered point-in-time pins, and timestamped replies. |
| Failed | "This clip couldn't be processed." Offer "Upload again". The written issue is unaffected. |
| Allowance reached | Upload is blocked with the reason and who can raise it. Existing issues stay fully usable. |
| Expired or deleted | A **deleted-evidence record** ("Clip removed on 3 Nov after 30-day retention"), never a broken player. |

Owners are warned before clips expire. There are no automatic overages.

## 11. Website setup, environments, and guest links

- Setup uses `SetupChecklist` plus the `WebsiteSetupPanel`. Installation states come from `installationStatusLabel`: Not detected, Checking, Installed, Needs attention, Disabled. Each state has its own one-line instruction.
- Show the environment and version wherever an issue, verification, or approval is displayed.
- **Guest links:** a table of links with label, expiry, status (Active, Expires in 2 days, Expired, Revoked), and created by. "Share review" creates one (choose expiry; copy link; optional email). "Revoke link" asks for confirmation and names the guest. Expired and revoked links stay listed for the audit trail.
- Never show raw keys, tokens, or selectors as the main content. The public install key may appear inside setup with its explanation.

## 12. Roles and permissions

Roles: owner, member, guest (guests never see the app; they use the SDK on the website).

| Action | Owner | Member |
| --- | --- | --- |
| Create, rename, archive projects and reviews | Yes | Yes |
| Delete projects | Yes | No |
| Install, enable, disable Passoff on a website | Yes | Yes |
| Create and revoke guest links | Yes | Yes |
| Move issues to In progress / Ready for verification | Yes | Yes |
| Verify, close, approve | Authorized reviewer | Authorized reviewer |
| Members, billing, usage limits | Yes | View only |

- Hide actions a person can never take. When someone would reasonably expect an action, show a one-line reason instead.
- Unauthorized URLs render `PermissionDeniedState` inside the shell with a way back. Never reveal whether a resource exists in another workspace.

## 13. Usage, limits, and plans

- Read every limit from `src/lib/billing/plans.ts`. Never hard-code numbers in copy.
- Usage meters show used / allowance, the time window ("this month", "retained"), and what resets when.
- At 80%: an inline warning on the relevant screen and a notice for the owner. At 100%: block only the specific action (for example new uploads), explain it, and name who can change it ("Ask your workspace owner to move to Agency"). Never block reading issues or written feedback.
- Guests are free and never count as seats. Say so wherever seats are counted.

## 14. Behavioral data and AI (Release B)

- Every number shows its **time window, sample size, environment, and version**.
- "**No data collected**" (tracking off, consent not given, route not covered) is visually and verbally different from **0** events.
- Dead-click and repeat-click signals are labeled as signals, not proof.
- AI panels have three labeled sections: **Recorded facts** (each linked to evidence), **Possible explanations** (hypotheses), and **Missing information**. The panel is titled "Suggested by AI". AI never changes status, closes issues, or edits the original comment.

## 15. Required states for every screen

| State | Pattern |
| --- | --- |
| Loading | `LoadingState` skeleton inside the shell; announce with `role="status"`. |
| Empty | `EmptyState` explaining what the object is and offering the next action. |
| Filtered to nothing | "No matching …" with **Clear filters**. |
| Error | `ErrorState` with Try again and a way back. Never show raw errors. |
| Offline | `OfflineState`; queue or block writes clearly and keep typed text. |
| Permission denied | `PermissionDeniedState` with a way back. |
| Archived / read-only | `Alert` at the top, actions removed, data still readable. |
| Historical (older version) | Muted pill + `Alert` naming the current version and the next action. |
| Partial failure | Keep the saved part, explain the missing part (for example a screenshot that failed). |

## 16. Interaction, accessibility, and responsiveness

- Filters, search, selected issue, and tabs live in the URL so links, refresh, and back all work.
- Searching is debounced (300 ms) and announced politely ("Updating results").
- After a dialog closes, focus returns to the control that opened it. After an item is deleted, focus moves to the list heading or the next row.
- Comment pins and markers are buttons with names like "Issue 12: Button text is unreadable". They are reachable in a logical order and have a list alternative.
- Keyboard shortcuts (for example `j`/`k` in the issue list) are optional extras, never the only way, and are listed in Help.
- Touch targets are at least 44 × 44 px. Row menus use `size="icon"` buttons.
- Test at 320, 375, 768, 1024, and 1440 px and 200% zoom, in light and dark mode. Sideways scrolling is a release blocker; only code blocks and wide tables may scroll, inside a labelled region.

## 17. Copy for the app

- Name actions by outcome: "Add review", "Share review", "Mark ready for verification", "Record verification", "Ask for approval", "Revoke link".
- Explain objects in their empty states: "A review is one website your client checks."
- Use **issue** (not ticket or feedback item), **version** (not deployment hash), **workspace** (not team), **guest** (not client account).
- Use people's names in history ("Maya verified this on v13"), not IDs.

## 18. Before shipping a signed-in screen

1. It uses one of the three page patterns and the shared components above.
2. It has a unique `<title>` through `generateMetadata` and exactly one `h1`.
3. All states in section 15 that can occur have been designed and tried.
4. Actions match the person's role (section 12).
5. Version and environment appear wherever evidence, verification, or approval does.
6. `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` pass, and the relevant Playwright spec passes.
7. Screenshots at the five widths in both themes show no overflow or clipped content.
