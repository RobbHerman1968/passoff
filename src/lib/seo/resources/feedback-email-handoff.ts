import type { ResourcePageContent } from "@/lib/seo/types";

export const designFeedbackChecklist: ResourcePageContent = {
  id: "design-feedback-checklist",
  path: "/resources/design-feedback-checklist",
  primaryIntent: "actionable design feedback",
  title: "Design Feedback Checklist for Clients | Pass-Off",
  description:
    "Help clients give actionable visual design feedback—with examples of useful comments versus unhelpful ones.",
  h1: "Design feedback checklist for clients",
  lead:
    "Share this page with stakeholders before a review. Better comments mean fewer rounds and fewer misunderstood “preferences.”",
  publishedAt: "2026-09-06",
  updatedAt: "2026-09-06",
  author: { name: "Pass-Off Editorial", role: "Product team" },
  commercialLink: {
    href: "/client-approval-software",
    label: "Client approval software",
  },
  relatedResources: [
    {
      href: "/resources/design-approval-checklist",
      label: "Design approval checklist",
    },
    {
      href: "/resources/design-approval-email-template",
      label: "Design approval email templates",
    },
  ],
  passOffBridge: {
    heading: "How Pass-Off makes feedback actionable",
    body: "Clients leave visual comments on a published revision inside the review link. Notes stay attached to that revision, so designers can resolve threads without hunting through email. When feedback requires new work, publish a fresh revision instead of editing under an old approval.",
  },
  sections: [
    {
      id: "before-you-comment",
      title: "Before you leave feedback",
      kind: "checklist",
      items: [
        {
          label: "Confirm which revision you are reviewing",
          detail: "Match the revision number in the room to the email you received.",
        },
        {
          label: "Review all included screens",
          detail: "Check desktop and mobile (or other states) before requesting big directional changes.",
        },
        {
          label: "Separate must-fix from preference",
          detail: "Call out brand, legal, or functional blockers differently from taste notes.",
        },
      ],
    },
    {
      id: "examples",
      title: "Useful vs unhelpful comments",
      kind: "examples",
      intro: "Point at the thing, describe the problem, and suggest a measurable outcome when you can.",
      useful: [
        {
          title: "Specific layout note",
          example:
            "On mobile homepage, the primary CTA sits below the fold on an iPhone 13-sized screen. Can we keep it visible without scrolling?",
        },
        {
          title: "Content constraint",
          example:
            "Legal requires the disclaimer to remain adjacent to the pricing figure. Current desktop layout separates them by a full section.",
        },
        {
          title: "Brand rule",
          example:
            "Our secondary purple (#5B4CC4) should not appear as body text per brand guidelines—can we switch that paragraph to charcoal?",
        },
      ],
      unhelpful: [
        {
          title: "Vague vibe check",
          example: "Make it pop more. Not feeling it.",
        },
        {
          title: "Unscoped redesign ask",
          example: "Can we rethink the whole site? Also change the fonts maybe.",
        },
        {
          title: "Missing location",
          example: "The button is wrong. Fix it.",
        },
      ],
    },
    {
      id: "comment-pattern",
      title: "Comment pattern to copy",
      kind: "template",
      copyLabel: "Copy Comment Pattern",
      body: `[Screen / breakpoint]: [what I see]
Problem: [why it matters — brand, usability, content, legal]
Request: [specific change or question]
Priority: [blocker | important | preference]`,
    },
    {
      id: "when-to-approve",
      title: "When to stop commenting and approve",
      kind: "prose",
      paragraphs: [
        "If remaining notes are preferences that will not change the build decision, either approve with deferred notes in writing or request a small follow-up revision. Do not leave a half-approved state where producers assume silence means yes.",
        "If something is a blocker, choose “changes requested” and list the blockers first. Designers should not have to infer severity from tone.",
      ],
    },
  ],
  keywords: [
    "design feedback checklist",
    "actionable design feedback",
    "client design comments",
  ],
};

export const designApprovalEmailTemplate: ResourcePageContent = {
  id: "design-approval-email-template",
  path: "/resources/design-approval-email-template",
  primaryIntent: "design approval email template",
  title: "Design Approval Email Templates | Pass-Off",
  description:
    "Editable email templates for initial design review, reminders, changes requested, approval confirmation, and final handoff.",
  h1: "Design approval email templates",
  lead:
    "Copy, fill the brackets, and send. Each template assumes you have a single review link for the current published revision.",
  publishedAt: "2026-09-06",
  updatedAt: "2026-09-06",
  author: { name: "Pass-Off Editorial", role: "Product team" },
  commercialLink: {
    href: "/approval-workflow-for-agencies",
    label: "Agency approval workflow",
  },
  relatedResources: [
    {
      href: "/resources/client-sign-off-template",
      label: "Client sign-off template",
    },
    {
      href: "/resources/website-handoff-checklist",
      label: "Website handoff checklist",
    },
  ],
  passOffBridge: {
    heading: "Keep the link consistent across emails",
    body: "Whether you are nudging a review or confirming approval, point clients at the same Pass-Off review link. The room shows the current published revision, feedback, approval state, and—once you release it—handoff.",
  },
  sections: [
    {
      id: "initial",
      title: "1. Initial review request",
      kind: "template",
      copyLabel: "Copy Initial Review Email",
      body: `Subject: Design review ready — [Project] Revision [N]

Hi [Name],

Revision [N] of [Project] is ready for your review.

What we need from you:
- Review the included screens: [list]
- Leave comments on anything that should change
- Approve if this revision is ready for [next step]

Review link: [URL]
Please respond by [date].

Thanks,
[You]`,
    },
    {
      id: "reminder",
      title: "2. Reminder",
      kind: "template",
      copyLabel: "Copy Reminder Email",
      body: `Subject: Reminder: design approval due [date] — [Project]

Hi [Name],

Friendly reminder that Revision [N] of [Project] is waiting on your review.

Review link: [URL]
Due: [date]

If you need more time or another stakeholder included, just reply and we will adjust.

Thanks,
[You]`,
    },
    {
      id: "changes",
      title: "3. Changes requested (designer → client acknowledgment)",
      kind: "template",
      copyLabel: "Copy Changes-Requested Email",
      body: `Subject: Received your feedback — next revision for [Project]

Hi [Name],

Thanks for the notes on Revision [N]. We are treating these as changes requested and will publish Revision [N+1] with:

- [change 1]
- [change 2]
- [change 3]

We will send an updated review link when Revision [N+1] is published. Open comments on Revision [N] remain available for reference.

Thanks,
[You]`,
    },
    {
      id: "confirmation",
      title: "4. Approval confirmation",
      kind: "template",
      copyLabel: "Copy Approval Confirmation Email",
      body: `Subject: Confirmed: [Project] Revision [N] approved

Hi [Name],

Confirming that Revision [N] of [Project] was approved on [date].

Approved scope: [list]
Next step: [development / production / handoff release]

The approval record remains available in the review room: [URL]

Thanks,
[You]`,
    },
    {
      id: "handoff",
      title: "5. Final handoff",
      kind: "template",
      copyLabel: "Copy Handoff Email",
      body: `Subject: Handoff ready — [Project] (approved Revision [N])

Hi [Name],

Handoff for approved Revision [N] is now available from the same review link:

[URL]

Included:
- [asset / file / credential item 1]
- [asset / file / credential item 2]

Please download what you need and tell us if anything is missing. Post-approval changes will start a new revision.

Thanks,
[You]`,
    },
  ],
  keywords: [
    "design approval email template",
    "client review email",
    "design sign-off email",
  ],
};

export const websiteHandoffChecklist: ResourcePageContent = {
  id: "website-handoff-checklist",
  path: "/resources/website-handoff-checklist",
  primaryIntent: "website design handoff checklist",
  title: "Website Handoff Checklist After Design Approval | Pass-Off",
  description:
    "Website handoff checklist covering approved revision, source files, assets, credentials, environments, analytics, ownership, open decisions, and launch responsibilities.",
  h1: "Website handoff checklist",
  lead:
    "After designs are approved, use this checklist so development and launch are not guessing. Start from the approved revision, then transfer everything else required to ship.",
  publishedAt: "2026-09-06",
  updatedAt: "2026-09-06",
  author: { name: "Pass-Off Editorial", role: "Product team" },
  commercialLink: {
    href: "/website-design-approval",
    label: "Website design approval",
  },
  relatedResources: [
    {
      href: "/resources/design-approval-checklist",
      label: "Design approval checklist",
    },
    {
      href: "/resources/design-approval-email-template",
      label: "Design approval email templates",
    },
  ],
  passOffBridge: {
    heading: "Keep handoff attached to the approved revision",
    body: "In Pass-Off, release handoff items from the same approval room the client used for sign-off. That keeps final files connected to the revision digest that was approved—useful when questions arise during build or launch.",
  },
  sections: [
    {
      id: "approved-revision",
      title: "1. Approved revision",
      kind: "checklist",
      items: [
        {
          label: "Approval record located",
          detail: "Confirm revision number/digest, approver, and timestamp.",
        },
        {
          label: "Approved screen list exported or linked",
          detail: "Developers can open the exact set that was signed off.",
        },
        {
          label: "Deferred feedback documented",
          detail: "Anything approved-with-notes is written down with an owner.",
        },
      ],
    },
    {
      id: "source-files",
      title: "2. Source files",
      kind: "checklist",
      items: [
        {
          label: "Working design files accessible",
          detail: "Figma/Sketch/other source with correct permissions for builders.",
        },
        {
          label: "Page inventory matches approval",
          detail: "No surprise templates added after sign-off without a new revision.",
        },
        {
          label: "Component notes shared",
          detail: "Reuse rules, variants, and interaction expectations are listed.",
        },
      ],
    },
    {
      id: "assets",
      title: "3. Assets",
      kind: "checklist",
      items: [
        {
          label: "Raster and vector exports",
          detail: "Logos, icons, photos at required resolutions and formats.",
        },
        {
          label: "Font files or license links",
          detail: "Include web font licenses and fallbacks.",
        },
        {
          label: "Alt text and media metadata",
          detail: "Provide descriptive text for key images where known.",
        },
      ],
    },
    {
      id: "credentials-environments",
      title: "4. Credentials and environments",
      kind: "checklist",
      items: [
        {
          label: "Hosting and DNS owners identified",
          detail: "Who can change domains, SSL, and deploys?",
        },
        {
          label: "Staging URL available",
          detail: "Share staging access separately from production secrets.",
        },
        {
          label: "CMS/repo access provisioned",
          detail: "Least-privilege accounts for developers and content editors.",
        },
      ],
    },
    {
      id: "analytics-ownership",
      title: "5. Analytics and ownership",
      kind: "checklist",
      items: [
        {
          label: "Analytics property ownership",
          detail: "GA/ads pixels owned by the client org, not a personal account.",
        },
        {
          label: "Event requirements listed",
          detail: "Key conversions and page events defined before launch.",
        },
        {
          label: "Content ownership map",
          detail: "Who updates blog, legal pages, and product copy after launch?",
        },
      ],
    },
    {
      id: "open-decisions-launch",
      title: "6. Open decisions and launch responsibilities",
      kind: "checklist",
      items: [
        {
          label: "Open design decisions logged",
          detail: "Unresolved items have an owner and due date.",
        },
        {
          label: "Launch checklist assigned",
          detail: "Redirects, 404, favicon, sitemap, robots, and performance owners named.",
        },
        {
          label: "Rollback contact",
          detail: "Who can revert a release if launch fails?",
        },
      ],
    },
    {
      id: "handoff-message",
      title: "Handoff message template",
      kind: "template",
      copyLabel: "Copy Handoff Message",
      body: `Handoff package — [Project] (approved Revision [N])

Approved revision record: [link]
Source files: [link]
Assets: [link]
Environments: [staging URL]
Credentials: [shared vault location]
Analytics: [property + access]
Open decisions: [doc]
Launch owner: [name]

Please confirm receipt and flag missing items within [N] business days.`,
    },
  ],
  keywords: [
    "website handoff checklist",
    "design handoff checklist",
    "website design handoff",
  ],
};
