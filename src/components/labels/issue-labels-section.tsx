"use client";

import { useIssueTriage } from "@/components/issues/issue-triage-context";
import { IssueLabelsField } from "@/components/labels/issue-labels-field";
import type { LabelView } from "@/lib/labels/types";

/** Connects the labels field to the issue's History list. */
export function IssueLabelsSection({
  initialLabels,
  workspaceLabels,
  canEdit,
}: {
  initialLabels: LabelView[];
  workspaceLabels: LabelView[];
  canEdit: boolean;
}) {
  const { projectId, reviewId, issueNumber, history, setHistory } = useIssueTriage();
  return (
    <IssueLabelsField
      projectId={projectId}
      reviewId={reviewId}
      issueNumber={issueNumber}
      initialLabels={initialLabels}
      workspaceLabels={workspaceLabels}
      canEdit={canEdit}
      onHistoryEvent={(event) =>
        setHistory([event, ...history.filter((item) => item.id !== event.id)])
      }
    />
  );
}
