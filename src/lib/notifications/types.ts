export const NOTIFICATION_TYPES = [
  "issue.assigned",
  "issue.comment_replied",
  "issue.mentioned",
  "issue.status_changed",
  "issue.ready_for_verification",
  "issue.verification_failed",
  "issue.verification_passed",
  "review.ready_for_approval",
  "review.approved",
  "review.changes_requested",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationEmailCategory =
  | "assignments"
  | "replies"
  | "verification"
  | "approval";

export type NotificationAction = {
  label: string;
  href: string;
};

export type NotificationCopy = {
  title: string;
  description: string;
  action: NotificationAction;
};

export type NotificationPayload = {
  workspaceName: string;
  projectName: string;
  reviewName: string;
  actorName: string;
  issueNumber?: number;
  versionLabel?: string;
};

export type NotificationListItem = {
  id: string;
  type: NotificationType;
  hrefPath: string;
  createdAt: Date;
  readAt: Date | null;
  data: NotificationPayload;
};

export type UserNotificationSettings = {
  emailAssignments: boolean;
  emailReplies: boolean;
  emailVerification: boolean;
  emailApproval: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: UserNotificationSettings = {
  emailAssignments: true,
  emailReplies: true,
  emailVerification: true,
  emailApproval: true,
};

export function emailCategoryForType(
  type: NotificationType,
): NotificationEmailCategory | null {
  switch (type) {
    case "issue.assigned":
      return "assignments";
    case "issue.comment_replied":
    case "issue.mentioned":
      return "replies";
    case "issue.ready_for_verification":
    case "issue.verification_failed":
      return "verification";
    case "review.ready_for_approval":
    case "review.changes_requested":
      return "approval";
    default:
      return null;
  }
}

export function shouldEmailNotification(type: NotificationType): boolean {
  return emailCategoryForType(type) !== null;
}

export function emailEnabledForCategory(
  settings: UserNotificationSettings,
  category: NotificationEmailCategory,
): boolean {
  if (category === "assignments") return settings.emailAssignments;
  if (category === "replies") return settings.emailReplies;
  if (category === "verification") return settings.emailVerification;
  return settings.emailApproval;
}

export function notificationCopy(
  type: NotificationType,
  data: NotificationPayload,
  hrefPath: string,
): NotificationCopy {
  const issueLabel =
    typeof data.issueNumber === "number" ? `Issue #${data.issueNumber}` : "An issue";
  const context = [data.projectName, data.reviewName].filter(Boolean).join(" · ");

  switch (type) {
    case "issue.assigned":
      return {
        title: `${issueLabel} was assigned to you.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.comment_replied":
      return {
        title: `${data.actorName} replied to your feedback.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.mentioned":
      return {
        title: `${data.actorName} mentioned you.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.status_changed":
      return {
        title: `${issueLabel} changed status.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.ready_for_verification":
      return {
        title: `${issueLabel} is ready for verification.`,
        description: context,
        action: { label: "Verify fix", href: hrefPath },
      };
    case "issue.verification_failed":
      return {
        title: "The latest fix did not pass verification.",
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.verification_passed":
      return {
        title: `${issueLabel} passed verification.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "review.ready_for_approval":
      return {
        title: `${data.reviewName} is ready for approval.`,
        description: data.projectName,
        action: { label: "Review deployment", href: hrefPath },
      };
    case "review.approved":
      return {
        title: `${data.actorName} approved the ${data.versionLabel ?? "latest"} deployment.`,
        description: data.reviewName,
        action: { label: "Review deployment", href: hrefPath },
      };
    case "review.changes_requested":
      return {
        title: `${data.actorName} requested changes to the ${data.versionLabel ?? "latest"} deployment.`,
        description: data.reviewName,
        action: { label: "Review deployment", href: hrefPath },
      };
  }
}

export function formatUnreadCount(count: number): string {
  if (count <= 0) return "";
  if (count > 99) return "99+";
  return String(count);
}

export function notificationsBellLabel(count: number): string {
  if (count <= 0) return "Notifications";
  if (count === 1) return "Notifications, 1 unread";
  if (count > 99) return "Notifications, 99+ unread";
  return `Notifications, ${count} unread`;
}
