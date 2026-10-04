# Cursor Story: Rebuild the Passoff Homepage Around a Persuasive Product Narrative

## Cursor instruction

Implement this story in the existing Passoff repository. Treat every requirement and acceptance criterion below as part of the task.

Before changing code:

1. Read the repository `AGENTS.md`.
2. Read the relevant Next.js 16 documentation in `node_modules/next/dist/docs/`.
3. Inspect the current public homepage and shared marketing components.
4. Preserve unrelated changes already present in the worktree.

After implementation, run lint, type checks, relevant tests, and the production build. Do not consider the work complete until the responsive and accessibility checks in this story have also been performed.

## Objective

Rebuild the Passoff homepage using a hybrid approach:

- Borrow the strong storytelling and conversion structure used by Pastel.
- Preserve Passoff's quieter, restrained, professional visual direction.
- Do not copy Pastel's branding, assets, visual styling, wording, or exact layouts.
- Make every homepage section advance a clear argument instead of presenting a disconnected list of capabilities.

The finished homepage must guide visitors through this sequence:

1. I recognize this problem.
2. I understand why it is costly.
3. Passoff solves it differently.
4. I can see how the product works.
5. I believe the product can help.
6. Trying it feels safe and worthwhile.

## Current problem

The current homepage is visually cleaner than before, but it still behaves like a feature summary:

1. Brand statement
2. Product preview
3. Three capabilities
4. Four process steps
5. CTA

It does not create enough tension, demonstrate a connected transformation, or provide evidence for its claims.

The revised page must establish:

- A clear customer outcome
- A recognizable problem
- A before-and-after transformation
- The mechanism that makes Passoff different
- One connected workflow
- Specific product capabilities in context
- Real evidence or visible product proof
- Low-risk reasons to try Passoff
- One direct final action

## Product direction

Passoff should feel:

- Calm
- Precise
- Credible
- Product-led
- Editorial
- Warm but restrained
- Designed for serious creative professionals
- Appropriate for an agency to present directly to a client

Passoff should not feel:

- Playful for the sake of being playful
- Like a generic SaaS template
- Like a clone of Pastel
- Overdecorated
- Filled with unsupported marketing claims
- Built from disconnected feature cards

## Narrative foundation

The homepage should communicate this core story:

> Review the real website or video, keep every note attached to the correct place or moment, move the work through another look, and preserve approval with the version the client actually reviewed.

The exact public wording may be refined, but the meaning must remain concrete.

Do not lead with a vague brand phrase. The hero must establish the customer, problem, outcome, and differentiating mechanism.

## Required homepage structure

### 1. Outcome-led hero

Use a two-column desktop hero.

The hero must answer:

- Who is Passoff for?
- What becomes easier?
- What outcome improves?
- What makes Passoff different?
- What should the visitor do next?

#### Hero content column

Include:

- One clear outcome-led `h1`
- One concise supporting paragraph
- One primary action
- One secondary action, such as viewing the workflow
- One short reassurance about guest access, setup, or trial friction
- Real customer attribution only if it is available and verified

Avoid:

- Vague slogans as the primary headline
- Decorative eyebrow text that does not add information
- Multiple competing calls to action
- Unsupported numerical claims
- Excessively large typography
- Extreme negative letter spacing

#### Hero product column

Show genuine product proof.

Prefer:

- A short product recording or focused sequence
- A comment being placed, answered, resolved, and moved toward approval
- A realistic Passoff interface
- A visible review round and status
- An authentic website or video review state

Avoid:

- Decorative fictional website artwork
- Browser traffic-light dots
- Large glows
- Floating promotional pills
- Generic dashboard illustrations
- Product UI that is too small to understand

The hero should demonstrate a meaningful interaction, not merely show that an interface exists.

### 2. Compact credibility section

Place credibility directly beneath the hero.

Use only factual, supportable evidence. Possible content includes:

- Real customer or agency logos
- A real customer quotation
- A factual project, review, or comment count
- A supportable customer outcome
- Security or privacy evidence
- A short product reliability statement

Do not invent:

- Customer names
- Company logos
- Testimonials
- Usage counts
- Speed improvements
- Approval metrics

If verified customer proof is unavailable, use product proof instead:

- A short workflow demonstration
- A real review example
- A specific description of what happens after sharing a review
- An honest early-access or beta statement

Keep this section compact. It must not become another large page chapter.

### 3. Fragmented-feedback problem

Create a clear before-and-after section.

#### Before Passoff

Show recognizable feedback fragments such as:

- An email referring vaguely to the page
- A screenshot with arrows
- A Slack message
- Notes from a call
- Feedback referring to the wrong version
- An informal approval that cannot be traced to a revision

#### With Passoff

Show the same project organized into:

- A comment attached to the real page or video moment
- A visible review round
- A clear conversation
- A visible status
- A request for another look
- Approval attached to the reviewed version

Use real interface fragments or restrained visual representations.

Do not use:

- AI-generated emotional characters
- Cartoon expressions
- Meme-like visuals
- Exaggerated reaction imagery
- Excessively playful icons

The section should feel like a professional workflow comparison.

### 4. Explain the Passoff mechanism

Explain why Passoff works differently:

1. Review the actual website or video.
2. Keep feedback attached to the correct location or timestamp.
3. Preserve the conversation and review round.
4. Move each item toward another look or resolution.
5. Record approval on the version the client reviewed.

Do not present this as a generic feature-card grid.

Use one of the following:

- Structured rows
- A concise process diagram
- An interface-led comparison
- A short connected sequence

### 5. One connected workflow

Create the primary product walkthrough by following one realistic project from beginning to end.

Required stages:

1. Share the work
2. Client points at the page or moment
3. Team replies and updates the work
4. Feedback is marked ready for another look
5. Client reviews the updated version
6. Approval is recorded on the correct review round

#### Desktop presentation

Prefer:

- Explanatory content in one column
- A large product view in the other column
- A product view that changes as the workflow advances
- Clear alignment between every explanation and interface state

A sticky product preview may be used only if it remains accessible and does not produce excessive scrolling or motion.

#### Mobile presentation

- Stack each explanation with its related product state.
- Keep product images concise.
- Do not require horizontal scrolling.
- Avoid previews taller than approximately one viewport.
- Do not shrink desktop screenshots until the text becomes unreadable.
- Preserve the workflow order.

Do not divide the workflow into unrelated feature cards.

### 6. Websites and videos as one review model

Only after establishing the shared workflow should the page introduce websites and videos.

The section must communicate:

> Clients learn one review process, whether the work is a website or a video.

Use a paired or accessible tabbed presentation.

#### Website review must demonstrate

- Feedback on the actual page
- Element-level positioning
- Staged or signed-in experiences
- Page and browser context
- Review rounds
- Another-look requests
- Approval

#### Video review must demonstrate

- Time-stamped comments
- Review rounds for different cuts
- Conversations attached to moments
- Another-look requests
- Approval on the correct cut

Do not present website review, video review, and approval as three disconnected products.

### 7. Why Passoff is different

Create a concise differentiator section that includes:

- Review happens on the real website.
- Staged, dynamic, signed-in, or session-specific pages can be reviewed.
- Websites and videos use one client-facing workflow.
- Technical context remains available without crowding the client experience.
- Review rounds preserve the history of the work.
- Approval remains attached to the reviewed version.
- Guests can participate without creating another account.

Present these as structured rows, a concise comparison, or a product diagram.

Do not use another grid of large floating cards.

Connect each capability to an outcome. For example:

```text
Feedback on the real website
-> less time reproducing what the client saw

Review rounds
-> nobody comments on or approves the wrong version

Guest access
-> clients participate without onboarding friction

Recorded approval
-> the team moves forward with confidence

Technical context
-> developers spend less time asking follow-up questions
```

### 8. Evidence beside important claims

Do not isolate all proof in one testimonial section.

Place evidence near the claim it supports. Examples:

- Guest simplicity beside a client quotation
- Clearer feedback beside a designer quotation
- Faster resolution beside a project manager quotation
- Reliable approval beside an agency owner quotation
- Product reliability beside factual usage information

Use verified evidence only.

If only one or two real testimonials exist, use them selectively and prominently. Do not create fictional proof to fill the layout.

### 9. Honest fit section

Add a concise section explaining when Passoff is and is not the right choice.

#### Choose Passoff when

- The team reviews real websites.
- The team also reviews uploaded videos.
- Client approval is part of the workflow.
- The work includes staged or signed-in website experiences.
- The team wants technical context without exposing complexity to clients.
- The team wants approval attached to the reviewed version.

#### Consider another tool when

- The primary need is annotating PDFs, images, emails, and many unrelated file types.
- The primary workflow is software bug reporting into an issue tracker.
- The primary workflow is advanced professional video production.
- The team requires an integration or enterprise control Passoff does not currently offer.

Keep this section concise and link to the existing comparison pages for more detail.

### 10. Concise final CTA

The final CTA must contain:

- One outcome-led headline
- Optional short supporting text
- One primary action

Requirements:

- No oversized rounded panel
- No gradient or glow
- No unnecessary illustration
- Approximately 48-64px of vertical padding on desktop
- Approximately 40-56px on mobile
- Clear visual separation from the footer

### 11. Compact utility footer

The footer is navigation, not another marketing section.

Keep:

- Passoff logo
- Short descriptor
- Four primary product links
- One comparison-index link
- Copyright information

Do not list every individual competitor comparison in the global footer.

Requirements:

- Compact horizontal or shallow-grid desktop layout
- Two-column mobile link layout where possible
- Approximately 32-48px of vertical padding
- At least 44x44px mobile touch targets
- Visible keyboard focus
- No oversized separate copyright row
- No unnecessary marketing content
- No horizontal scrolling at 320px

## Visual direction

Use Pastel's narrative strength without copying its visual styling.

Preserve Passoff's restrained system:

- Warm off-white backgrounds
- Dark ink typography
- Rust or orange used sparingly
- Quiet borders
- Real product imagery
- Subtle gray section changes
- Clear grid alignment
- Purposeful whitespace
- Consistent 8-12px radii
- One restrained elevation treatment

Avoid:

- Generic blue SaaS styling
- AI-generated emotional characters
- Oversized empty carousel sections
- Large pale feature-card galleries
- Decorative glows
- Background grids
- Browser traffic-light dots
- Floating decorative pills
- Heavy shadows
- Hover-lift effects
- Excessive orange accents
- Unsupported statistics
- Huge footer layouts

## Typography

- Keep the hero headline large but controlled.
- Avoid extreme negative tracking.
- Avoid oversized text in every section.
- Use display type only for important customer outcomes.
- Keep supporting text readable.
- Maintain deliberate line lengths.
- Limit uppercase labels and eyebrow text.
- Do not require a kicker above every heading.
- Preserve one clear `h1`.
- Maintain semantic heading order.

## Spacing system

Do not use the same large spacing utility on every section.

### Major sections

Use for the hero, primary problem, and main workflow demonstration.

- Mobile: approximately 64-80px total vertical spacing
- Desktop: approximately 80-96px total vertical spacing

### Standard sections

Use for websites and videos, differentiators, outcomes, and honest fit.

- Mobile: approximately 48-64px total vertical spacing
- Desktop: approximately 56-72px total vertical spacing

### Compact sections

Use for credibility, supporting proof, CTA, and footer.

- Mobile: approximately 32-48px total vertical spacing
- Desktop: approximately 40-56px total vertical spacing

Implement the spacing scale through shared semantic utilities or component variants, not scattered arbitrary values.

## Files to review

At minimum, inspect and update as needed:

- `src/app/(public)/page.tsx`
- `src/components/review-preview.tsx`
- `src/components/section-intro.tsx`
- `src/components/site-cta.tsx`
- `src/components/site-footer.tsx`
- `src/components/site-header.tsx`
- `src/app/globals.css`

Create reusable components where appropriate, such as:

- Credibility strip
- Before-and-after workflow
- Narrative workflow step
- Product demonstration
- Customer proof
- Differentiator row
- Honest fit section

Do not create abstractions unless they represent a genuinely repeated product pattern.

## Content constraints

- Do not invent testimonials.
- Do not invent company logos.
- Do not invent customer counts.
- Do not invent performance metrics.
- Do not claim time savings without evidence.
- Preserve existing public copy where it supports the new story.
- Rewrite only what is necessary to make the narrative concrete.
- Use plain, professional language.
- Avoid technical terminology in client-facing copy.
- Avoid jokes that weaken professional credibility.
- When proof is unavailable, use visible product behavior instead of unsupported marketing language.

## Accessibility requirements

Meet WCAG 2.2 AA.

Verify:

- One descriptive `h1`
- Semantic heading order
- Visible keyboard focus
- Logical focus order
- At least 44x44px touch targets where required
- Keyboard-accessible navigation
- Keyboard-accessible tabs or workflow controls
- Screen-reader-accessible product demonstrations
- No information communicated through color alone
- Sufficient foreground and background contrast
- Reduced-motion support
- No required animation
- No horizontal scrolling at 200% zoom

If the walkthrough changes while scrolling, provide an equivalent linear experience for keyboard and screen-reader users.

## Responsive requirements

Verify at:

- 320px
- 375px
- 768px
- 1024px
- 1440px
- 200% browser zoom

Check:

- Hero hierarchy
- Product-preview readability
- Before-and-after stacking
- Workflow order
- Tab or paired-content usability
- Section spacing
- Header crowding
- CTA height
- Footer height
- Button and link touch targets
- Heading wrapping
- Horizontal overflow
- Light and dark themes

## Implementation constraints

- Read the relevant Next.js 16 documentation before modifying framework code.
- Use the existing Tailwind CSS design-token system.
- Use shadcn/ui components when they meet the interaction need.
- Do not introduce unexplained literal colors, spacing values, shadows, or radii.
- Preserve existing routes.
- Preserve metadata and structured data unless visible page-content changes require an update.
- Preserve authentication behavior.
- Preserve unrelated work in the dirty worktree.
- Respect reduced-motion preferences.
- Do not add dependencies unless necessary.
- Do not copy proprietary Pastel assets, copy, or layouts.

## Acceptance criteria

- The homepage leads with a clear customer outcome rather than a vague brand phrase.
- The hero contains meaningful product proof.
- The page includes factual credibility or an honest product-proof alternative.
- The homepage presents a recognizable fragmented-feedback problem.
- The page clearly contrasts that problem with the Passoff workflow.
- One connected project moves through sharing, feedback, another look, and approval.
- Website and video review are presented as one shared client-review model.
- Passoff's differentiators are explicit.
- Important claims are supported by real evidence or visible product behavior.
- The page includes an honest fit section.
- The final CTA is concise.
- The footer is compact.
- The homepage no longer reads like a list of disconnected capabilities.
- The design remains restrained and professional.
- No fictional testimonials, logos, or metrics are introduced.
- The page works at all required responsive widths.
- The page is usable with keyboard-only navigation.
- Light and dark themes are reviewed.
- Lint passes.
- Type checking passes.
- Relevant tests pass.
- The production build passes.

## Expected result

The final homepage should combine Pastel's persuasive narrative structure with Passoff's more professional visual character.

It should guide the visitor through:

```text
Recognize the problem
-> understand the cost
-> see how Passoff works
-> understand why it is different
-> believe the evidence
-> feel confident trying it
```

The result must not look like Pastel. It should feel like a more restrained, focused, and credible alternative with a story strong enough to compete.
