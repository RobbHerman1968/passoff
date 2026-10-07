import {
  ISSUE_CLOSURE_REASON_LABELS,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  type IssueClosureReason,
  type IssuePriority,
  type IssueStatus,
} from "@/lib/issues/statuses";
import type { IssueListFilters } from "@/lib/issues/schemas";

/** Maximum issues in one synchronous export. Narrow filters if this is exceeded. */
export const ISSUE_EXPORT_MAX = 500;

export const ISSUE_EXPORT_COLUMNS = [
  "Issue number",
  "Title",
  "Original feedback",
  "Status",
  "Closure reason",
  "Priority",
  "Labels",
  "Assignee",
  "Reporter",
  "Page title",
  "Page URL",
  "Route",
  "Environment",
  "Recorded version",
  "Created",
  "Updated",
  "Public replies",
  "Latest verification",
  "Latest verification time",
  "Latest browser check",
  "Behavioral evidence",
  "Video evidence",
  "Passoff link",
  "Review approval",
] as const;

export type IssueExportRow = {
  number: number;
  title: string;
  body: string;
  status: IssueStatus;
  closureReason: IssueClosureReason | null;
  priority: IssuePriority;
  /** Label names, sorted. Labels are internal and only appear in member exports. */
  labels: string[];
  assigneeDisplayName: string;
  reporterDisplayName: string;
  pageTitle: string | null;
  pageUrl: string | null;
  route: string | null;
  environmentName: string;
  versionLabel: string;
  createdAt: Date;
  updatedAt: Date;
  publicReplyCount: number;
  publicReplies: Array<{ author: string; body: string; createdAt: Date }>;
  latestVerificationOutcome: string | null;
  latestVerificationAt: Date | null;
  latestBrowserCheckSummary: string;
  behavioralEvidenceSummary: string;
  /**
   * Plain sentence saying whether a watchable video is attached. Never a playback address
   * or token: video is only available by signing in to the issue.
   */
  videoEvidenceSummary: string;
  issueHref: string;
  /** Plain-language approval status for the review’s current version. */
  approvalStatus?: string;
};

/** Review-level approval details shown once at the top of a Markdown export. */
export type IssueExportApproval = {
  /** For example “Approved for October 4” or “Approval not requested”. */
  statusLabel: string;
  /** Who decided and when, when a decision exists. */
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
  /** True when the latest approval belongs to an older version than the review’s. */
  historical: boolean;
};

export type IssueExportMeta = {
  reviewName: string;
  environmentName: string;
  versionLabel: string;
  exportedAt: Date;
  filters: IssueListFilters;
  includeReplies: boolean;
  approval?: IssueExportApproval | null;
};

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function protectSpreadsheetValue(value: string): string {
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }
  return value;
}

export function csvCell(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const protectedValue = protectSpreadsheetValue(raw);
  if (/[",\n\r]/.test(protectedValue)) {
    return `"${protectedValue.replaceAll('"', '""')}"`;
  }
  return protectedValue;
}

export function toCsv(rows: IssueExportRow[]): string {
  const header = ISSUE_EXPORT_COLUMNS.map(csvCell).join(",");
  const lines = rows.map((row) =>
    [
      row.number,
      row.title,
      row.body,
      ISSUE_STATUS_LABELS[row.status],
      row.closureReason ? ISSUE_CLOSURE_REASON_LABELS[row.closureReason] : "",
      ISSUE_PRIORITY_LABELS[row.priority],
      row.labels.join("; "),
      row.assigneeDisplayName,
      row.reporterDisplayName,
      row.pageTitle,
      row.pageUrl,
      row.route,
      row.environmentName,
      row.versionLabel,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
      row.publicReplyCount,
      row.latestVerificationOutcome ?? "",
      row.latestVerificationAt?.toISOString() ?? "",
      row.latestBrowserCheckSummary,
      row.behavioralEvidenceSummary,
      row.videoEvidenceSummary,
      row.issueHref,
      row.approvalStatus ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header, ...lines].join("\r\n")}\r\n`;
}

export function summarizeFilters(filters: IssueListFilters): string {
  const parts: string[] = [];
  if (filters.show === "active") parts.push("Active issues");
  else if (filters.show === "verified") parts.push("Verified issues");
  else if (filters.show === "closed") parts.push("Closed issues");
  else parts.push("All issues");
  if (filters.q.trim()) parts.push(`Search: “${filters.q.trim()}”`);
  if (filters.priority) parts.push(`Priority: ${ISSUE_PRIORITY_LABELS[filters.priority]}`);
  if (filters.assignee === "unassigned") parts.push("Unassigned");
  else if (filters.assignee) parts.push("Filtered by assignee");
  if (filters.page) parts.push(`Page: ${filters.page}`);
  if (filters.video) parts.push("Has video");
  return parts.join(" · ");
}

function mdEscape(value: string): string {
  return value.replace(/</g, "&lt;");
}

export function toMarkdown(meta: IssueExportMeta, rows: IssueExportRow[]): string {
  const lines = [
    `# ${mdEscape(meta.reviewName)}`,
    "",
    `- Environment: ${mdEscape(meta.environmentName)}`,
    `- Recorded version: ${mdEscape(meta.versionLabel)}`,
    `- Exported: ${meta.exportedAt.toISOString()}`,
    `- Filters: ${mdEscape(summarizeFilters(meta.filters))}`,
    `- Issues: ${rows.length}`,
  ];
  if (meta.approval) {
    lines.push(`- Approval: ${mdEscape(meta.approval.statusLabel)}`);
    if (meta.approval.decidedBy || meta.approval.decidedAt) {
      lines.push(
        `- Decided by: ${mdEscape(meta.approval.decidedBy ?? "Someone on the team")}${
          meta.approval.decidedAt ? ` (${meta.approval.decidedAt.toISOString()})` : ""
        }`,
      );
    }
    if (meta.approval.note) {
      lines.push(`- Approval note: ${mdEscape(meta.approval.note)}`);
    }
    if (meta.approval.historical) {
      lines.push(
        `- Approval note: This approval covers an earlier version, not ${mdEscape(meta.versionLabel)}.`,
      );
    }
  }
  lines.push("");

  for (const row of rows) {
    lines.push(`## Issue #${row.number} — ${mdEscape(row.title)}`);
    lines.push("");
    lines.push(`- Status: ${ISSUE_STATUS_LABELS[row.status]}`);
    if (row.closureReason) {
      lines.push(`- Closure reason: ${ISSUE_CLOSURE_REASON_LABELS[row.closureReason]}`);
    }
    lines.push(`- Priority: ${ISSUE_PRIORITY_LABELS[row.priority]}`);
    if (row.labels.length > 0) {
      lines.push(`- Labels: ${mdEscape(row.labels.join(", "))}`);
    }
    lines.push(`- Assignee: ${mdEscape(row.assigneeDisplayName)}`);
    lines.push(`- Reporter: ${mdEscape(row.reporterDisplayName)}`);
    if (row.pageTitle) lines.push(`- Page: ${mdEscape(row.pageTitle)}`);
    if (row.pageUrl) lines.push(`- Page address: ${mdEscape(row.pageUrl)}`);
    if (row.route) lines.push(`- Route: ${mdEscape(row.route)}`);
    lines.push(`- Environment: ${mdEscape(row.environmentName)}`);
    lines.push(`- Recorded version: ${mdEscape(row.versionLabel)}`);
    lines.push(`- Created: ${row.createdAt.toISOString()}`);
    lines.push(`- Updated: ${row.updatedAt.toISOString()}`);
    lines.push(`- Public replies: ${row.publicReplyCount}`);
    if (row.latestVerificationOutcome) {
      lines.push(
        `- Latest verification: ${row.latestVerificationOutcome}${
          row.latestVerificationAt ? ` (${row.latestVerificationAt.toISOString()})` : ""
        }`,
      );
    }
    if (row.latestBrowserCheckSummary) {
      lines.push(`- Latest browser check: ${mdEscape(row.latestBrowserCheckSummary)}`);
    }
    if (row.behavioralEvidenceSummary) {
      lines.push(`- Behavioral evidence: ${mdEscape(row.behavioralEvidenceSummary)}`);
    }
    if (row.videoEvidenceSummary) {
      lines.push(`- Video evidence: ${mdEscape(row.videoEvidenceSummary)}`);
    }
    lines.push(`- Open in Passoff: ${row.issueHref}`);
    lines.push("");
    lines.push(mdEscape(row.body));
    lines.push("");
    if (meta.includeReplies && row.publicReplies.length > 0) {
      lines.push("### Public replies");
      lines.push("");
      for (const reply of row.publicReplies) {
        lines.push(`- ${mdEscape(reply.author)} (${reply.createdAt.toISOString()}): ${mdEscape(reply.body)}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function exportFilename(reviewName: string, format: "csv" | "md", at = new Date()): string {
  const date = at.toISOString().slice(0, 10);
  const slug = reviewName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "review";
  return `passoff-${slug}-issues-${date}.${format}`;
}

/** The sentence exports use for an issue with a ready video. Empty when there is none. */
export function videoEvidenceExportSummary(durationSeconds: number | null | undefined): string {
  const length =
    durationSeconds != null && Number.isFinite(durationSeconds) && durationSeconds >= 0
      ? ` (${Math.floor(durationSeconds / 60)}:${String(Math.round(durationSeconds) % 60).padStart(2, "0")} long)`
      : "";
  return `A video is attached${length}. Sign in to Passoff and open the issue to watch it.`;
}
