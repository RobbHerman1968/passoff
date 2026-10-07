export const NOTIFICATION_TYPES = [
  "issue.assigned",
  "issue.comment_replied",
  "issue.mentioned",
  "issue.status_changed",
  "issue.ready_for_verification",
  "issue.verification_failed",
  "issue.verification_passed",
  "issue.video_ready",
  "issue.video_needs_attention",
  "issue.video_retention_warning",
  "review.ready_for_approval",
  "review.approved",
  "review.changes_requested",
  "review.deadline_reminder",
  "review.approval_requested",
  "review.approval_reminder",
  "review.approval_cancelled",
  "review.approval_superseded",
  "review.deployment_after_approval",
  "behavioral.finding_attached",
  "behavioral.comparison_ready",
  "behavioral.analysis_failed",
  "verification_run.failed",
  "verification_run.uncertain",
  "workspace.member_joined",
  "workspace.member_left",
  "workspace.ownership_transferred",
  "billing.plan_started",
  "billing.plan_changed",
  "billing.trial_ending",
  "billing.payment_failed",
  "billing.payment_recovered",
  "billing.payment_lapsed",
  "billing.subscription_ended",
  "billing.usage_warning",
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
  /** ISO time a closed issue's video will be removed (retention warnings). */
  retentionEndsAt?: string;
  /** ISO time of the feedback deadline (deadline reminders). */
  deadlineAt?: string;
  deadlineState?: "upcoming" | "past_due";
  /** Billing notices. Never contain card details, invoice links, or provider ids. */
  planName?: string;
  /** ISO time a trial ends. */
  trialEndsAt?: string;
  /** ISO time paid access moves to the Free plan if payment is not fixed. */
  graceEndsAt?: string;
  /** What is running low, e.g. "Active review websites". */
  usageLabel?: string;
  usageUsed?: number;
  usageLimit?: number;
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
    case "verification_run.failed":
    case "verification_run.uncertain":
      return "verification";
    case "review.ready_for_approval":
    case "review.changes_requested":
    case "review.deadline_reminder":
    case "review.approval_requested":
    case "review.approval_reminder":
    case "review.approval_cancelled":
    case "review.approval_superseded":
    case "review.deployment_after_approval":
      return "approval";
    case "behavioral.finding_attached":
      return "assignments";
    default:
      return null;
  }
}

/**
 * Billing notices go to workspace owners and are always emailed: a missed payment or an
 * ending trial is not something to hide behind a notification preference.
 */
export function isEssentialEmailType(type: NotificationType): boolean {
  return type.startsWith("billing.");
}

export function shouldEmailNotification(type: NotificationType): boolean {
  return isEssentialEmailType(type) || emailCategoryForType(type) !== null;
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
    case "issue.video_ready":
      return {
        title: `The video for ${issueLabel} is ready to watch.`,
        description: context,
        action: { label: "Watch video", href: hrefPath },
      };
    case "issue.video_needs_attention":
      return {
        title: `The video for ${issueLabel} couldn’t be used.`,
        description: context ? `${context} · Upload a different video to try again.` : "Upload a different video to try again.",
        action: { label: "View issue", href: hrefPath },
      };
    case "issue.video_retention_warning": {
      const when = data.retentionEndsAt ? formatReminderDate(data.retentionEndsAt) : null;
      return {
        title: when
          ? `The video for ${issueLabel} will be removed on ${when}.`
          : `The video for ${issueLabel} will be removed soon.`,
        description: context
          ? `${context} · Reopen the issue to keep it.`
          : "Reopen the issue to keep it.",
        action: { label: "View issue", href: hrefPath },
      };
    }
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
    case "review.deadline_reminder": {
      const when = data.deadlineAt ? formatReminderDeadline(data.deadlineAt) : null;
      const pastDue = data.deadlineState === "past_due";
      return {
        title: pastDue
          ? `The feedback deadline for ${data.reviewName} has passed.`
          : `Feedback for ${data.reviewName} is due soon.`,
        description: [when ? `${pastDue ? "Was due" : "Due"} ${when}` : "", data.projectName]
          .filter(Boolean)
          .join(" · "),
        action: { label: "View review", href: hrefPath },
      };
    }
    case "review.approval_requested":
      return {
        title: `${data.actorName} asked for approval on ${data.versionLabel ?? "this version"}.`,
        description: data.reviewName,
        action: { label: "Review deployment", href: hrefPath },
      };
    case "review.approval_reminder":
      return {
        title: `Reminder: approval is still waiting for ${data.reviewName}.`,
        description: data.projectName,
        action: { label: "Review deployment", href: hrefPath },
      };
    case "review.approval_cancelled":
      return {
        title: `An approval request for ${data.reviewName} was cancelled.`,
        description: data.projectName,
        action: { label: "Open review", href: hrefPath },
      };
    case "review.approval_superseded":
      return {
        title: `A newer approval request replaced the previous one for ${data.reviewName}.`,
        description: data.projectName,
        action: { label: "Open review", href: hrefPath },
      };
    case "review.deployment_after_approval":
      return {
        title: `A new version was recorded after approval on ${data.reviewName}.`,
        description: data.versionLabel
          ? `Previous approval covered ${data.versionLabel}.`
          : data.projectName,
        action: { label: "Open review", href: hrefPath },
      };
    case "behavioral.finding_attached":
      return {
        title: `Production behavior was attached to ${issueLabel}.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "behavioral.comparison_ready":
      return {
        title: `A before-and-after comparison is ready for ${issueLabel}.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "behavioral.analysis_failed":
      return {
        title: "Assisted analysis didn’t finish.",
        description: "You can retry, or use the recorded evidence.",
        action: { label: "View finding", href: hrefPath },
      };
    case "verification_run.failed":
      return {
        title: `${issueLabel} browser checks found a problem.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "verification_run.uncertain":
      return {
        title: `${issueLabel} browser checks need a person to look.`,
        description: context,
        action: { label: "View issue", href: hrefPath },
      };
    case "workspace.member_joined":
      return {
        title: `${data.actorName} joined ${data.workspaceName}.`,
        description: "They can now work on projects and reviews.",
        action: { label: "View members", href: hrefPath },
      };
    case "workspace.member_left":
      return {
        title: `${data.actorName} left ${data.workspaceName}.`,
        description: "Their earlier comments and history stay in place.",
        action: { label: "View members", href: hrefPath },
      };
    case "workspace.ownership_transferred":
      return {
        title: `${data.actorName} made you the owner of ${data.workspaceName}.`,
        description: "You can now manage members, invitations, and workspace settings.",
        action: { label: "View members", href: hrefPath },
      };
    case "billing.plan_started": {
      const plan = data.planName ?? "your new";
      return {
        title: `${data.workspaceName} is now on the ${plan} plan.`,
        description: "Your new limits are active. Nothing about your existing work changed.",
        action: { label: "View billing", href: hrefPath },
      };
    }
    case "billing.plan_changed": {
      const plan = data.planName ?? "a new";
      return {
        title: `${data.workspaceName} moved to the ${plan} plan.`,
        description:
          "Your work stays exactly as it is. If you are over a limit, you can keep working and only new additions are paused.",
        action: { label: "View billing", href: hrefPath },
      };
    }
    case "billing.trial_ending": {
      const when = data.trialEndsAt ? formatReminderDate(data.trialEndsAt) : null;
      return {
        title: when
          ? `Your Agency trial ends on ${when}.`
          : "Your Agency trial ends soon.",
        description:
          "Add payment details to keep Agency. If you do nothing, the workspace moves to Free and all of your work stays safe.",
        action: { label: "Manage billing", href: hrefPath },
      };
    }
    case "billing.payment_failed": {
      const until = data.graceEndsAt ? formatReminderDate(data.graceEndsAt) : null;
      return {
        title: "We couldn’t take your latest payment.",
        description: until
          ? `Update your payment details by ${until} to keep ${data.planName ?? "your plan"}. Nothing has been removed.`
          : "Update your payment details to keep your plan. Nothing has been removed.",
        action: { label: "Update payment details", href: hrefPath },
      };
    }
    case "billing.payment_recovered":
      return {
        title: "Payment received. Thank you.",
        description: `${data.workspaceName} is fully back on the ${data.planName ?? "paid"} plan.`,
        action: { label: "View billing", href: hrefPath },
      };
    case "billing.payment_lapsed":
      return {
        title: `${data.workspaceName} is now using Free limits.`,
        description:
          "We couldn’t collect payment in time. All of your work is kept. Update your payment details to restore your plan.",
        action: { label: "Update payment details", href: hrefPath },
      };
    case "billing.subscription_ended":
      return {
        title: `Your ${data.planName ?? "paid"} plan has ended.`,
        description:
          "The workspace is on Free now. Your projects, reviews, and issues are all still here.",
        action: { label: "View plans", href: hrefPath },
      };
    case "billing.usage_warning": {
      const label = data.usageLabel ?? "A plan limit";
      const used = data.usageUsed ?? 0;
      const limit = data.usageLimit ?? 0;
      const reached = limit > 0 && used >= limit;
      return {
        title: reached
          ? `${label} is full on the ${data.planName ?? "current"} plan.`
          : `${label} is almost full on the ${data.planName ?? "current"} plan.`,
        description: `${used} of ${limit} used. ${reached ? "Only new additions are paused; everything you have keeps working." : "You can keep working. Plan ahead if you need more room."}`,
        action: { label: "View plans", href: hrefPath },
      };
    }
  }
}

/** A calendar date, fixed to UTC so the app reads the same everywhere. */
export function formatReminderDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Fixed to UTC so emails and the app read the same everywhere. */
export function formatReminderDeadline(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
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
