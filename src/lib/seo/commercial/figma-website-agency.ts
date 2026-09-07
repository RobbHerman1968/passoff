import type { CommercialPageContent } from "@/lib/seo/types";

export const figmaDesignApproval: CommercialPageContent = {
  id: "figma-design-approval",
  path: "/figma-design-approval",
  primaryIntent: "Figma design approval",
  title: "Figma Design Approval with Revision Sign-Off | Pass-Off",
  description:
    "Use Pass-Off for Figma design approval: export the frames you present, publish an immutable revision, and record client sign-off against that exact set—not a live file that keeps changing.",
  h1: "Turn a Figma review into a recorded client approval.",
  heroLead:
    "Figma is excellent for designing and collaborating. Pass-Off adds a client-facing approval room around the exact frames you present—so sign-off is revision-specific, not “whatever is in the file now.”",
  problemHeading: "Figma comments are not a final approval record",
  problemBody:
    "Teams often treat a thumbs-up in Figma comments as permission to build. The file keeps evolving, comment threads sprawl, and stakeholders who never opened Dev Mode still need a clear yes. Pass-Off does not replace Figma as your design tool. It captures client approval on exported screens from a published revision you control.",
  exampleHeading: "Example: product onboarding screens from Figma",
  exampleBody:
    "A product designer prepares onboarding frames in Figma. For client review, they export the desktop and mobile frames as images, upload them into a Pass-Off approval room, and publish Revision 1 for the stakeholder group.",
  exampleSteps: [
    {
      title: "Present the exported set",
      detail:
        "Clients review the images in Pass-Off with pin comments. They do not need edit access to the working Figma file.",
    },
    {
      title: "Iterate in Figma, re-publish in Pass-Off",
      detail:
        "Design changes happen in Figma. When ready, export again and publish Revision 2 so approval cannot attach to stale frames.",
    },
    {
      title: "Record sign-off, then hand off",
      detail:
        "After approval on Revision 2, release specs links, assets, or PDFs from the room’s handoff panel.",
    },
  ],
  previewVariant: "figma-export",
  previewAlt:
    "Illustration of Figma frames exported into a Pass-Off approval room revision for client sign-off",
  revisionHeading: "Revision-specific approval around Figma output",
  revisionBody:
    "Pass-Off freezes the uploaded screens as a published revision. Client approval attaches to that digest. This is intentional: live Figma files change; an approval record should not. Production Pass-Off approval rooms accept image and PDF uploads—export the frames you want signed off, then publish.",
  workflowNote:
    "Production note: Approval Rooms accept image and PDF uploads. Use Figma for design work, then export the review set into Pass-Off for client sign-off. Do not expect live multiplayer editing of the Figma file inside an approval room.",
  useCasesHeading: "When to add Pass-Off around Figma",
  useCases: [
    {
      title: "External client reviews",
      body: "Share a review link instead of expanding Figma seat access for one-time approvers.",
    },
    {
      title: "Milestone gate before engineering",
      body: "Lock UI frames as an approved revision before sprint planning references them.",
    },
    {
      title: "Agency presentations",
      body: "Present a curated export set so clients approve the story you showed—not unfinished pages in the working file.",
    },
  ],
  comparisonHeading: "Pass-Off vs approving inside Figma comments",
  comparisonIntro:
    "Figma comments are valuable during craft. They are a weak final sign-off mechanism for external clients.",
  comparisonRows: [
    {
      criterion: "Access model",
      informal: "Clients need Figma access or a prototype link that may expose WIP",
      passOff: "One review link limited to the published export set",
    },
    {
      criterion: "Immutability",
      informal: "File contents can change after a comment says “approved”",
      passOff: "Approval tied to a frozen revision digest",
    },
    {
      criterion: "Handoff",
      informal: "Separate channel for final assets after comment threads end",
      passOff: "Release handoff from the same approval room",
    },
  ],
  secondaryCta: {
    href: "/resources/design-approval-checklist",
    label: "Review the approval checklist",
  },
  resourceLinks: [
    {
      href: "/resources/design-approval-checklist",
      label: "Design approval checklist",
      description: "Confirm the export set is ready before you publish.",
    },
    {
      href: "/resources/design-feedback-checklist",
      label: "Design feedback checklist",
      description: "Coach clients on actionable visual notes.",
    },
    {
      href: "/resources/website-handoff-checklist",
      label: "Website handoff checklist",
      description: "After UI approval, prepare a complete handoff.",
    },
  ],
  relatedCommercial: [
    {
      href: "/design-approval-software",
      label: "Design approval software",
    },
    {
      href: "/website-design-approval",
      label: "Website design approval",
    },
    {
      href: "/client-approval-software",
      label: "Client approval software",
    },
  ],
  faq: [
    {
      question: "Does Pass-Off embed live Figma files in approval rooms?",
      answer:
        "No. Production approval rooms use uploaded images and PDFs. Export the Figma frames you want reviewed, publish them as a revision, then collect approval.",
    },
    {
      question: "Why not just approve in Figma comments?",
      answer:
        "Comments sit on a living file. Pass-Off records approval against an immutable revision so later edits cannot quietly invalidate the decision.",
    },
    {
      question: "Can I still design in Figma?",
      answer:
        "Yes. Keep designing in Figma. Use Pass-Off when you need a client-facing, revision-specific sign-off and handoff record.",
    },
  ],
  keywords: [
    "Figma design approval",
    "Figma client approval",
    "approve Figma designs",
    "Figma sign-off",
    "design revision from Figma",
  ],
};

export const websiteDesignApproval: CommercialPageContent = {
  id: "website-design-approval",
  path: "/website-design-approval",
  primaryIntent: "website design approval process",
  title: "Website Design Approval Process Before Development | Pass-Off",
  description:
    "Run a website design approval process in Pass-Off: review pages and responsive screens, collect visual feedback, approve a revision, then start development against what was signed off.",
  h1: "Get website designs approved before development begins.",
  heroLead:
    "Review key pages and responsive states, gather client feedback on the designs themselves, and record approval on a frozen revision—so engineering builds the right screens.",
  problemHeading: "Building against unapproved website comps wastes sprints",
  problemBody:
    "Website projects often jump from “pretty sure they liked it” into component build. Mobile states get missed, content placeholders hide real copy issues, and stakeholders resurface feedback after tickets are in flight. A deliberate website design approval process gates development on a recorded yes.",
  exampleHeading: "Example: marketing site redesign",
  exampleBody:
    "An agency prepares homepage, pricing, and contact page comps for desktop and mobile. They upload the six screens into a Pass-Off room, publish Revision 4, and send the client a review link before any front-end tickets are created.",
  exampleSteps: [
    {
      title: "Page-by-page visual review",
      detail:
        "The client pins notes on hero hierarchy and pricing table density. Missing tablet comps are caught before build.",
    },
    {
      title: "Content and edge cases called out",
      detail:
        "Long product names and empty-state messaging get flagged while still cheap to fix in design.",
    },
    {
      title: "Approved revision becomes the build source",
      detail:
        "Engineering receives handoff assets tied to the approved revision—not a stale Figma page that changed overnight.",
    },
  ],
  previewVariant: "website-screens",
  previewAlt:
    "Pass-Off room showing desktop and mobile website design screens ready for client approval",
  revisionHeading: "Approve the website revision you intend to build",
  revisionBody:
    "Pass-Off treats each publish as an immutable revision. When stakeholders approve, that decision attaches to the exact page set they reviewed. If the sitemap or key templates change, publish again—do not pretend the old approval covers new screens.",
  useCasesHeading: "Website approval scenarios",
  useCases: [
    {
      title: "Marketing site redesigns",
      body: "Gate homepage and conversion templates before CMS or front-end implementation.",
    },
    {
      title: "Brochure sites for local businesses",
      body: "Give non-technical clients a simple link to approve layouts without design-tool training.",
    },
    {
      title: "Product marketing pages",
      body: "Lock launch-page comps so paid media and engineering share the same approved visuals.",
    },
  ],
  comparisonHeading: "Pass-Off vs informal website design sign-off",
  comparisonIntro:
    "Slide decks and email PDFs can show comps. They rarely preserve a clean link between approval and the screens developers should implement.",
  comparisonRows: [
    {
      criterion: "Responsive coverage",
      informal: "Desktop PDF only; mobile discovered in QA",
      passOff: "Publish desktop and mobile screens in one revision",
    },
    {
      criterion: "Feedback quality",
      informal: "“Make it pop” in a reply-all thread",
      passOff: "Pinned comments on specific screens and regions",
    },
    {
      criterion: "Build readiness",
      informal: "Dev starts while stakeholders still debating",
      passOff: "Approval recorded before handoff release",
    },
  ],
  secondaryCta: {
    href: "/resources/design-approval-checklist",
    label: "Review the approval checklist",
  },
  resourceLinks: [
    {
      href: "/resources/website-handoff-checklist",
      label: "Website handoff checklist",
      description: "Everything to transfer after designs are approved.",
    },
    {
      href: "/resources/design-approval-checklist",
      label: "Design approval checklist",
      description: "Prep pages, states, and content before sign-off.",
    },
    {
      href: "/resources/design-approval-email-template",
      label: "Approval email templates",
      description: "Ask for website design review with clear next steps.",
    },
  ],
  relatedCommercial: [
    {
      href: "/figma-design-approval",
      label: "Figma design approval",
    },
    {
      href: "/design-approval-software",
      label: "Design approval software",
    },
    {
      href: "/approval-workflow-for-agencies",
      label: "Agency approval workflow",
    },
  ],
  faq: [
    {
      question: "Should website designs be approved before development?",
      answer:
        "Yes for most projects. Approving a published revision reduces rework when stakeholders change layout after engineering has started.",
    },
    {
      question: "Can we include mobile and desktop in one approval?",
      answer:
        "Yes. Upload the screens you want reviewed into a single revision so approval covers the full set you published.",
    },
    {
      question: "What does Pass-Off provide after website approval?",
      answer:
        "You can release handoff items from the same room—assets, links, and notes—connected to the approved revision.",
    },
  ],
  keywords: [
    "website design approval",
    "website design approval process",
    "approve website designs",
    "web design client approval",
    "design approval before development",
  ],
};

export const approvalWorkflowForAgencies: CommercialPageContent = {
  id: "approval-workflow-for-agencies",
  path: "/approval-workflow-for-agencies",
  primaryIntent: "client approval workflow for agencies",
  title: "Client Approval Workflow for Agencies | Pass-Off",
  description:
    "Pass-Off gives agencies a client approval workflow that reduces ambiguous yeses and keeps final handoff connected to the approved design revision.",
  h1: "A client approval workflow built for agencies.",
  heroLead:
    "Run client review inside dedicated approval rooms. Collect feedback, lock revision-specific sign-off, and release delivery without losing the thread between “approved” and “shipped.”",
  problemHeading: "Agency approvals fail when the record is ambiguous",
  problemBody:
    "Account teams inherit Slack thumbs-ups, forwarded emails, and “we’re good” texts that do not name a version. When production questions arise weeks later, nobody can show what the client accepted. An agency client approval workflow needs a durable room per engagement—and a revision digest on every yes.",
  exampleHeading: "Example: multi-stakeholder campaign creative",
  exampleBody:
    "An agency creative team finishes social and landing comps for a product launch. The producer opens a Pass-Off room for the campaign, publishes Revision 5 with the full board set, and shares one link with the brand manager.",
  exampleSteps: [
    {
      title: "Brand and legal review the same revision",
      detail:
        "Comments land in one place. The producer sees open threads without reconciling three inboxes.",
    },
    {
      title: "Changes produce a new revision",
      detail:
        "Legal markup ships as Revision 6. Approval cannot be claimed against the pre-legal boards.",
    },
    {
      title: "Handoff stays attached",
      detail:
        "After sign-off, trafficking receives final assets from the room tied to the approved digest.",
    },
  ],
  previewVariant: "agency-handoff",
  previewAlt:
    "Pass-Off agency workflow showing approved revision status and handoff items ready for delivery",
  revisionHeading: "Keep the final handoff connected to the approved revision",
  revisionBody:
    "Pass-Off links feedback, approval, and handoff inside one approval room. When a client signs off, the decision references the published revision. Releasing handoff from that room keeps account, creative, and delivery aligned on the same record—without promising multi-seat agency admin features that are not in this release.",
  workflowNote:
    "First release focuses on a single workspace owner running client approval rooms. Team seats, custom domains, and advanced white labeling are not part of the shipping product.",
  useCasesHeading: "Agency-shaped use cases",
  useCases: [
    {
      title: "Campaign creative approvals",
      body: "Freeze the board set stakeholders reviewed before media trafficking begins.",
    },
    {
      title: "Website and product UI engagements",
      body: "Separate milestone revisions so phase approvals stay distinct across a long retainers timeline.",
    },
    {
      title: "Freelance-heavy delivery pods",
      body: "Give external creatives a clear publish → review → approve path under the agency workspace owner.",
    },
  ],
  comparisonHeading: "Pass-Off vs informal agency approval chains",
  comparisonIntro:
    "Agencies already have project tools. What is often missing is a client-facing approval record tied to creative revisions and delivery.",
  comparisonRows: [
    {
      criterion: "Ambiguity",
      informal: "“Approved” without naming boards or version",
      passOff: "Decision stored against a revision digest",
    },
    {
      criterion: "Stakeholder sprawl",
      informal: "Parallel email threads with conflicting notes",
      passOff: "Shared review link with visual comments",
    },
    {
      criterion: "Delivery continuity",
      informal: "Final zip emailed weeks later from another owner",
      passOff: "Handoff released from the approved room",
    },
  ],
  secondaryCta: {
    href: "/resources/client-sign-off-template",
    label: "Use the sign-off template",
  },
  resourceLinks: [
    {
      href: "/resources/client-sign-off-template",
      label: "Client sign-off template",
      description: "Formal acceptance language for agency clients.",
    },
    {
      href: "/resources/design-approval-email-template",
      label: "Approval email templates",
      description: "Producer-ready messages for each review stage.",
    },
    {
      href: "/resources/website-handoff-checklist",
      label: "Website handoff checklist",
      description: "Close digital projects without missing delivery items.",
    },
  ],
  relatedCommercial: [
    {
      href: "/client-approval-software",
      label: "Client approval software",
    },
    {
      href: "/design-approval-software",
      label: "Design approval software",
    },
    {
      href: "/website-design-approval",
      label: "Website design approval",
    },
  ],
  faq: [
    {
      question: "Is Pass-Off an agency project-management suite?",
      answer:
        "No. It is focused on approval rooms: publish a revision, collect client feedback and sign-off, then release handoff. Broader PM features are out of scope for this product.",
    },
    {
      question: "Does this release include team seats or white labeling?",
      answer:
        "No. First release is a single workspace owner model. Team seats, custom domains, and advanced white labeling are deferred.",
    },
    {
      question: "How does Pass-Off reduce ambiguous approvals?",
      answer:
        "Clients take an explicit approve action on a published revision. The record includes the revision digest, so “approved” always points at specific files.",
    },
  ],
  keywords: [
    "client approval workflow for agencies",
    "agency design approval",
    "agency client approval",
    "creative approval workflow",
    "agency handoff approval",
  ],
};
