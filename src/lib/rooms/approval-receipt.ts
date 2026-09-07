/**
 * Approval receipt serialization.
 * Derived only from existing approval + revision + reviewer + asset records.
 * Does not invent a separate source of truth or claim legal e-signature status.
 */

export type ApprovalReceiptSource = {
  id: string;
  decision: string;
  acceptanceStatement: string;
  contentDigest: string;
  approvedAt: Date | string;
  supersededAt?: Date | string | null;
  projectName: string;
  clientName: string;
  revisionId: string;
  revisionNumber: number;
  reviewerName: string;
  reviewerEmail: string;
  assetNames: string[];
};

export type ApprovalReceiptView = {
  id: string;
  /** Short human-readable reference derived from the approval id (e.g. PO-A1B2C3D4). */
  referenceId: string;
  decision: "approved" | "changes_requested" | string;
  statusLabel: string;
  projectName: string;
  clientName: string;
  revisionNumber: number;
  revisionId: string;
  reviewerName: string;
  /** Omitted when includeReviewerEmail is false. */
  reviewerEmail: string | null;
  approvedAt: string;
  acceptanceStatement: string;
  contentDigest: string;
  digestShort: string;
  assetNames: string[];
  assetCount: number;
  supersededAt: string | null;
  /** Fixed copy flag for UI — approval is bound to this frozen revision digest. */
  boundToFrozenRevision: true;
};

export function formatApprovalReferenceId(approvalId: string): string {
  const compact = approvalId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `PO-${compact || "UNKNOWN"}`;
}

export function shortenDigest(digest: string, length = 12): string {
  const clean = digest.trim();
  if (clean.length <= length) return clean;
  return `${clean.slice(0, length)}…`;
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function statusLabelFor(decision: string): string {
  if (decision === "approved") return "Approved";
  if (decision === "changes_requested") return "Changes requested";
  return decision.replace(/_/g, " ");
}

/**
 * Serialize an approval into a stable receipt view for owner room and client share.
 */
export function serializeApprovalReceipt(
  source: ApprovalReceiptSource,
  options?: { includeReviewerEmail?: boolean },
): ApprovalReceiptView {
  const includeEmail = options?.includeReviewerEmail !== false;
  const assetNames = source.assetNames.map((name) => name.trim()).filter(Boolean);

  return {
    id: source.id,
    referenceId: formatApprovalReferenceId(source.id),
    decision: source.decision,
    statusLabel: statusLabelFor(source.decision),
    projectName: source.projectName,
    clientName: source.clientName,
    revisionNumber: source.revisionNumber,
    revisionId: source.revisionId,
    reviewerName: source.reviewerName.trim() || "Reviewer",
    reviewerEmail: includeEmail ? source.reviewerEmail.trim() || null : null,
    approvedAt: toIso(source.approvedAt),
    acceptanceStatement: source.acceptanceStatement,
    contentDigest: source.contentDigest,
    digestShort: shortenDigest(source.contentDigest),
    assetNames,
    assetCount: assetNames.length,
    supersededAt: source.supersededAt ? toIso(source.supersededAt) : null,
    boundToFrozenRevision: true,
  };
}

/** Public-safe receipt: never exposes reviewer email from a share token alone. */
export function serializePublicApprovalReceipt(source: ApprovalReceiptSource): ApprovalReceiptView {
  return serializeApprovalReceipt(source, { includeReviewerEmail: false });
}
