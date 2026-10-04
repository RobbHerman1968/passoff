export type ComparisonPage = {
  slug: string;
  competitor: string;
  competitorUrl: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  shortAnswer: string;
  checkedOn: string;
  bestFor: {
    passoff: string;
    competitor: string;
  };
  rows: {
    topic: string;
    passoff: string;
    competitor: string;
  }[];
  choosePassoff: string[];
  chooseCompetitor: string[];
  verdict: string;
  faq: { question: string; answer: string }[];
  sources: { label: string; href: string }[];
};

export const comparisonPages: ComparisonPage[] = [
  {
    slug: "passoff-vs-pastel",
    competitor: "Pastel",
    competitorUrl: "https://usepastel.com/",
    title: "Passoff vs Pastel: Which Feedback Tool Fits Your Work?",
    description:
      "Compare Passoff and Pastel for website feedback, video review, guest access, approvals, and the way each tool shows a website.",
    h1: "Passoff vs Pastel: two clear paths out of feedback fog.",
    lead:
      "Both tools help clients point at creative work and leave useful comments. The biggest difference is how website review reaches the page—and how closely the tool is shaped around website and video approval.",
    shortAnswer:
      "Choose Passoff when you want review tools placed on a website you control, including signed-in or session-specific pages, plus one familiar flow for website and video approval. Choose Pastel when you want a mature, broad visual-feedback tool for websites and several uploaded file types without installing anything on the reviewed site.",
    checkedOn: "October 3, 2026",
    bestFor: {
      passoff:
        "Agencies and product teams reviewing real websites and videos, especially staged, dynamic, or signed-in experiences.",
      competitor:
        "Teams that want a broad visual canvas for websites, images, PDFs, videos, emails, and other creative files.",
    },
    rows: [
      {
        topic: "Website review",
        passoff:
          "A small embed adds review tools to the real website when an active review is open.",
        competitor:
          "Pastel creates a canvas and says it layers comments on the live website through its custom proxy technology.",
      },
      {
        topic: "Signed-in experiences",
        passoff:
          "Built for logged-in, staged, dynamic, and session-specific pages because the review happens on the customer’s site.",
        competitor:
          "Pastel promotes URL-based website canvases without installation. Confirm fit with Pastel for protected or highly session-specific flows.",
      },
      {
        topic: "Kinds of work",
        passoff:
          "Focused on working websites and uploaded videos.",
        competitor:
          "Pastel advertises websites, images, PDFs, videos, emails, and other creative files.",
      },
      {
        topic: "Guest review",
        passoff:
          "Guests can open a shared review and leave feedback without creating an account.",
        competitor:
          "Pastel advertises unlimited guests and no login for reviewers.",
      },
      {
        topic: "Review control",
        passoff:
          "Review rounds, visible statuses, feedback deadlines, paused feedback, another-look requests, and approval keep the next step plain.",
        competitor:
          "Pastel advertises versions, approvals, deadlines, reminders, comment labels, assignments, and paused commenting.",
      },
      {
        topic: "Broader workflow",
        passoff:
          "Keeps website and video feedback in the same client-friendly approval rhythm, with developer context available behind the scenes.",
        competitor:
          "Pastel advertises project-management exports and integrations, responsive testing, copy editing, and AI-agent workflows.",
      },
    ],
    choosePassoff: [
      "You want feedback on the real website rather than a separate proxy canvas.",
      "Your reviewers need to move through signed-in or session-specific pages.",
      "Your agency reviews both websites and videos and wants one clear approval rhythm.",
      "You want technical context available to the team without crowding the client experience.",
    ],
    chooseCompetitor: [
      "You need feedback on PDFs, images, emails, or other file types beyond websites and videos.",
      "You prefer URL-based setup without placing an embed on the reviewed website.",
      "You need Pastel’s currently advertised integrations, responsive tester, or AI-agent workflow.",
      "Your team already uses Pastel and its broader canvas model fits the work well.",
    ],
    verdict:
      "Pastel is the broader visual-feedback toolbox today. Passoff is the more focused choice for teams that want the review to live on the real website, carry useful technical context, and follow the same calm path through video feedback and client approval.",
    faq: [
      {
        question: "Is Passoff a Pastel alternative?",
        answer:
          "Yes, for teams reviewing websites and videos. It is not a like-for-like replacement when you also need PDF, image, email, or other creative-file review.",
      },
      {
        question: "What is the biggest difference between Passoff and Pastel?",
        answer:
          "Passoff uses an embed on a website the customer controls. Pastel says it layers comments on a live website through a custom proxy. That difference matters most for staged, dynamic, and signed-in experiences.",
      },
      {
        question: "Do client reviewers need an account in either tool?",
        answer:
          "No. Passoff is designed for guest review links without a required account, and Pastel publicly advertises no-login guest reviewing.",
      },
    ],
    sources: [
      { label: "Pastel features", href: "https://usepastel.com/features" },
      { label: "Pastel plans and product details", href: "https://usepastel.com/plans" },
      { label: "Pastel FAQ", href: "https://usepastel.com/faq" },
    ],
  },
  {
    slug: "passoff-vs-marker-io",
    competitor: "Marker.io",
    competitorUrl: "https://marker.io/",
    title: "Passoff vs Marker.io: Client Review or Website Bug Reporting?",
    description:
      "Compare Passoff and Marker.io for website feedback, technical context, client approval, video review, integrations, and guest access.",
    h1: "Passoff vs Marker.io: client review meets website issue reporting.",
    lead:
      "These tools overlap on clear, on-page website feedback. Their centers of gravity are different: Passoff follows client work through review and approval, while Marker.io leans deeply into bug reporting and connected development workflows.",
    shortAnswer:
      "Choose Passoff when the main job is showing clients websites and videos, working through feedback, and recording approval. Choose Marker.io when the main job is capturing reproducible website issues—with screenshots, session replay, technical details, and two-way links to project-management tools.",
    checkedOn: "October 3, 2026",
    bestFor: {
      passoff:
        "Agencies that want one welcoming client-review and approval flow for websites and videos.",
      competitor:
        "Web, QA, product, and development teams that want detailed issue capture routed into an existing work tracker.",
    },
    rows: [
      {
        topic: "Main job",
        passoff:
          "Client review, discussion, another-look rounds, approval, and handoff for websites and videos.",
        competitor:
          "Website feedback and bug reporting with detailed evidence for the teams fixing the issue.",
      },
      {
        topic: "Website setup",
        passoff:
          "A small embed on a site the customer controls adds review tools only during a valid review session.",
        competitor:
          "Marker.io offers an installed widget and a browser extension for reporting from live, staging, and test sites.",
      },
      {
        topic: "Captured context",
        passoff:
          "Page, selected element, nearby text, location clues, viewport, browser, operating system, and available build details.",
        competitor:
          "Marker.io advertises screenshots, annotations, session replay, console logs, browser, screen size, page URL, and custom environment data.",
      },
      {
        topic: "Where work continues",
        passoff:
          "Feedback can be discussed, assigned, organized, revisited, and approved inside the review workflow.",
        competitor:
          "Reports can sync with tools such as Jira, Linear, ClickUp, GitHub, Azure DevOps, and others.",
      },
      {
        topic: "Client approval",
        passoff:
          "Approval is a central part of the review-round flow and stays attached to the version shown.",
        competitor:
          "Marker.io’s public positioning centers on collecting, routing, reproducing, and resolving website issues.",
      },
      {
        topic: "Video review",
        passoff:
          "Uploaded videos use the same guest review, discussion, round, and approval rhythm as websites.",
        competitor:
          "Marker.io advertises session replay and screen recording for website issue context rather than uploaded creative-video approval.",
      },
    ],
    choosePassoff: [
      "Clients need a gentle review experience rather than a bug-reporting form.",
      "Approvals tied to a recorded version are part of the work, not an extra step elsewhere.",
      "You want website and uploaded-video review to feel consistent.",
      "Your client should see plain language while your team keeps the technical clues.",
    ],
    chooseCompetitor: [
      "Session replay, annotated screenshots, and console logs are central to how your team reproduces issues.",
      "Reports must flow directly into Jira, Linear, ClickUp, GitHub, or another supported tracker.",
      "Your workflow is led by QA, product, development, or WebOps rather than client approval.",
      "You need the broader enterprise controls Marker.io currently advertises.",
    ],
    verdict:
      "Marker.io is the stronger fit when a website comment should become a richly documented work item in another system. Passoff is the cleaner fit when that comment belongs to a client review story that ends with another look, approval, and handoff—and may include video too.",
    faq: [
      {
        question: "Is Passoff a Marker.io alternative?",
        answer:
          "Yes, when the goal is client website feedback and approval. It is not meant to out-Marker Marker.io’s deeper session replay, screenshot annotation, and issue-tracker integration workflow.",
      },
      {
        question: "Do both tools collect technical website details?",
        answer:
          "Yes. Both aim to save the team from asking basic follow-up questions. The exact evidence differs, and Marker.io publicly emphasizes screenshots, replay, console logs, and connected issue tracking.",
      },
      {
        question: "Which tool is simpler for a client?",
        answer:
          "Passoff is deliberately shaped around a lightweight client review and approval path. Marker.io also offers guest access, but its wider product story is more strongly oriented toward structured website issue reporting.",
      },
    ],
    sources: [
      {
        label: "Marker.io website design feedback",
        href: "https://marker.io/website-design-feedback",
      },
      {
        label: "Marker.io website review tool",
        href: "https://marker.io/website-review-tool",
      },
    ],
  },
  {
    slug: "passoff-vs-frame-io",
    competitor: "Frame.io",
    competitorUrl: "https://frame.io/",
    title: "Passoff vs Frame.io: Simple Client Review or Pro Video Workflow?",
    description:
      "Compare Passoff and Frame.io for video comments, versions, client review, editor integrations, website feedback, and approvals.",
    h1: "Passoff vs Frame.io: a tidy client pass or a deep video bench?",
    lead:
      "Both tools can help a team move from video comments to a decision. Frame.io is built deep into professional media workflows. Passoff treats video as short issue evidence beside website review.",
    shortAnswer:
      "Choose Passoff when your agency needs an easy client-review flow for websites, with optional video evidence on issues. Choose Frame.io when video is the main event and your team needs deeper media collaboration, high-volume transfer, side-by-side version comparison, and editing-tool integrations.",
    checkedOn: "October 3, 2026",
    bestFor: {
      passoff:
        "Web and creative agencies that want simple guest feedback and approval across both websites and videos.",
      competitor:
        "Professional video, film, and media teams working deeply inside editing and production workflows.",
    },
    rows: [
      {
        topic: "Main job",
        passoff:
          "A shared client-review and approval rhythm for websites and uploaded videos.",
        competitor:
          "Professional media sharing, review, collaboration, versioning, transfer, and editing-workflow integration.",
      },
      {
        topic: "Video feedback",
        passoff:
          "Time-stamped comments, replies, statuses, and version-specific approvals keep the client conversation together.",
        competitor:
          "Frame.io advertises comments on clips, on-frame drawing, real-time collaboration, and version comparison.",
      },
      {
        topic: "Editing tools",
        passoff:
          "The MVP keeps review in the browser and does not claim deep editing-suite integrations.",
        competitor:
          "Frame.io advertises integrations with Adobe Premiere Pro, Final Cut Pro, and other professional workflows.",
      },
      {
        topic: "Website feedback",
        passoff:
          "Clients can also leave feedback on real, staged, dynamic, and signed-in websites through the Passoff embed.",
        competitor:
          "Frame.io’s public product focus is video, image, audio, and broader media workflows—not on-page website review.",
      },
      {
        topic: "Client experience",
        passoff:
          "One guest-friendly flow uses plain language across website and video projects, with approval kept close to the work.",
        competitor:
          "Review links help stakeholders comment and make decisions while the production team retains a deeper media workspace.",
      },
      {
        topic: "Workflow depth",
        passoff:
          "Purposefully narrower: review the work, discuss it, ask for another look, approve it, and hand it off.",
        competitor:
          "Purposefully deeper: media organization, transfer, version comparison, editor integrations, and production collaboration.",
      },
    ],
    choosePassoff: [
      "Your agency delivers websites and videos and wants one client-facing review habit.",
      "Reviewers need a simple browser experience with as little homework as possible.",
      "The final approval and handoff matter more than deep editing-tool integration.",
      "Your video workflow is straightforward enough that a professional media platform would feel like extra luggage.",
    ],
    chooseCompetitor: [
      "Video production is the heart of your work rather than one service among several.",
      "Editors need comments and markers close to Premiere Pro or Final Cut Pro.",
      "Your team needs high-volume media transfer, deeper asset organization, or advanced version comparison.",
      "You collaborate across a large professional production pipeline.",
    ],
    verdict:
      "Frame.io is the stronger video-production platform. Passoff is the simpler agency review room when video sits beside website work and the goal is to help a client comment, revisit, approve, and move on without learning a production system.",
    faq: [
      {
        question: "Is Passoff a Frame.io replacement?",
        answer:
          "Not for a deep professional video-production workflow. Passoff is for website review, with short video clips as issue evidence.",
      },
      {
        question: "Can both tools collect comments at a specific video time?",
        answer:
          "Yes. Both support feedback connected to a video moment. Frame.io goes further into editor integrations and professional media collaboration.",
      },
      {
        question: "Which one handles website feedback?",
        answer:
          "Passoff is specifically designed to add review tools to real websites. Frame.io’s public product focus is professional media review and collaboration.",
      },
    ],
    sources: [
      {
        label: "Frame.io product overview",
        href: "https://frame.io/",
      },
      {
        label: "Frame.io V4 feature comparison",
        href: "https://help.frame.io/en/articles/9084073-frame-io-v4-legacy-feature-comparison",
      },
      {
        label: "Frame.io V4 comparison viewer",
        href: "https://help.frame.io/en/articles/9952618-comparison-viewer",
      },
      {
        label: "Frame.io Transfer for V4",
        href: "https://help.frame.io/en/articles/3978929-frame-io-transfer-download-and-upload-files-folders-and-projects-on-your-desktop",
      },
    ],
  },
];

export function getComparisonPage(slug: string) {
  return comparisonPages.find((page) => page.slug === slug);
}
