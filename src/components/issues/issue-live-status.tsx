"use client";

import { StatusBadge } from "@/components/status-badge";
import { useIssueTriage } from "@/components/issues/issue-triage-context";

export function IssueLiveStatusBadge() {
  const { snapshot } = useIssueTriage();
  return <StatusBadge status={snapshot.status} />;
}
