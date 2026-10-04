export const HELP_TOPIC_IDS = [
  "projects-dashboard",
  "project-detail",
  "create-project",
  "add-review",
  "website-address",
  "website-review-detail",
  "website-setup",
  "workspace-plans",
] as const;

export type HelpTopicId = (typeof HELP_TOPIC_IDS)[number];

export type HelpTopic = {
  id: HelpTopicId;
  title: string;
  paragraphs: string[];
};

export const HELP_TOPICS: Record<HelpTopicId, HelpTopic> = {
  "projects-dashboard": {
    id: "projects-dashboard",
    title: "About projects",
    paragraphs: [
      "A project keeps website environments, reviews, and issues together for one body of work.",
      "Create one project for each client engagement, campaign, or website.",
      "Archived projects keep their history and can be restored later.",
    ],
  },
  "project-detail": {
    id: "project-detail",
    title: "About reviews",
    paragraphs: [
      "A review looks at a website environment and a recorded version.",
      "One project can contain multiple environments and reviews.",
      "Issues capture the feedback reviewers leave. Approval belongs to the recorded version, not the whole project.",
      "New reviews begin as Draft until they are opened.",
    ],
  },
  "create-project": {
    id: "create-project",
    title: "Why create a project?",
    paragraphs: [
      "Projects organize environments, reviews, issues, and approvals in one place.",
      "The project name is visible to workspace members and may later be visible to invited reviewers.",
      "The project name can be changed later.",
    ],
  },
  "add-review": {
    id: "add-review",
    title: "Adding a website review",
    paragraphs: [
      "Add a review when a website environment and version are ready for people to look at.",
      "Passoff records the website address as an environment and creates an initial version.",
      "Short videos can later be attached to an issue as evidence. They are not a separate review type.",
    ],
  },
  "website-address": {
    id: "website-address",
    title: "Why we need the website address",
    paragraphs: [
      "Passoff uses this address to identify the website environment being reviewed.",
      "The website origin helps prevent the review tools from running on an unexpected site.",
      "Passoff does not ask for website passwords, cookies, or authorization information.",
    ],
  },
  "website-review-detail": {
    id: "website-review-detail",
    title: "Setting up a website review",
    paragraphs: [
      "Passoff adds review tools to the real website instead of creating a proxy copy.",
      "Open Website setup to copy the install code for this environment.",
      "The script remains dormant unless a valid review session is active.",
      "Use Check installation after the code is live on the website.",
    ],
  },
  "website-setup": {
    id: "website-setup",
    title: "Installing Passoff on a website",
    paragraphs: [
      "Paste the install code near the end of your site’s shared layout, or just before the closing body tag, so it loads on every page you want reviewed.",
      "The installation key is safe to expose in public HTML. It only identifies this website environment. It is not a password, guest token, or reusable secret.",
      "After the script loads, Passoff stays visually dormant. Review controls appear only later when someone opens a valid shared review session.",
      "For frameworks and site builders, add the snippet once in the shared shell, theme footer, or global tag manager container that applies to the reviewed pages.",
      "After deploying, open the website, then return here and choose Check installation. Passoff records the first successful contact and later check-ins.",
      "Choose Disable Passoff if you need review tools to stop appearing. The script can remain installed without breaking the website, and you can enable it again later.",
      "If your site uses a Content Security Policy, allow scripts and connections from your Passoff embed host so the install script and verification request can run.",
      "If installation is not detected, confirm the tag is on the live page, clear cached deployments or tag-manager previews, and make sure the page origin matches the allowed origin shown in Website setup.",
    ],
  },
  "workspace-plans": {
    id: "workspace-plans",
    title: "Workspace plans and usage",
    paragraphs: [
      "You pay for workspace members who create projects, manage issues, and prepare work for verification. Guest reviewers are always free and unlimited.",
      "Studio includes 3 workspace members and 5 active review websites. Agency includes 6 workspace members and unlimited active review websites.",
      "Unlimited active review websites does not mean unlimited infrastructure usage. Video processing, storage, and playback, tracked pageviews, telemetry events, AI analyses, browser verification jobs, and proxy sessions and bandwidth share pooled workspace allowances.",
      "Passoff only shows an allowance after it has an approved value and enforcement behavior.",
      "Video is short evidence attached to an issue, not a separate review type. Agency currently has a video-evidence pilot. Free and Studio video-evidence limits are not published yet.",
      "Approvals belong to a recorded deployment or version. Issues and comments are unlimited on every plan.",
    ],
  },
};

export type HelpPageContext =
  | "projects-dashboard"
  | "project-detail"
  | "website-review-detail";

export function getHelpTopic(id: HelpTopicId): HelpTopic {
  return HELP_TOPICS[id];
}

export function isHelpTopicId(value: string): value is HelpTopicId {
  return (HELP_TOPIC_IDS as readonly string[]).includes(value);
}
