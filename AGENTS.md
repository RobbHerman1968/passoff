<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Passoff product implementation rules

These rules apply to every user-facing Passoff feature.

## Product and language

- Build for the person completing a real task, not for the convenience of the implementation.
- Use plain, friendly language. Avoid technical terms, internal system names, and unexplained abbreviations in user-facing copy.
- Name actions by their outcome. Prefer labels such as “Share review,” “Add issue,” and “Mark as resolved” over generic labels such as “Submit,” “Execute,” or “Process.”
- Always design useful empty, loading, success, error, offline, permission-denied, and retry states.
- Do not expose raw errors, stack traces, status codes, storage keys, selectors, or implementation details to end users. Translate them into a clear explanation and a next step.
- Destructive actions must clearly name what will be removed and require confirmation when the result is not easily reversible.

## Design system

- Tailwind CSS is the styling system.
- Install and configure shadcn/ui before implementing product UI.
- Use an appropriate shadcn/ui component whenever one meets the interaction need. Extend it through shared variants or composition rather than recreating an equivalent one-off component.
- Put reusable product patterns in shared components. Do not duplicate dialog, form, menu, notification, loading, or empty-state patterns across routes.
- Use design tokens for color, spacing, radius, type, shadows, and focus styles. Do not scatter unexplained literal values through components.
- Preserve a calm, consistent hierarchy. A screen should have one obvious primary action.

## Accessibility

- Meet WCAG 2.2 AA at minimum.
- Text and meaningful icons must have at least 4.5:1 contrast against their background. Large text may use the WCAG AA minimum of 3:1. Interactive boundaries and focus indicators must have at least 3:1 contrast against adjacent colors.
- Never use color alone to communicate state. Pair it with text, an icon, or another non-color cue.
- All functionality must be usable with a keyboard, with a visible focus indicator and a logical focus order.
- Use semantic HTML first. Add ARIA only where native semantics are insufficient.
- Give every page a unique, descriptive title and one clear `h1`.
- Dialogs, menus, popovers, notifications, drag-and-drop interactions, comment pins, video controls, and review modes must be usable with assistive technology.
- Touch targets must be at least 44 by 44 CSS pixels unless the target is inline text with adequate spacing.
- Respect reduced-motion preferences and do not require motion to understand state changes.
- Accessibility checks are part of acceptance criteria, not deferred cleanup.

## Responsive behavior

- Every user-facing workflow must work at 320 CSS pixels wide through large desktop sizes without horizontal page scrolling.
- Design mobile behavior intentionally; do not merely compress the desktop layout.
- Keep the primary action and current status reachable on small screens.
- Website feedback, comment threads, and issue evidence must support touch, mouse, keyboard, and screen-reader use.
- Test at minimum at 320, 375, 768, 1024, and 1440 CSS pixels, plus zoom at 200%.

## Forms and feedback

- Every input needs a persistent visible label. Placeholder text is supplemental, not a label.
- Validate as early as is helpful without interrupting typing. Put errors next to the relevant field and explain how to fix them.
- Preserve user-entered content after recoverable errors.
- Acknowledge successful actions and make background progress visible in understandable terms.
- Never leave a person at a dead end. Error and empty states must offer a reasonable next action.

## Quality gates

- Run lint, type checks, relevant tests, and a production build before considering implementation complete.
- Test critical workflows with keyboard-only navigation and at responsive sizes.
- Check new foreground/background color pairs for WCAG AA contrast in both light and dark themes when both are supported.
- Verify user-facing copy for clarity, brevity, and recovery guidance.
- Treat regressions in accessibility, responsive behavior, or core review performance as release blockers.

## UI guidelines

- Public site (marketing, pricing, comparisons, sign-in and sign-up): follow `docs/UI_PUBLIC_GUIDELINES.md`.
- Signed-in app (workspace, projects, reviews, issues, verification, approval, video evidence, usage): follow `docs/UI_APP_GUIDELINES.md`.
