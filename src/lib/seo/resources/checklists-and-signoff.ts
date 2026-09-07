import type { ResourcePageContent } from "@/lib/seo/types";

export const designApprovalChecklist: ResourcePageContent = {
  id: "design-approval-checklist",
  path: "/resources/design-approval-checklist",
  primaryIntent: "design approval checklist",
  title: "Design Approval Checklist for Client Sign-Off | Pass-Off",
  description:
    "A practical design approval checklist covering revision readiness, responsive states, content, edge cases, approver identity, and final sign-off.",
  h1: "Design approval checklist",
  lead:
    "Use this checklist before you send a review link. It is written for creatives who need a durable client yes—not a vague “looks good” in chat.",
  publishedAt: "2026-09-06",
  updatedAt: "2026-09-06",
  author: { name: "Pass-Off Editorial", role: "Product team" },
  commercialLink: {
    href: "/design-approval-software",
    label: "Design approval software",
  },
  relatedResources: [
    {
      href: "/resources/design-feedback-checklist",
      label: "Design feedback checklist",
    },
    {
      href: "/resources/client-sign-off-template",
      label: "Client sign-off template",
    },
  ],
  passOffBridge: {
    heading: "How Pass-Off helps you run this checklist",
    body: "Publish the ready set as an immutable revision, share one review link, and record approval against that digest. When something on this checklist fails, fix it and publish a new revision instead of quietly swapping files under an old yes.",
  },
  sections: [
    {
      id: "revision-readiness",
      title: "1. Revision readiness",
      kind: "checklist",
      intro: "Treat the send as a milestone, not a WIP dump.",
      items: [
        {
          label: "Named revision intent",
          detail:
            "Write one sentence for what this round decides (e.g., “Homepage visual direction for desktop and mobile”).",
        },
        {
          label: "Only reviewable files included",
          detail: "Remove exploratory leftovers the client should not approve by accident.",
        },
        {
          label: "Export fidelity checked",
          detail: "Images/PDFs are sharp enough to judge type, spacing, and imagery at intended sizes.",
        },
        {
          label: "Version label matches conversation",
          detail: "If you said “Revision 3” in email, the published revision number matches.",
        },
      ],
    },
    {
      id: "responsive-states",
      title: "2. Responsive and device states",
      kind: "checklist",
      items: [
        {
          label: "Primary breakpoints present",
          detail: "Include the viewports you expect to build (commonly desktop + mobile; tablet if in scope).",
        },
        {
          label: "Navigation and key UI at each size",
          detail: "Menus, CTAs, and forms are visible in each state—not cropped previews.",
        },
        {
          label: "Sticky or overlay behaviors noted",
          detail: "If a header or modal matters to the decision, show it explicitly or call it out in notes.",
        },
      ],
    },
    {
      id: "content",
      title: "3. Content readiness",
      kind: "checklist",
      items: [
        {
          label: "Real or agreed placeholder copy",
          detail: "Mark lorem clearly if still temporary so clients do not approve placeholder as final messaging.",
        },
        {
          label: "Legal and brand claims reviewed",
          detail: "Anything that needs compliance review is flagged before asking for final sign-off.",
        },
        {
          label: "Image rights known",
          detail: "Stock, client assets, and custom photography are cleared for the intended use.",
        },
      ],
    },
    {
      id: "edge-cases",
      title: "4. Edge cases",
      kind: "checklist",
      items: [
        {
          label: "Long content stress-tested",
          detail: "Show long titles, multi-line prices, or translated strings if those are realistic.",
        },
        {
          label: "Empty and error states considered",
          detail: "If the product surface needs them, include or explicitly defer them in writing.",
        },
        {
          label: "Out-of-scope items labeled",
          detail: "Prevent “why isn’t X in the comps?” by stating what this revision does not cover.",
        },
      ],
    },
    {
      id: "approver-identity",
      title: "5. Approver identity",
      kind: "checklist",
      items: [
        {
          label: "Named decision maker",
          detail: "Confirm who can legally or contractually approve (name + role), not only who can comment.",
        },
        {
          label: "Secondary reviewers listed",
          detail: "If legal/brand must review first, sequence that before final approval.",
        },
        {
          label: "Deadline communicated",
          detail: "Give a clear review-by date and what happens if the date passes.",
        },
      ],
    },
    {
      id: "final-sign-off",
      title: "6. Final sign-off",
      kind: "checklist",
      items: [
        {
          label: "Acceptance criteria shared",
          detail: "Clients know what “approve” means (ready for development, print, trafficking, etc.).",
        },
        {
          label: "Change process stated",
          detail: "Explain that post-approval changes require a new revision and may affect timeline or fees.",
        },
        {
          label: "Record captured",
          detail:
            "Capture an explicit approve action tied to the files reviewed—not only a casual message.",
        },
      ],
    },
    {
      id: "quick-script",
      title: "Send script (optional)",
      kind: "template",
      intro: "Paste into your review email after the checklist passes.",
      copyLabel: "Copy send script",
      body: `Subject: Ready for design approval — [Project], Revision [N]

Hi [Name],

Please review Revision [N] of [Project]. This round is meant to decide: [one-sentence intent].

Included: [list screens/states].
Out of scope for this revision: [list].

Please leave comments on specific screens, or approve if this revision is ready for [development / production / handoff].

Review link: [Pass-Off link]
Please respond by [date].

Thanks,
[You]`,
    },
  ],
  keywords: [
    "design approval checklist",
    "client design approval checklist",
    "design sign-off checklist",
  ],
};

export const clientSignOffTemplate: ResourcePageContent = {
  id: "client-sign-off-template",
  path: "/resources/client-sign-off-template",
  primaryIntent: "client design sign-off template",
  title: "Client Design Sign-Off Template | Pass-Off",
  description:
    "Copyable design sign-off statement, email template, acceptance criteria, and what a valid approval record should contain.",
  h1: "Client design sign-off template",
  lead:
    "Use these templates when you need a clear, professional acceptance of a design revision. Pair them with a review link that shows the exact files under discussion.",
  publishedAt: "2026-09-06",
  updatedAt: "2026-09-06",
  author: { name: "Pass-Off Editorial", role: "Product team" },
  commercialLink: {
    href: "/client-approval-software",
    label: "Client approval software",
  },
  relatedResources: [
    {
      href: "/resources/design-approval-email-template",
      label: "Design approval email templates",
    },
    {
      href: "/resources/design-approval-checklist",
      label: "Design approval checklist",
    },
  ],
  passOffBridge: {
    heading: "How Pass-Off stores a valid approval",
    body: "In Pass-Off, clients approve a published revision. The product records the decision against that revision’s content digest, along with the approval timing. That is stronger than a free-floating email reply because the files cannot silently change under the same yes.",
  },
  sections: [
    {
      id: "what-counts",
      title: "What a valid approval record should contain",
      kind: "checklist",
      intro: "If any of these are missing, treat the “approval” as incomplete.",
      items: [
        {
          label: "Project and revision identity",
          detail: "Project name plus revision number or content digest.",
        },
        {
          label: "Approver identity",
          detail: "Name, role, and organization of the person authorized to approve.",
        },
        {
          label: "Timestamp",
          detail: "Date and time of the decision (with timezone if contracts care).",
        },
        {
          label: "Scope statement",
          detail: "What the approval covers—and what it does not.",
        },
        {
          label: "Explicit decision",
          detail: "Approve vs changes requested, not an ambiguous compliment.",
        },
        {
          label: "Reference to reviewed files",
          detail: "Link or attachment set that matches the approved digest.",
        },
      ],
    },
    {
      id: "statement",
      title: "Copyable design sign-off statement",
      kind: "template",
      intro: "Clients can paste this into email, or you can mirror the language in your review flow.",
      copyLabel: "Copy sign-off statement",
      body: `I, [Full Name], [Title] at [Company], approve Revision [N] of [Project Name] as reviewed at [link or file list].

This approval covers: [pages/screens/deliverables].
This approval does not cover: [explicit exclusions].

I confirm that further changes after this approval may require a new revision and may affect timeline or fees.

Approved on: [Date, Time, Timezone]
Signature / typed name: [Full Name]`,
    },
    {
      id: "acceptance",
      title: "Acceptance criteria block",
      kind: "template",
      intro: "Attach this to the review request so “approve” has a shared meaning.",
      copyLabel: "Copy acceptance criteria",
      body: `Acceptance criteria for Revision [N]
- Visual design for listed screens is accepted for [development / print / trafficking].
- Copy marked as final is accepted; placeholders remain open if labeled.
- Responsive states included in this revision are accepted.
- Known exclusions listed in the review brief remain out of scope.
- Open comments must be resolved or explicitly deferred in writing before approval.`,
    },
    {
      id: "email",
      title: "Sign-off request email",
      kind: "template",
      copyLabel: "Copy email template",
      body: `Subject: Design sign-off requested — [Project] Revision [N]

Hi [Name],

Please review and formally approve Revision [N] of [Project].

Review link: [URL]
What we need decided: [intent]
Please approve by: [date]

If anything blocks approval, leave specific comments or reply with changes requested.

Thank you,
[You]`,
    },
    {
      id: "passoff-default",
      title: "Note on Pass-Off’s default approval language",
      kind: "prose",
      paragraphs: [
        "Pass-Off Approval Rooms use a clear default approval statement along the lines of approving the revision as complete and ready for delivery, with further changes requiring a new revision. When you need custom contract language, keep that in your SOW and still record the product approval against the revision digest.",
      ],
    },
  ],
  keywords: [
    "design sign-off template",
    "client approval template",
    "design acceptance criteria",
  ],
};
