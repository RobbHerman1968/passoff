export type VideoEventKind =
  | "ready"
  | "replaced"
  | "removed"
  /** Removed by the retention schedule after the issue stayed closed. */
  | "expired"
  /** A closed issue's clip is about to be removed. */
  | "expiring"
  | "needs_attention";

/** What leaves Passoff: counts and codes only, never ids from the provider or any link. */
export function safeVideoEventData(input: {
  kind: VideoEventKind;
  durationSeconds?: number | null;
  failureReason?: string | null;
  replacedPrevious?: boolean;
  retentionEndsAt?: Date | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = { kind: input.kind };
  if (input.durationSeconds != null && Number.isFinite(input.durationSeconds)) {
    data.durationSeconds = Math.round(input.durationSeconds);
  }
  if (input.failureReason) data.failureReason = input.failureReason;
  if (input.replacedPrevious) data.replacedPrevious = true;
  if (input.kind === "expired") data.reason = "retention_expired";
  if (input.kind === "expiring" && input.retentionEndsAt) {
    // A date only: enough to plan, nothing that identifies a person or a link.
    data.removalDate = input.retentionEndsAt.toISOString().slice(0, 10);
  }
  return data;
}
