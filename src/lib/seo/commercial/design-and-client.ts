import type { CommercialPageContent } from "@/lib/seo/types";

export const designApprovalSoftware: CommercialPageContent = {
  id: "design-approval-software",
  path: "/design-approval-software",
  primaryIntent: "design approval software",
  title: "Design Approval Software for Exact Revision Sign-Off | Pass-Off",
  description:
    "Pass-Off is design approval software that records client sign-off against an exact, immutable design revision—then delivers handoff from the same review link.",
  h1: "Design approval software that records exactly what was approved.",
  heroLead:
    "Stop chasing “looks good” in email threads. Publish a frozen revision, collect visual feedback, and lock approval to that specific set of files.",
  problemHeading: "Vague approvals create expensive rework",
  problemBody:
    "When approval lives in chat, email, or a moving design file, nobody can prove which version the client accepted. Teams ship the wrong screens, reopen finished work, or argue about what “final” meant. Design approval software should close that gap by binding the decision to a revision that cannot silently change underneath you.",
  exampleHeading: "Example: brand site homepage round",
  exampleBody:
    "A freelance designer finishes homepage explorations for a client. Instead of dumping PDFs into email, they open a Pass-Off approval room for “Northwind homepage,” upload the desktop and mobile comps for this round, and publish Revision 2.",
  exampleSteps: [
    {
      title: "Client opens one review link",
      detail:
        "They leave pin comments on spacing and the CTA label, then request changes. Feedback stays attached to Revision 2.",
    },
    {
      title: "Designer publishes Revision 3",
      detail:
        "Fixes land in a new frozen revision. Prior comments remain readable against the earlier set of files.",
    },
    {
      title: "Client records approval",
      detail:
        "Sign-off is stored against Revision 3’s digest. Handoff files release from the same room—not a separate Drive folder.",
    },
  ],
  previewVariant: "approval-room",
  previewAlt:
    "Pass-Off approval room showing a published design revision, client feedback, and an approved status on that revision",
  revisionHeading: "Revision-specific approval—not a moving target",
  revisionBody:
    "Each published revision in Pass-Off is immutable. Comments, change requests, and approval decisions attach to that revision’s content digest. If the work changes, you publish a new revision. The approval record cannot drift onto files the client never saw.",
  useCasesHeading: "Where revision-locked approval helps most",
  useCases: [
    {
      title: "Freelance packaging and brand work",
      body: "Keep print and digital comps in one room so the signed-off PDF set matches what goes to production.",
    },
    {
      title: "Product marketing launches",
      body: "Approve campaign creative as a revision before media buys or engineering build against outdated frames.",
    },
    {
      title: "Studio client retainers",
      body: "Separate each deliverable round into its own published revision so historical approvals stay auditable.",
    },
  ],
  comparisonHeading: "Pass-Off vs informal design approval",
  comparisonIntro:
    "Informal channels are fine for brainstorming. They are a weak system of record for final design approval.",
  comparisonRows: [
    {
      criterion: "What was approved",
      informal: "A message, emoji, or “LGTM” with no file digest",
      passOff: "Approval bound to an immutable revision digest",
    },
    {
      criterion: "Feedback placement",
      informal: "Scattered across email, Slack, and file versions",
      passOff: "Visual comments on the published revision",
    },
    {
      criterion: "Final files",
      informal: "Separate zip or Drive folder after the fact",
      passOff: "Handoff released from the same approval room",
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
      description: "Ready a revision for sign-off before you send the link.",
    },
    {
      href: "/resources/client-sign-off-template",
      label: "Client sign-off template",
      description: "Copyable language for a valid approval record.",
    },
    {
      href: "/resources/design-feedback-checklist",
      label: "Design feedback checklist",
      description: "Help clients leave actionable visual comments.",
    },
  ],
  relatedCommercial: [
    {
      href: "/client-approval-software",
      label: "Client approval software",
    },
    {
      href: "/website-design-approval",
      label: "Website design approval",
    },
    {
      href: "/approval-workflow-for-agencies",
      label: "Agency approval workflow",
    },
  ],
  faq: [
    {
      question: "Does Pass-Off lock approval to a specific design revision?",
      answer:
        "Yes. When a client approves, Pass-Off records the decision against that published revision’s content digest. Later edits require a new revision.",
    },
    {
      question: "Can clients approve without creating an account?",
      answer:
        "Yes. Clients use the review link to leave feedback and record approval. Reviewers stay free; only the workspace is billed.",
    },
    {
      question: "What happens after design approval?",
      answer:
        "You release handoff items from the same approval room so delivery stays connected to the approved revision.",
    },
  ],
  keywords: [
    "design approval software",
    "design approval",
    "design revision approval",
    "client design sign-off",
    "immutable design revision",
  ],
};

export const clientApprovalSoftware: CommercialPageContent = {
  id: "client-approval-software",
  path: "/client-approval-software",
  primaryIntent: "client approval software",
  title: "Client Approval Software for Creative Review Links | Pass-Off",
  description:
    "Pass-Off client approval software gives creatives one review link for feedback, change requests, revision-specific sign-off, and final file delivery.",
  h1: "A simpler client approval workflow for creative work.",
  heroLead:
    "One branded review link for your client: see the designs, leave visual feedback, approve the right revision, and download the handoff—without another login maze.",
  problemHeading: "Client approval should not require a scavenger hunt",
  problemBody:
    "Creative projects stall when clients juggle attachments, outdated links, and conflicting stakeholder notes. Client approval software should make the path obvious: open the link, review the current revision, decide, and leave a durable record. Pass-Off is built around that single-link workflow.",
  exampleHeading: "Example: logo system presentation",
  exampleBody:
    "A studio wraps a logo exploration. They create an approval room named for the client, upload the presentation boards as images, publish the revision, and email one review link to the marketing lead.",
  exampleSteps: [
    {
      title: "Stakeholders review together",
      detail:
        "The marketing lead forwards the same link to the founder. Both leave comments on specific boards without downloading zip files.",
    },
    {
      title: "Changes stay in the room",
      detail:
        "The studio publishes a cleaned revision. Prior notes remain available so nobody asks “which PDF was that?”",
    },
    {
      title: "Approval unlocks delivery",
      detail:
        "After sign-off, the studio releases vector files and brand guidelines from the handoff panel on the same link.",
    },
  ],
  previewVariant: "client-link",
  previewAlt:
    "Pass-Off client review link interface with design preview, comment thread, and approve action",
  revisionHeading: "Approval that clients can trust—and you can prove",
  revisionBody:
    "Clients approve a published revision, not an inbox thread. Pass-Off stores who approved, when, and which content digest they accepted. If scope expands, open a new revision instead of rewriting history.",
  useCasesHeading: "Client approval use cases",
  useCases: [
    {
      title: "Independent designers",
      body: "Replace “please reply all with approval” emails with a clear review link and recorded decision.",
    },
    {
      title: "Creative studios",
      body: "Give clients one place for comments and sign-off while you keep ownership of the workspace.",
    },
    {
      title: "In-house creatives serving internal stakeholders",
      body: "Treat leadership like a client: publish a revision, collect notes, and lock a decision before production.",
    },
  ],
  comparisonHeading: "Pass-Off vs email and chat approvals",
  comparisonIntro:
    "Email and chat move fast. They rarely produce a clean client approval record tied to the files that were reviewed.",
  comparisonRows: [
    {
      criterion: "Client experience",
      informal: "Attachments, forwarding chains, and missing context",
      passOff: "One review link with the current published revision",
    },
    {
      criterion: "Decision clarity",
      informal: "Ambiguous replies mixed with side conversations",
      passOff: "Explicit approve or request-changes actions",
    },
    {
      criterion: "Delivery",
      informal: "Files sent later from a different channel",
      passOff: "Handoff available on the same client link",
    },
  ],
  secondaryCta: {
    href: "#how-it-works",
    label: "See how approval rooms work",
  },
  resourceLinks: [
    {
      href: "/resources/client-sign-off-template",
      label: "Client sign-off template",
      description: "Statements and email copy for formal acceptance.",
    },
    {
      href: "/resources/design-approval-email-template",
      label: "Design approval email templates",
      description: "Initial review, reminders, and confirmation messages.",
    },
    {
      href: "/resources/design-feedback-checklist",
      label: "Design feedback checklist",
      description: "Guide clients toward comments you can act on.",
    },
  ],
  relatedCommercial: [
    {
      href: "/design-approval-software",
      label: "Design approval software",
    },
    {
      href: "/approval-workflow-for-agencies",
      label: "Agency approval workflow",
    },
    {
      href: "/figma-design-approval",
      label: "Figma design approval",
    },
  ],
  faq: [
    {
      question: "Do clients need a Pass-Off account?",
      answer:
        "No. Clients open the review link, identify themselves, leave feedback, and approve. Accounts are for the workspace owner.",
    },
    {
      question: "Can one link cover review, approval, and delivery?",
      answer:
        "Yes. The same share link shows the published revision, collects comments and decisions, and can expose handoff items after you release them.",
    },
    {
      question: "What if the client requests changes?",
      answer:
        "They mark changes requested and leave comments. You update the work, publish a new revision, and share the same room again.",
    },
  ],
  keywords: [
    "client approval software",
    "client approval workflow",
    "client review link",
    "creative client approval",
    "design sign-off software",
  ],
};
