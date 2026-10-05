"use client";

import { useIssueTriage } from "@/components/issues/issue-triage-context";
import { formatRelativeActivity } from "@/lib/projects/format";

export function IssueUpdatedTime() {
  const { snapshot } = useIssueTriage();
  const updatedAt = new Date(snapshot.updatedAt);
  return (
    <time dateTime={updatedAt.toISOString()}>
      {formatRelativeActivity(updatedAt)}
    </time>
  );
}
