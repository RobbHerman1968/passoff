# Public site UI/UX guidelines

These rules cover every page a signed-out visitor can reach: the homepage, pricing, product and use-case pages, comparisons, alternatives, sign in, sign up, and password recovery. They sit on top of the product rules in `AGENTS.md` and the voice in `docs/BRAND_VOICE.md`. When this document and older docs disagree about product scope, this document and `docs/MVP_PLAN.md` win.

The goal of the public site is simple: a visitor should understand what Passoff does within one screen, trust that it is a real product, and find the next step without hunting.

## 1. What we are selling

Use this positioning on every page. Do not invent a different one per page.

- **Passoff is website review with issue evidence.** A reviewer pins an issue to the exact element on a live website. Passoff keeps the screenshot, page, browser, and version with it.
- **Issues move through a visible path:** Open, In progress, Ready for verification, Verified, Closed. A person verifies the fix. Approval is tied to the version the reviewer actually saw.
- **Video is evidence, not a separate product.** Describe it as a short clip attached to an issue. Do not present a standalone "video review" workflow or link "Video" as a top-level product in navigation.
- **Guests are free and need no account.** One link, familiar words.
- **Plans are Free, Studio, and Agency.** Take numbers only from `src/lib/billing/plans.ts` (`PLAN_ENTITLEMENTS`, `AGENCY_TRIAL_DAYS`, `formatUsd`). Never hard-code a price, limit, or trial length in copy.

Never claim:

- Features that are not shipped (AI triage, behavioral analytics, integrations) as available today. Say "coming later" only if `docs/MVP_PLAN.md` lists it.
- "The only", "the first", or any exclusive claim.
- Customer quotes, logos, ratings, or usage numbers we do not have. Use product illustrations instead of fake proof.

## 2. Page anatomy

Every marketing page follows the same rhythm so the site feels like one product.

1. **Hero:** `section.hero-backdrop` with an optional `.hero-grid` layer. It has a pill eyebrow, a `display-title` `h1`, one or two sentences of supporting copy, one primary CTA, an optional secondary link, and a short checklist of three trust points. On the homepage the hero also shows a product mockup (`ReviewPreview`).
2. **Body sections:** use `SectionIntro` for each section heading. Use `align="center"` for a section that introduces a grid, and `align="split"` (the default) for text next to content.
3. **Closing CTA:** every page ends with `SiteCta`. Do not build a one-off closing banner.

One page, one `h1`. Section headings are `h2` with `.section-title`. Card titles are `h3`.

## 3. Visual tokens

Use tokens from `src/app/globals.css`. Do not introduce raw hex values, one-off shadows, or arbitrary spacing.

| Need | Use |
| --- | --- |
| Page background | `bg-background` |
| Alternate band | `bg-surface` |
| Dark feature band | `bg-brand-dark text-brand-dark-foreground`, edges `border-brand-dark-border`, inner cards `bg-brand-dark-surface`, highlights `text-brand-dark-accent` / `text-brand-dark-success` |
| Glow behind a mockup or CTA | `--brand-glow` (already used by `.hero-backdrop` and `SiteCta`) |
| Card | `rounded-2xl bg-card ring-1 ring-foreground/10`, plus `elevation-sm` when it should lift |
| Featured card | Add `ring-2 ring-primary`. Use only one per section. |
| Decorative divider | `border-border` (subtle; not for controls) |
| Control boundary (inputs, outline buttons, toggles) | `border-input` (meets 3:1) |
| Primary action | `Button` default variant. Only one per view. |

Type scale: `.display-title` for the hero `h1`, `.section-title` for section `h2`, `text-lg font-semibold` for card titles, `text-base`/`text-lg text-muted-foreground` for body. Use `tabular-nums` for prices and counts.

Spacing: use major sections `py-20 lg:py-28` and standard sections `py-16 lg:py-24`. Inside sections, keep gaps at `gap-6` (cards) and `gap-10`/`gap-12` (columns). Use `page-padding` and `content-width` for horizontal containment.

## 4. Shared components to reuse

| Component | Use it for |
| --- | --- |
| `SiteHeader`, `SiteFooter` | Every public page, via `src/app/(public)/layout.tsx`. Footer links come from `publicFooterGroups` in `src/lib/site.ts`. |
| `SectionIntro` | Every section heading block. |
| `SiteCta` | The final call to action on a page. Pass `kicker`, `title`, `body`; keep the default action unless the page has a better outcome-named label. |
| `ReviewPreview` | Product illustration. Use `compact` in narrow columns. Do not screenshot the real app into marketing pages. |
| `HomeWorkflow` | The interactive "how it works" tabs. |
| `PricingPage` | All plan presentation. Other pages link to `/pricing` instead of repeating prices. |
| `AuthCard`, `AuthBrandPanel`, `OAuthButtons` | Every sign-in, sign-up, and recovery screen. |
| shadcn/ui (`Accordion`, `Button`, `Badge`, `Sheet`, …) | Interaction primitives. Install a missing one with `npx shadcn add <name>` rather than hand-building it. |

Link to sign up and sign in through `authRoutes` in `src/lib/site.ts`. Never hard-code `/sign-up` or `/login`.

## 5. Calls to action

- Primary CTA label: **"Start your first review"** (hero and closing CTA). Header CTA: **"Start a review"**. Secondary: **"See pricing"** or a specific "See how it works".
- Directly under or beside a primary CTA, state the cost of trying: "{AGENCY_TRIAL_DAYS} days on Agency, no card required." Read the number from `plans.ts`.
- Do not stack more than two buttons together. Do not use "Learn more" as a label; say what the visitor will learn.

## 6. Copy

Follow `docs/BRAND_VOICE.md`, with these updates to its word list:

| Use | Avoid |
| --- | --- |
| Issue | Ticket, bug report, annotation |
| Review | Review round (legacy) |
| Version | Revision, build hash |
| Video evidence, short clip | Video review |
| Ready for verification | Resolved, done |
| Workspace | Team (legacy), tenant |

- Headlines describe the outcome for the visitor ("Client feedback, pinned to the work"), not the mechanism.
- One playful phrase per block at most.
- Keep supporting paragraphs to two or three sentences.

## 7. Accessibility checks (release blockers)

- Run `jest-axe` in component tests for new public components (see `pricing-page.test.tsx`).
- Each `<section>` with a heading uses `aria-labelledby`. Landmark labels must be unique on a page.
- Whole-card links: put the link on the title and stretch it with `after:absolute after:inset-0`. Show focus on the card with `has-[a:focus-visible]:outline-2 outline-ring`. Never nest interactive elements inside a stretched link.
- Scrollable regions (comparison tables) get `role="region"`, an `aria-label`, `tabIndex={0}`, and `relative overflow-x-auto` so screen-reader-only text cannot escape.
- Accordion answers use `forceMount` so content is still in the HTML for search and find-in-page.
- Decorative backgrounds and mockups are `aria-hidden` or have meaningful alt text, never both.
- Motion: entrance effects must respect `motion-reduce:`; nothing may require animation to be understood.

## 8. Responsive checks

Test at 320, 375, 768, 1024, and 1440 px, plus 200% zoom. The page must never scroll sideways.

- The hero stacks below `lg`. The mockup goes under the copy, not beside it.
- Header: below `sm` the Sign in link moves into the mobile sheet. The CTA stays visible.
- Grids drop to one column below `sm`. Pricing cards stack, and the featured card loses its vertical offset.
- Use `min-w-0` on flex and grid children that contain long text or code.
- Check overflow in the browser with `document.documentElement.scrollWidth - window.innerWidth`. Any value above zero blocks release.

## 9. Before you ship a public page

1. It has one `h1`, a unique `<title>` and description through `metadata`, and an OpenGraph image if it is an SEO page.
2. It uses the hero → sections → `SiteCta` rhythm.
3. Every number comes from `plans.ts` or real data.
4. No claim promises an unshipped feature.
5. `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run build` pass.
6. Screenshots at all five widths in light and dark mode show no overflow and no clipped content.
