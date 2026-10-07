export const WEBHOOK_SCHEMA_VERSION = "2026-10-05";

export const WEBHOOK_EVENT_TYPES = [
  "issue.created",
  "issue.updated",
  "issue.assigned",
  "issue.status_changed",
  "issue.comment_added",
  "issue.verification_recorded",
  "issue.video_ready",
  "issue.video_replaced",
  "issue.video_removed",
  "issue.video_failed",
  "issue.video_note_added",
  "issue.video_expiring",
  "review.approval_recorded",
  "review.approval_requested",
  "review.approved",
  "review.changes_requested",
  "review.approval_cancelled",
  "review.approval_superseded",
  "behavioral_finding.created",
  "behavioral_finding.attached",
  "behavioral_comparison.ready",
  "verification_run.completed",
  "verification_run.failed",
  "verification_run.uncertain",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export type WebhookActor = {
  type: "user" | "guest" | "system";
  name: string;
};

export type WebhookEnvelope = {
  eventId: string;
  eventType: WebhookEventType;
  schemaVersion: typeof WEBHOOK_SCHEMA_VERSION;
  occurredAt: string;
  workspaceId: string;
  projectId: string | null;
  reviewId: string | null;
  issueId: string | null;
  issueNumber: number | null;
  actor: WebhookActor | null;
  data: Record<string, unknown>;
};

export const WEBHOOK_MAX_ATTEMPTS = 8;
export const WEBHOOK_REQUEST_TIMEOUT_MS = 10_000;
export const WEBHOOK_STALE_CLAIM_MS = 5 * 60_000;
export const WEBHOOK_RETENTION_DAYS = 30;
export const WEBHOOK_TEST_RATE_LIMIT = 5;
export const WEBHOOK_TEST_RATE_WINDOW_MS = 10 * 60_000;

export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  "issue.created": "Issue created",
  "issue.updated": "Issue updated",
  "issue.assigned": "Issue assigned",
  "issue.status_changed": "Issue status changed",
  "issue.comment_added": "Public comment added",
  "issue.verification_recorded": "Verification recorded",
  "issue.video_ready": "Video evidence ready",
  "issue.video_replaced": "Video evidence replaced",
  "issue.video_removed": "Video evidence removed",
  "issue.video_failed": "Video evidence needs attention",
  "issue.video_note_added": "Public video note added",
  "issue.video_expiring": "Video evidence will be removed soon",
  "review.approval_recorded": "Review approved",
  "review.approval_requested": "Approval requested",
  "review.approved": "Review approved",
  "review.changes_requested": "Changes requested",
  "review.approval_cancelled": "Approval request cancelled",
  "review.approval_superseded": "Approval request superseded",
  "behavioral_finding.created": "Usability finding created",
  "behavioral_finding.attached": "Usability finding attached to an issue",
  "behavioral_comparison.ready": "Usability comparison ready",
  "verification_run.completed": "Browser check completed",
  "verification_run.failed": "Browser check failed",
  "verification_run.uncertain": "Browser check needs a person",
};
