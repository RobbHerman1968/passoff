export const PROJECT_NOTICES = {
  "project-created": "Project created.",
  "project-renamed": "Project name updated.",
  "project-archived": "Project archived.",
  "project-restored": "Project restored.",
  "project-deleted": "Project deleted.",
  "website-review-added": "Website review added.",
  "review-renamed": "Review name updated.",
  "review-archived": "Review archived.",
  "review-restored": "Review restored.",
  "workspace-joined": "You joined the workspace.",
  "workspace-switched": "Workspace switched.",
  "workspace-left": "You left the workspace.",
  "workspace-deleted": "The workspace was deleted.",
} as const;

export type ProjectNoticeKey = keyof typeof PROJECT_NOTICES;

export function getNoticeMessage(key: string | undefined): string | null {
  if (!key) return null;
  if (key in PROJECT_NOTICES) {
    return PROJECT_NOTICES[key as ProjectNoticeKey];
  }
  return null;
}

export function withNotice(path: string, notice: ProjectNoticeKey): string {
  const url = new URL(path, "http://local.invalid");
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}
