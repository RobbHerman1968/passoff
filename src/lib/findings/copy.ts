import type {
  BehavioralFindingDisposition,
  BehavioralFindingType,
} from "@/db/schema";

export const FINDING_TYPE_LABELS: Record<BehavioralFindingType, string> = {
  click_concentration: "Click concentration",
  repeat_click_concentration: "Repeat-click concentration",
  possible_dead_click: "Possible dead click",
  scroll_drop_off: "Scroll drop-off",
  sanitized_js_error_concentration: "Sanitized JavaScript error concentration",
  material_version_change: "Material behavioral change between versions",
};

export const FINDING_DISPOSITION_LABELS: Record<
  BehavioralFindingDisposition,
  string
> = {
  needs_review: "Needs review",
  attached_to_issue: "Attached to issue",
  issue_created: "Issue created",
  dismissed: "Dismissed",
  watching: "Watching",
  insufficient_data: "Insufficient data",
  no_longer_occurring: "No longer occurring",
};

export function findingPrimaryAction(
  disposition: BehavioralFindingDisposition,
  relatedIssueHref: string | null,
): string {
  if (disposition === "needs_review" || disposition === "watching") {
    return "Create an issue or attach this finding to an existing issue.";
  }
  if (
    (disposition === "issue_created" || disposition === "attached_to_issue") &&
    relatedIssueHref
  ) {
    return "Review the linked issue. You can request a before-and-after comparison after a new version ships.";
  }
  if (disposition === "dismissed") {
    return "This finding was dismissed. Historical evidence is still available.";
  }
  if (disposition === "insufficient_data") {
    return "Wait for more eligible sessions, or widen the time window.";
  }
  return "Review the recorded evidence. Findings are observations, not confirmed defects.";
}

export function suggestedIssueBody(input: {
  title: string;
  explanation: string;
  uncertainty: string;
  environmentName: string;
  route: string;
  version: string;
  viewport: string;
  includeInvestigationSteps: boolean;
  investigationSteps: string[];
}): string {
  const lines = [
    input.title,
    "",
    "Observed from aggregate production behavior (not a confirmed defect):",
    input.explanation,
    "",
    input.uncertainty,
    "",
    `Environment: ${input.environmentName}`,
    `Route: ${input.route}`,
    `Version: ${input.version || "unspecified"}`,
    `Viewport: ${input.viewport}`,
  ];
  if (input.includeInvestigationSteps && input.investigationSteps.length > 0) {
    lines.push("", "Suggested investigation steps:");
    for (const step of input.investigationSteps) {
      lines.push(`- ${step}`);
    }
  }
  return lines.join("\n");
}
