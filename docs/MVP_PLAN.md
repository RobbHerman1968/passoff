# Passoff MVP product plan

Status: Superseded for the active product model. Keep for historical planning context.  
Last updated: October 4, 2026

The live product model uses **workspaces** (not teams), **website environments and deployments**, **issues** (not persisted feedback items), and **video as issue evidence** (not a standalone review type). Review rounds are not a current product concept. Approvals belong to a recorded deployment or version.

Current published prices remain:

- Free
- Studio at $29 per month when billed annually ($348 yearly) and $35 billed monthly
- Agency at $89 per month when billed annually ($1,068 yearly) and $109 billed monthly
- 14-day Agency trial, no card required
- Unlimited free guest reviewers

Current published plan limits:

- Studio: 3 workspace members, 5 active review websites
- Agency: 6 workspace members, unlimited active review websites
- Agency video-evidence pilot: 3-minute / 250 MB / 1080p clips, 1 hour of new video per calendar month, 2 hours retained, 10 playback hours per calendar month, 30-day retention, no automatic overage billing, higher allowances only with explicit owner approval
- Free and Studio video-evidence allowances are undecided and must not be published until a separate product decision

Unlimited active review websites does not mean unlimited infrastructure usage. Pooled workspace allowances (video processing/storage/playback, tracked pageviews, telemetry, AI analyses, browser verification jobs, proxy sessions and bandwidth) stay unpublished until each has an approved value and enforcement behavior.

Do not treat later sections of this document as the current source of truth for pricing, team naming, video reviews, or review rounds.

## 1. Product summary

Passoff helps clients, designers, and developers review real websites and uploaded videos without losing feedback in email, chat, screenshots, or meetings.

The core promise is:

> Open the real work, point to what needs attention, and pass clear feedback to the person who can fix it.

Passoff will compete with Pastel, but it will not copy Pastel's proxy model. A small JavaScript embed will add review tools directly to a website the customer controls. Uploaded videos will be reviewed on a Passoff-hosted page.

This creates four primary advantages:

1. The reviewer sees the real website rather than a proxied copy.
2. Logged-in, staged, dynamic, and session-specific experiences can be reviewed.
3. Website feedback can include the page element and technical context needed to reproduce a problem.
4. Website and video feedback use the same simple review, discussion, and approval workflow.

## 2. MVP outcome

The MVP succeeds when an agency or product team can:

1. Create a project.
2. Install Passoff on a website or upload a video.
3. Send a review link to someone unfamiliar with Passoff.
4. Receive clear feedback without training the reviewer.
5. Discuss, assign, organize, and resolve that feedback.
6. Ask for another review or record approval.
7. Hand remaining work to a developer without rewriting every comment.

The MVP is not complete merely because these capabilities exist. The full path must be understandable, responsive, accessible, reliable, and pleasant to use.

## 3. Intended customers

### Primary customer

Small and midsize web agencies that need client approval for websites and marketing videos.

### Secondary customer

Product and marketing teams reviewing logged-in web applications, staging environments, campaigns, and video content.

### Main users

- **Project owner:** Creates projects, invites teammates, opens review rounds, and requests approval.
- **Contributor:** Designs, develops, or produces the work and responds to feedback.
- **Reviewer:** A client or stakeholder who opens a shared link and leaves feedback without creating an account.

## 4. Product principles

### Review the real work

Website feedback appears on the customer's real website. Passoff must not create a proxy or visually altered copy.

### Make the next action obvious

Each screen and state must answer:

- Where am I?
- What is happening?
- What should I do next?
- Did my last action work?

### Ask guests for as little as possible

A guest should only need a name and email address before leaving feedback. No guest account, extension, password creation, or product tour should be required.

### Capture context automatically

Reviewers should describe the desired change, not diagnose the environment. Passoff captures the location, page, browser, viewport, time, and available technical context.

### Keep technical details out of the reviewer's way

Developer context is available to the team but does not clutter the client experience.

### Design for recovery

Uploads fail, networks disconnect, pages change, permissions expire, and elements move. The interface must preserve work and explain the next step.

## 5. Required build rules

The repository-level rules in [`AGENTS.md`](../AGENTS.md) are mandatory. The following requirements are release criteria:

- Use Tailwind CSS for styling.
- Install and configure shadcn/ui before building product screens.
- Use shadcn/ui whenever an existing component fits the interaction need.
- Meet WCAG 2.2 AA, including color contrast.
- Support mobile, tablet, laptop, and large desktop layouts.
- Support keyboard, mouse, touch, and screen-reader interaction.
- Use plain, user-friendly wording and avoid technical language in the reviewer experience.
- Include useful loading, empty, success, error, offline, and retry states.
- Test the critical workflows at 320, 375, 768, 1024, and 1440 CSS pixels and at 200% zoom.

## 6. Terminology and writing

Use these terms consistently in the product:

| Use | Do not use in customer-facing copy |
| --- | --- |
| Project | Workspace entity, container |
| Review | Canvas, artifact instance |
| Website | URL asset, web surface |
| Video | Media asset |
| Feedback | Annotation payload |
| Comment | Thread root |
| Reply | Child record |
| Review round | Revision cycle object |
| Share review | Generate guest session |
| Mark as resolved | Transition status |
| Ask for approval | Initiate approval workflow |
| We couldn't load this | Fetch or processing error |

Copy guidelines:

- Prefer familiar words and short sentences.
- Give buttons specific outcome-based labels.
- Explain what happened before suggesting a fix.
- Avoid blaming the user.
- Do not show implementation details unless a team member deliberately opens developer information.

Example:

- Avoid: “Asset transcoding failed with status 422.”
- Use: “We couldn't prepare this video. Try uploading it again, or choose an MP4, MOV, or WebM file.”

## 7. MVP scope

### 7.1 Accounts and teams

Required:

- Sign up, sign in, sign out, and reset access.
- Create one team during onboarding.
- Invite and remove team members.
- Roles: owner and member.
- View and update a basic profile.
- Delete an account or team through a clearly explained confirmation flow.

Acceptance criteria:

- Guests never need an account.
- Authentication errors preserve entered information where safe.
- Invitation links explain who invited the person and which team they are joining.
- Permission errors explain what the person can do next.

### 7.2 Projects and reviews

Required:

- Create, rename, archive, restore, and delete a project.
- Add a website or video review to a project.
- Search and filter projects and reviews.
- Show review type, current round, status, unresolved feedback count, last activity, and owner.
- Archive completed work without losing its history.

Required statuses:

- Draft
- Internal review
- Client review open
- Changes in progress
- Ready for another look
- Approved
- Closed

The status must be written visibly. Color may reinforce it but may not be the only cue.

### 7.3 Review rounds

Required:

- Open a review round for the team or a client.
- Set an optional feedback deadline.
- Pause or close guest feedback.
- Ask reviewers for another look after changes are ready.
- Preserve earlier feedback and decisions.
- Clearly show whether feedback is currently accepted.

When a review is closed, show who closed it, when it closed, and what happens next.

### 7.4 Sharing and guest access

Required:

- Generate a revocable guest review link.
- Optionally require a simple review password.
- Ask a first-time guest for name and email.
- Remember the guest for the current review on that device.
- Let the owner revoke a link and create a replacement.
- Let a guest unsubscribe from nonessential notifications.

Security requirements:

- Use short-lived, scoped review sessions after a guest link is opened.
- Do not place reusable secrets in public JavaScript configuration.
- Restrict each session to its intended team, project, review, and permissions.
- Rate-limit guest actions and protect public forms from automated abuse.

### 7.5 Website embed

Required installation options:

1. A plain asynchronous script tag that works on standard websites and site builders.
2. An npm package for framework-based applications. This may wrap the same core SDK rather than becoming a separate implementation.

Required behavior:

- The embed is dormant unless a valid review session is active.
- The review interface is visually isolated from the host page, preferably with Shadow DOM.
- The embed does not alter the host page's normal layout.
- Internal navigation retains the active review session.
- Traditional page loads, History API navigation, hash navigation, and common single-page application route changes are detected.
- A customer-configurable kill switch can disable the embed.
- Embed failures never prevent the host website from operating.
- The host can configure allowed environments and origins.

Performance requirements:

- Load asynchronously.
- Lazy-load nonessential review interface code.
- Avoid continuous full-document scans.
- Batch DOM observation work.
- Publish a size budget before SDK implementation begins.
- Measure initialization time, interaction delay, memory use, and effect on Core Web Vitals.
- Treat a material regression to the host experience as a release blocker.

### 7.6 Website review experience

Required:

- Switch between **Browse** and **Add feedback** modes.
- Click or keyboard-select a page element to leave feedback.
- Display numbered markers and a feedback panel.
- Allow feedback about the whole page when no single element applies.
- Keep unfinished text if the panel closes accidentally or the network briefly fails.
- Allow replies, attachments, mentions, labels, assignments, and private team replies.
- Mark feedback as open, in progress, ready for review, resolved, or not planned.
- Filter feedback by status, person, label, assignee, page, and current round.
- Search feedback text.
- Show unread activity.

Every website comment must attempt to capture:

- Page URL and route
- Page title
- Selected element and nearby visible text
- Stable element identifier when available
- DOM ancestry fingerprint
- CSS selector
- Normalized position inside the element
- Document position as a fallback
- Element bounds
- Viewport width and height
- Browser and operating system
- Device-pixel ratio
- Current application build identifier when provided by the host
- Time created
- Screenshot or a clearly stated reason it is unavailable

Team-only developer information may additionally include:

- A limited HTML excerpt
- Selected computed styles
- Recent console errors
- Failed network request summaries
- A host-provided user or session reference

Sensitive information must be removed before developer information leaves the browser. Never collect passwords, cookies, authorization headers, payment details, form values marked as sensitive, or full request and response bodies by default.

### 7.7 Pin recovery

Website elements change during implementation. Passoff must not silently misplace feedback.

When reopening a comment, Passoff attempts to match its original element and reports one of these states:

- Exact match
- Likely match after the page changed
- Original element not found

The original screenshot and captured context remain available even when the element cannot be found.

### 7.8 Screenshot behavior

A JavaScript embed cannot guarantee a pixel-perfect browser screenshot because cross-origin images, videos, canvases, and frames may be protected by browser security rules.

MVP behavior:

1. Always save the nonvisual context needed to locate the feedback.
2. Attempt a browser-side screenshot when the page allows it.
3. For a publicly reachable page, optionally request a server-side capture.
4. If automatic capture fails, allow the reviewer to attach an image.
5. Never block feedback submission because a screenshot failed.
6. Label how the image was obtained so team members understand its limitations.

### 7.9 Video upload and processing

Video review is part of the MVP.

The approved implementation direction is Mux Video for customer video upload,
processing, storage, secured playback, thumbnails, and delivery. Follow
[`VIDEO_PLATFORM_DIRECTION.md`](./VIDEO_PLATFORM_DIRECTION.md) when building
this workflow. `next-video` may be used as a presentation-layer player wrapper,
but it must not own uploads, authorization, tenant metadata, provider state, or
retention policy.

Required:

- Upload MP4, MOV, and WebM files.
- Upload directly from the browser to Mux with visible progress.
- Resume or safely retry interrupted uploads where the storage provider permits it.
- Validate file type, size, and duration before or during upload.
- Show understandable states: Uploading, Preparing, Ready, and Needs attention.
- Process videos asynchronously.
- Produce a broadly playable review version.
- Generate poster images and comment thumbnails.
- Preserve the Mux high-quality master according to the team's storage policy.
- Notify the owner when processing completes or fails.

Initial limits must be displayed before upload. Limits should be configurable rather than embedded in interface copy.

### 7.10 Video review experience

Required:

- Play, pause, seek, mute, change volume, change playback speed, loop, and use full screen.
- Provide accessible keyboard controls and visible control labels.
- Click or keyboard-activate the video to add feedback at the current time.
- Pause automatically when feedback entry begins.
- Attach the comment to both a timestamp and a normalized position in the video frame.
- Show markers on the timeline.
- Jump to the correct moment and location when a comment is selected.
- Create a frame thumbnail for each positional comment.
- Allow a comment about a time without requiring a position.
- Reuse website-review replies, statuses, labels, assignments, private replies, filtering, and approval.
- Work comfortably on touch screens without requiring hover.

MVP video comments are point-in-time comments. Time ranges, transcripts, drawing tools, and frame-accurate professional timecode are post-MVP.

### 7.11 Feedback workflow

Required statuses:

- Open
- In progress
- Ready for review
- Resolved
- Not planned

Required actions:

- Reply publicly.
- Reply privately to team members.
- Mention a person.
- Assign a team member.
- Add one or more labels.
- Attach a file.
- Change status.
- Reopen resolved feedback.
- Copy a developer-ready summary as Markdown.
- View an activity history of important changes.

Use optimistic updates only when failure can be reversed safely and clearly.

### 7.12 Approval

Required:

- The owner can ask named reviewers for approval.
- A reviewer can approve or request changes.
- Approval records the person, review round, time, and optional note.
- New feedback after approval clearly indicates that the approval may no longer represent the current state.
- The project history shows approvals and later changes.

Do not use vague wording such as “Finish.” Use **Approve this review** and **Request changes**.

### 7.13 Notifications

Required email notifications:

- New feedback
- Reply or mention
- Assignment
- Review requested
- Deadline reminder
- Review approved or changes requested
- Video ready or processing failed

Required controls:

- Immediate or digest delivery for routine activity
- Per-project mute
- Guest unsubscribe
- No notification to the person who caused the event

Email links must open the exact comment or review moment when access is still valid.

### 7.14 Export and handoff

Required:

- Copy one comment as Markdown.
- Copy or download all filtered feedback as Markdown or CSV.
- Include the visible request, status, assignee, page or timestamp, environment context, screenshot link, and direct Passoff link.
- Provide a signed generic webhook for teams that want automated handoff.

Direct GitHub, Linear, Jira, ClickUp, and Asana integrations are immediate post-MVP unless implementation capacity permits GitHub or Linear without delaying launch quality.

### 7.15 Billing and limits

Required:

- Free and paid plans.
- Unlimited guest reviewers on every plan.
- Guests never consume paid team seats.
- Limits are based on understandable concepts such as active projects, team members, and video storage.
- Warn before a limit blocks work.
- Provide a clear path to archive work, remove stored video, or change plan.
- Show current usage without making the user calculate it.

Avoid making essential export or security capabilities available only on an expensive team tier.

## 8. Accessibility and inclusive interaction

WCAG 2.2 AA is the minimum, not a stretch goal.

### Contrast

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Focus indicators, meaningful icons, input boundaries, selected markers, and other important nontext elements: at least 3:1 against adjacent colors.
- Verify all interactive states, including hover, pressed, selected, disabled, error, and focus.
- Verify both light and dark themes if dark theme is shipped.

### Keyboard and screen readers

- All product actions are available without a pointer.
- Comment markers participate in a sensible focus order.
- Selecting a marker announces its number, author, status, and a short comment preview.
- Browse and Add feedback modes are announced when changed.
- New comments and processing updates use appropriate, noninterruptive live announcements.
- Dialogs trap focus correctly, restore it on close, and have an accessible name.
- The video player exposes standard control names, values, and keyboard behavior.
- A non-drag alternative exists for every drag interaction.

### Zoom, reflow, and touch

- Core tasks work at 200% browser zoom.
- Page content reflows without two-dimensional scrolling, except where the reviewed website or video itself necessarily creates a visual canvas.
- Touch targets are at least 44 by 44 CSS pixels except for adequately spaced inline text links.
- No action relies only on hover.

### Motion and timing

- Respect `prefers-reduced-motion`.
- Do not use countdowns or auto-dismiss essential information.
- Deadlines describe calendar time and timezone clearly.

## 9. Responsive experience

### Small screens

- Use a bottom sheet or full-screen panel for feedback rather than permanently shrinking the reviewed content.
- Keep Browse/Add feedback mode, unresolved count, and close action reachable.
- Avoid overlapping the customer's site navigation whenever possible.
- Let the reviewer collapse all Passoff controls.
- Video controls and timeline markers must remain usable by touch.

### Medium screens

- Allow the feedback panel to appear as a sheet or side panel based on available width.
- Preserve sufficient reviewed-content width while a thread is open.

### Large screens

- A side panel may remain open, but it should overlay by default rather than changing the reviewed website's viewport.
- Let the reviewer resize or collapse the panel.

The SDK must distinguish the host page's responsive breakpoint from Passoff's interface layout. Opening Passoff must not cause the host site to cross into a different breakpoint unexpectedly.

## 10. Design system plan

### Foundation milestone

Before product screens are implemented:

1. Confirm the installed Tailwind version and supported configuration for the repository's installed Next.js version.
2. Install shadcn/ui using its current documented setup for that Tailwind and Next.js combination.
3. Define semantic tokens for background, foreground, muted text, borders, primary action, danger, warning, success, focus, and feedback statuses.
4. Verify every token pair for WCAG AA contrast.
5. Create shared typography, spacing, radius, elevation, and motion rules.
6. Add automated accessibility checks where practical.

### Expected shadcn/ui usage

Use appropriate shadcn components for:

- Buttons and button groups
- Forms, labels, validation, and inputs
- Dialogs and confirmation dialogs
- Drawers or sheets on small screens
- Popovers and menus
- Tabs where the content truly represents peer views
- Tables and filters
- Tooltips for supplemental information only
- Toasts for noncritical acknowledgements
- Progress indicators
- Skeletons
- Badges
- Avatars
- Command or search interfaces

Do not choose a component merely because it exists. The interaction still needs to fit the user's task and remain understandable.

## 11. Technical shape

This section sets boundaries without prematurely selecting every vendor.

### Main applications

- **Web application:** Account, projects, review management, video review, billing, and administration.
- **Website SDK:** Installed on customer-controlled websites and activated by a valid review session.
- **Background workers:** Video preparation, image generation, email, cleanup, and retryable webhook delivery.

### Required platform capabilities

- Relational database for teams, projects, reviews, rounds, identities, feedback, approvals, and activity.
- Object storage for uploads, video outputs, screenshots, thumbnails, and attachments.
- Background job system with retries and visible failure state.
- Real-time or near-real-time comment updates.
- Transactional email.
- Billing provider.
- Error monitoring, structured logs, metrics, and audit history.

### Core entities

- User
- Team
- Team membership
- Project
- Review
- Website installation
- Video asset
- Review round
- Guest identity
- Review session
- Feedback
- Reply
- Attachment
- Label
- Assignment
- Approval
- Notification preference
- Webhook endpoint and delivery
- Activity event
- Subscription and usage record

Website and video feedback share the same workflow entity. Their anchors differ:

- Website anchor: page, element fingerprint, coordinates, and viewport.
- Video anchor: video version, timestamp, and normalized frame coordinates.

## 12. Privacy and security

Required before public launch:

- Validate allowed installation origins.
- Prevent server-side request forgery in any server capture feature.
- Use scoped, expiring guest sessions.
- Encrypt data in transit and use managed encryption at rest.
- Store no host-site passwords, cookies, or authorization headers.
- Redact sensitive console and network information in the browser before sending it.
- Let hosts mark selectors and fields as private.
- Provide configurable capture controls for screenshots, console errors, and network failures.
- Scan or isolate uploaded attachments appropriately.
- Verify upload type using content, not only the filename.
- Sign object-storage access and expire private links.
- Verify webhook signatures and retry safely.
- Record security-relevant activity.
- Support deletion and reasonable retention controls.
- Publish an understandable privacy explanation for site owners and reviewers.

## 13. Reliability and recovery

Required:

- Save comment drafts locally while the editor is open.
- Retry safe network operations with backoff.
- Show offline state and send queued feedback when the connection returns, after confirming it is still valid.
- Make uploads resumable or safely restartable.
- Make background jobs idempotent.
- Preserve the original feedback record even when a target element disappears.
- Let administrators disable a faulty embed immediately.
- Provide a status page before broad paid adoption.

## 14. Measurement

Collect product metrics that answer whether Passoff saves work rather than merely generating activity.

Required events:

- Team created
- Project created
- Website installed and verified
- Video upload started, completed, failed, and ready
- Review shared
- Guest opened review
- Guest left first feedback
- Feedback replied to, assigned, resolved, and reopened
- Review approved or changes requested
- Export or webhook completed
- Review completed

Core measures:

- Time from signup to first shared review
- Share-link open rate
- Percentage of guests who leave feedback
- Time from first feedback to resolution
- Percentage of reviews reaching approval
- Website SDK error rate and performance impact
- Screenshot success rate
- Video upload and processing success rate
- Number of support contacts needed per first review

Do not collect reviewed-site content for analytics.

## 15. Delivery plan

### Milestone 0: Foundation and risk tests

- Install and configure shadcn/ui with Tailwind.
- Create accessible semantic design tokens.
- Establish responsive shells and test tooling.
- Prove that an isolated SDK can select DOM elements without breaking a host page.
- Prove route tracking across traditional and common single-page applications.
- Test screenshot limits on representative sites.
- Prove direct video upload and asynchronous processing.
- Define SDK performance and upload limits.

Exit criteria:

- The two riskiest paths—real-site annotation and video preparation—work in a thin end-to-end prototype.
- The initial component system passes contrast and keyboard checks.

### Milestone 1: Accounts, projects, and sharing

- Authentication and teams
- Projects and reviews
- Review rounds and statuses
- Guest links and identity
- Base dashboard and responsive navigation

Exit criteria:

- An owner can create and share an empty website or video review.
- A guest can enter without creating an account.

### Milestone 2: Website feedback

- Script installation and verification
- Browse/Add feedback modes
- Element anchoring and recovery
- Feedback panel, markers, replies, and statuses
- Environment and developer context
- Screenshot fallback behavior
- Real-time updates and notifications

Exit criteria:

- A new reviewer can leave useful feedback on desktop and mobile without instruction.
- Feedback survives representative page changes or clearly reports that its original element is gone.

### Milestone 3: Video feedback

- Upload and processing
- Accessible player
- Timestamped positional feedback
- Timeline markers and thumbnails
- Shared feedback workflow

Exit criteria:

- A guest can review, discuss, and approve a supported video on desktop and mobile.
- Failed upload or processing states preserve context and offer recovery.

### Milestone 4: Completion workflow

- Assignments, labels, filters, private replies, and activity history
- Approval and changes requested
- Deadlines and reminders
- Markdown, CSV, and webhook handoff
- Notification controls

Exit criteria:

- A team can complete a review round without moving the source of truth into email or a spreadsheet.

### Milestone 5: Billing and launch hardening

- Plans, trials, limits, usage, and billing states
- Security review
- Accessibility audit
- Responsive and browser matrix
- Performance testing
- Data retention and deletion
- Monitoring, operational runbooks, and support documentation

Exit criteria:

- All launch gates in the next section pass.

## 16. Launch gates

Passoff may launch publicly only when:

- The primary website and video workflows pass at supported responsive sizes.
- Critical workflows are usable with keyboard only.
- Screen-reader testing covers onboarding, sharing, commenting, video controls, status changes, and approval.
- All shipped color pairs pass WCAG 2.2 AA contrast.
- No known critical or high-severity security issue remains.
- The SDK does not cause a material performance regression on the test suite of host websites.
- Embed errors cannot break the host site.
- Guest access can be revoked immediately.
- Sensitive data redaction has adversarial tests.
- Video upload, processing, retry, and deletion work reliably.
- Billing failures do not delete or unexpectedly expose customer work.
- User-facing errors explain what happened and provide a next step.
- Support can diagnose failed installs and uploads without requesting sensitive customer data.
- Lint, type checks, tests, and production build pass.

## 17. Explicitly outside the MVP

- Proxying arbitrary websites
- Browser extension
- PDF, presentation, image, or HTML email review
- Freehand website drawing
- Video time-range comments
- Video transcription
- Professional SMPTE timecode
- Side-by-side video comparison
- Automatic comment carry-forward between video versions
- Native GitHub, Linear, Jira, ClickUp, or Asana integration unless it fits without delaying launch quality
- AI summaries, duplicate detection, or automated fixes
- MCP server
- Public API beyond the signed outbound webhook
- Single sign-on and enterprise directory provisioning
- White labeling and custom domains
- Native mobile applications

## 18. Immediate post-MVP priorities

Prioritize using actual launch evidence, with this expected order:

1. GitHub and Linear integration
2. Website console and network diagnostics expanded safely
3. Review version comparison
4. Video drawing and time ranges
5. Video transcript and transcript-linked feedback
6. Image and PDF review
7. AI-assisted feedback summaries and duplicate grouping
8. MCP server for coding agents

## 19. Main risks

| Risk | Response |
| --- | --- |
| The SDK slows or breaks customer sites | Dormant-by-default architecture, isolation, size budget, host test suite, and kill switch |
| Website changes detach comments | Multiple anchor signals, explicit match confidence, and preserved screenshots/context |
| Screenshot capture is incomplete | Never block feedback; use layered capture and attachment fallbacks |
| Technical capture exposes private data | Browser-side redaction, capture controls, strict defaults, and adversarial testing |
| Video processing becomes expensive | Display limits, configurable storage policy, lifecycle cleanup, and measured plan allowances |
| Guests still return to email | Near-zero-friction entry, short contextual guidance, useful notifications, and email reply support when feasible |
| Passoff becomes another inbox | Markdown/CSV/webhook handoff in MVP; native developer integrations immediately after |
| Feature breadth delays quality | Enforce the explicit non-goals and launch gates in this plan |

## 20. Decisions still required

These choices should be made during Milestone 0 and recorded in this document:

- Authentication provider
- Database and hosting platform
- Object storage provider for non-video assets
- Background job system
- Real-time delivery mechanism
- Transactional email provider: Resend (configured through `EMAIL_TRANSPORT=resend`)
- Billing provider
- Enforcement details for the approved Free, Studio, and Agency plan limits
- Supported browser matrix for the application and SDK
- Initial SDK size and performance budgets (proposed in [`docs/WEBSITE_SDK_PROTOTYPE.md`](./WEBSITE_SDK_PROTOTYPE.md); treat as passing only when measured)
- Screenshot provider for publicly reachable pages
- Data retention defaults

No vendor decision may weaken the accessibility, privacy, responsive behavior, or recovery requirements in this plan.

## 21. Research basis

This plan responds to observed limitations and requests in the visual-feedback market:

- Pastel documents proxy rendering and screenshot failures that can require an extension: <https://help.usepastel.com/en/articles/8168731-pastel-chrome-extension>
- Protected environments may require IP allowlisting: <https://help.usepastel.com/en/articles/5986535-whitelisting-pastel-s-ips>
- User reviews mention occasional bugs, client confusion, limited features, and price sensitivity: <https://www.g2.com/products/pastel/reviews>
- Practitioner feedback mentions imprecise markers, visual differences, slowness, and a sidebar that changes the reviewed width: <https://makeway.is/streamline-communication-with-these-feedback-tools/>
- Current Pastel plan limits and integration tiers: <https://usepastel.com/plans>
- Pastel's video review behavior and storage limits: <https://help.usepastel.com/en/articles/12084757-review-videos-in-pastel>
- Pastel's current browser and screen-size metadata behavior: <https://help.usepastel.com/en/articles/6443110-basics-of-commenting-in-a-pastel-canvas>
- Browser restrictions on capturing cross-origin visual content: <https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image>
- Broad browser compatibility guidance for H.264/AAC video: <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs>
- WCAG 2.2: <https://www.w3.org/TR/WCAG22/>

The research indicates that Passoff should win on authentic rendering, reliable element anchoring, developer-ready context, accessible guest review, transparent pricing, and smooth handoff—not by matching every media format at launch.
