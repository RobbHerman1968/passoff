export type SeoPage = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  keywords: string[];
  h1: string;
  lead: string;
  note: string;
  problem: {
    eyebrow: string;
    title: string;
    body: string;
    points: { title: string; body: string }[];
  };
  steps: { title: string; body: string }[];
  payoff: {
    title: string;
    body: string;
    items: string[];
  };
  faq: { question: string; answer: string }[];
};

export const seoPages: SeoPage[] = [
  {
    slug: "website-feedback-tool",
    eyebrow: "Website feedback tool",
    title: "Website Feedback Tool for Clear, On-Page Comments",
    description:
      "Collect website feedback on the real page. Passoff keeps every issue tied to the right place, page, and recorded version.",
    keywords: [
      "website feedback tool",
      "website annotation tool",
      "client website feedback",
      "website review tool",
    ],
    h1: "Website feedback that lands right where it belongs.",
    lead:
      "Let clients point at the real page, say what they mean, and carry on with their day. Passoff keeps the page, spot, browser details, and conversation together for your team.",
    note: "No browser extension. No screenshot scrapbook. No tiny treasure map made of red arrows.",
    problem: {
      eyebrow: "A tidier way to review",
      title: "Turn “that bit over there” into feedback your team can use.",
      body:
        "Website feedback usually arrives in pieces: a screenshot in email, a note in chat, and one last thought during a call. Passoff gives the whole review one home, directly on the website being discussed.",
      points: [
        {
          title: "Review the real website",
          body: "Clients see the working page—not a flattened copy that behaves differently from the real thing.",
        },
        {
          title: "Keep the useful context",
          body: "Each comment remembers its page and location, plus the details your team needs to find the issue again.",
        },
        {
          title: "Know what still needs attention",
          body: "Open, in progress, ready for verification, verified, and closed issues stay easy to scan without a side spreadsheet.",
        },
      ],
    },
    steps: [
      {
        title: "Add Passoff to the site",
        body: "Place one small script on the website. The review tools stay out of sight until a valid review is open.",
      },
      {
        title: "Share one review link",
        body: "Your client opens the link, adds their name, and starts reviewing. No account obstacle course required.",
      },
      {
        title: "Point, comment, and reply",
        body: "Feedback is pinned to the right part of the page, with the conversation beside it.",
      },
      {
        title: "Fix, check, and close the loop",
        body: "Mark work ready for another look, gather the final yes, and keep the decision with the review.",
      },
    ],
    payoff: {
      title: "Less detective work. More useful work.",
      body:
        "Passoff is built for the gap between showing a website and getting it approved. Clients get a simple review experience. Your team gets feedback with enough context to act on it.",
      items: [
        "Works for live, staged, and signed-in websites",
        "Supports page-level and element-level feedback",
        "Keeps recorded versions and earlier decisions in view",
        "Gives guests a clear path without making them join another tool",
      ],
    },
    faq: [
      {
        question: "Does Passoff copy or proxy my website?",
        answer:
          "No. Reviewers use your real website. A small Passoff embed adds the review tools only when an active review session is open.",
      },
      {
        question: "Do clients need an account?",
        answer:
          "No. A guest can open a shared review, enter a name and email address, and leave feedback without creating a Passoff account.",
      },
      {
        question: "Can Passoff review a website behind a login?",
        answer:
          "Yes. Because the review happens on the real site, it can work with signed-in and session-based pages when your team has added and allowed the Passoff embed there.",
      },
      {
        question: "What happens when a page changes?",
        answer:
          "Passoff keeps several location clues with each comment. If the exact element moves, your team still has the page, nearby text, position, and earlier review context to help find it.",
      },
    ],
  },
  {
    slug: "video-review-software",
    eyebrow: "Video review software",
    title: "Video Review Software for Clear, Time-Stamped Feedback",
    description:
      "Attach short time-stamped video evidence to a website issue, then record approval on the version in front of the client.",
    keywords: [
      "video review software",
      "video feedback tool",
      "client video review",
      "video approval software",
    ],
    h1: "Video feedback without the timecode tumbleweed.",
    lead:
      "Attach a short clip to a website issue, share one friendly link, and keep the evidence with the recorded version being reviewed.",
    note: "No “around 1:42-ish.” No feedback hiding in three inboxes. No final-final-really-final guessing game.",
    problem: {
      eyebrow: "Keep every note on cue",
      title: "A shared review space for the whole video conversation.",
      body:
        "Video in Passoff is short issue evidence, not a separate review project. Attach a clip so people can see the problem without starting a new video review.",
      points: [
        {
          title: "Comment on the moment",
          body: "Pause, leave a note, and give editors a clear time to revisit instead of a paragraph of guesswork.",
        },
        {
          title: "Keep cuts in order",
          body: "Approval belongs to the recorded deployment or version the client saw, so nobody signs off on yesterday’s build by accident.",
        },
        {
          title: "Make the next step obvious",
          body: "Reviewers can see whether you need feedback, another look, or a final decision.",
        },
      ],
    },
    steps: [
      {
        title: "Upload the latest cut",
        body: "Attach the clip to the relevant issue so the evidence stays with the website review.",
      },
      {
        title: "Invite the right reviewers",
        body: "Send one link. Guests can join the review without creating another password to forget.",
      },
      {
        title: "Collect time-stamped notes",
        body: "Comments stay tied to the moment on screen, while replies keep follow-up questions nearby.",
      },
      {
        title: "Share the next cut—or ask for approval",
        body: "Record a new deployment when the work changes, then ask for approval on that version.",
      },
    ],
    payoff: {
      title: "Make room for better notes, not more admin.",
      body:
        "Passoff helps agencies, product teams, and video makers spend less time sorting feedback and more time shaping the work.",
      items: [
        "Time-stamped comments that point to the right moment",
        "Approvals tied to a recorded version",
        "Guest reviewing without a required account",
        "A visible path from feedback to approval",
      ],
    },
    faq: [
      {
        question: "What video files can I attach?",
        answer:
          "On the Agency video-evidence pilot, clips are limited to 3 minutes, 250 MB, and 1080p. Free and Studio video-evidence limits are not published yet.",
      },
      {
        question: "Can reviewers leave feedback at a specific time?",
        answer:
          "Yes. A reviewer can pause the video and leave a comment tied to that moment, so the editor knows exactly where to look.",
      },
      {
        question: "Will an older cut disappear when I upload a new one?",
        answer:
          "No. Earlier issues, comments, and version-specific approvals stay available. The newest recorded version is easy to find.",
      },
      {
        question: "Do clients have to install anything?",
        answer:
          "No. Reviewers open a link in their browser. There is no extension or desktop app to install.",
      },
    ],
  },
  {
    slug: "client-approval-software",
    eyebrow: "Client approval software",
    title: "Client Approval Software That Makes the Final Yes Clear",
    description:
      "Gather client issues, review the real website, and record a clear approval on the right recorded version with Passoff.",
    keywords: [
      "client approval software",
      "client feedback and approval",
      "creative approval tool",
      "client sign off software",
    ],
    h1: "A clear path from “one small thing” to a real yes.",
    lead:
      "Passoff gives clients one welcoming place to review work, ask for changes, and approve the version in front of them. Your team keeps the conversation and the decision together.",
    note: "Because a thumbs-up in a busy group chat should not have to carry the weight of final approval.",
    problem: {
      eyebrow: "Close the loop kindly",
      title: "Make approval feel simple for clients—and dependable for your team.",
      body:
        "Clients should not need a training session to give useful feedback. Teams should not need a meeting to decide whether the work was actually approved. Passoff makes both sides of the handoff plain.",
      points: [
        {
          title: "One place to look",
          body: "The work, comments, replies, status, and approval request live together instead of wandering across tools.",
        },
        {
          title: "One version to approve",
          body: "The approval belongs to the recorded deployment or version the client saw, which helps everyone avoid a costly version mix-up.",
        },
        {
          title: "One clear next step",
          body: "Clients always know whether to leave feedback, check an update, or make the final call.",
        },
      ],
    },
    steps: [
      {
        title: "Open a review",
        body: "Choose the website environment and recorded version you want reviewed and explain what kind of response you need.",
      },
      {
        title: "Share a guest-friendly link",
        body: "Invite clients into a focused review without asking them to learn your project setup.",
      },
      {
        title: "Work through feedback",
        body: "Reply, assign, update, and mark feedback ready for another look while the history stays intact.",
      },
      {
        title: "Ask for the final yes",
        body: "When the work is ready, request approval and keep the decision attached to that recorded version.",
      },
    ],
    payoff: {
      title: "A calmer ending for every project chapter.",
      body:
        "Passoff is not here to make approval feel formal and fussy. It is here to make the decision unmistakable, so the work can move forward without another round of inbox archaeology.",
      items: [
        "Plain-language statuses clients can understand",
        "Comments and replies beside the work",
        "Recorded versions that preserve what changed",
        "A recorded approval on the version that was shown",
      ],
    },
    faq: [
      {
        question: "What does client approval mean in Passoff?",
        answer:
          "It means a named reviewer has approved a specific recorded deployment or version. The decision stays with that version, along with its issues and history.",
      },
      {
        question: "Can a client ask for changes instead?",
        answer:
          "Yes. A reviewer can leave issues before approving, and your workspace can record a new version when the changes are ready to check.",
      },
      {
        question: "Can I stop feedback after a deadline?",
        answer:
          "Yes. Project owners can pause or close guest feedback and show reviewers what happens next.",
      },
      {
        question: "Is Passoff only for design files?",
        answer:
          "No. Passoff is built for working websites. Short videos can be attached to issues as evidence.",
      },
    ],
  },
  {
    slug: "review-tool-for-agencies",
    eyebrow: "For web and creative agencies",
    title: "Client Review Tool for Web and Creative Agencies",
    description:
      "Give agency clients one simple place to review websites, while your workspace keeps issues, versions, and approvals organized.",
    keywords: [
      "client review tool for agencies",
      "agency feedback software",
      "creative agency approval tool",
      "website approval workflow",
    ],
    h1: "Keep client review moving—without becoming the feedback librarian.",
    lead:
      "Passoff helps agencies collect useful issues on real websites and finish with a clear approval on a recorded version. One tidy trail, from first look to handoff.",
    note: "Fewer follow-up pings. Fewer mystery screenshots. Far fewer tabs called FINAL-v7-use-this-one.",
    problem: {
      eyebrow: "Built for the messy middle",
      title: "Give clients a simple front door and your team a useful back room.",
      body:
        "Clients want to look at the work and respond. Your workspace needs locations, owners, statuses, versions, and decisions. Passoff keeps the client side light while quietly carrying the useful details behind it.",
      points: [
        {
          title: "A kinder client experience",
          body: "Guests get one clear link, familiar words, and an obvious next step—without a new account or tool tour.",
        },
        {
          title: "A cleaner team workflow",
          body: "Comments can be discussed, assigned, filtered, and moved through review without a manual feedback sheet.",
        },
        {
          title: "A stronger project finish",
          body: "Review history and approval stay with the work, making the handoff easier to explain and trust.",
        },
      ],
    },
    steps: [
      {
        title: "Set up the project",
        body: "Keep the website environments and reviews for one client together, with the right workspace members in the room.",
      },
      {
        title: "Open the review",
        body: "Share the current recorded version, set an optional deadline, and tell clients what deserves their attention.",
      },
      {
        title: "Turn comments into action",
        body: "Keep questions, replies, assignments, and progress attached to the feedback that started them.",
      },
      {
        title: "Invite the next look",
        body: "Show what changed, gather the final decision, and hand off the project without rewriting the whole story.",
      },
    ],
    payoff: {
      title: "Spend your time on the work, not herding the notes.",
      body:
        "Passoff gives account leads, designers, developers, editors, and clients a shared picture of what is happening now—and what needs to happen next.",
      items: [
        "Website review with optional video evidence",
        "Guest access designed for busy clients",
        "Visible status, ownership, and version-specific approvals",
        "A clear approval trail for a confident handoff",
      ],
    },
    faq: [
      {
        question: "Can an agency use Passoff for several clients?",
        answer:
          "Yes. Each client project can keep its reviews, people, feedback, and history separate, while your team works from one place.",
      },
      {
        question: "Will clients see internal team notes?",
        answer:
          "Passoff is designed to support private team replies, so your team can sort out the work without adding backstage chatter to the client view.",
      },
      {
        question: "Can we review both websites and videos?",
        answer:
          "Yes. The review details differ, but the overall rhythm stays familiar: share, comment, respond, revisit, and approve.",
      },
      {
        question: "Does every client reviewer need a paid seat?",
        answer:
          "No. Clients can join through a guest review link. They do not need to become members of your agency team just to leave feedback.",
      },
    ],
  },
];

export function getSeoPage(slug: string) {
  return seoPages.find((page) => page.slug === slug);
}
