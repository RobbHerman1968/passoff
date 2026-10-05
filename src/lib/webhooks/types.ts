export const WEBHOOK_SCHEMA_VERSION = "2026-10-04";

export const WEBHOOK_EVENT_TYPES = [
  "issue.created",
  "issue.updated",
  "issue.assigned",
  "issue.status_changed",
  "issue.comment_added",
  "issue.verification_recorded",
  "review.approval_recorded",
  "review.changes_requested",
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
  "review.approval_recorded": "Review approved",
  "review.changes_requested": "Changes requested",
};
