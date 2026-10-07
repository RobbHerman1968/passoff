import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { IssueApprovalSummary } from "@/lib/approvals/types";
import { formatDeadline } from "@/lib/reviews/deadline-format";

export function hasUnresolvedIssues(summary: IssueApprovalSummary): boolean {
  return summary.openIssueCount > 0 || summary.awaitingVerificationCount > 0;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** What is about to be approved: environment, version, date, deadline, and issue counts. */
export function ApprovalSummary({
  environmentName,
  versionLabel,
  recordedAt,
  feedbackDeadline,
  issueSummary,
}: {
  environmentName: string;
  versionLabel: string;
  recordedAt: string | null;
  feedbackDeadline: string | null;
  issueSummary: IssueApprovalSummary;
}) {
  return (
    <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-sm ring-1 ring-foreground/10">
      <SummaryRow label="Environment" value={environmentName} />
      <SummaryRow label="Version" value={versionLabel} />
      <SummaryRow
        label="Recorded"
        value={
          recordedAt ? (
            <time dateTime={recordedAt} suppressHydrationWarning>
              {formatDeadline(new Date(recordedAt))}
            </time>
          ) : (
            "Date not available"
          )
        }
      />
      <SummaryRow
        label="Feedback deadline"
        value={
          feedbackDeadline ? (
            <time dateTime={feedbackDeadline} suppressHydrationWarning>
              {formatDeadline(new Date(feedbackDeadline))}
            </time>
          ) : (
            "No deadline set"
          )
        }
      />
      <SummaryRow
        label="Issues"
        value={`${issueSummary.openIssueCount} open, ${issueSummary.awaitingVerificationCount} waiting to be verified, ${issueSummary.verifiedIssueCount} verified`}
      />
    </dl>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value}</dd>
    </div>
  );
}

export function UnresolvedIssuesWarning({
  summary,
}: {
  summary: IssueApprovalSummary;
}) {
  const unresolved = summary.openIssueCount + summary.awaitingVerificationCount;
  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Some issues aren’t verified yet</AlertTitle>
      <AlertDescription>
        {plural(unresolved, "issue is", "issues are")} still open or waiting for
        verification. Approving means you accept the site as it is today, with those
        issues remaining.
      </AlertDescription>
    </Alert>
  );
}
