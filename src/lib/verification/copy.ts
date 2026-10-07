import type { VerificationCheckKind, VerificationOutcome } from "@/lib/verification/contract";

export const CHECK_KIND_LABELS: Record<VerificationCheckKind, string> = {
  element_visibility: "Element visibility",
  bounding_box_overlap: "Overlap",
  named_test_hook: "Named check",
};

export const OUTCOME_LABELS: Record<VerificationOutcome | "cancelled", string> = {
  passed: "Passed",
  failed: "Failed",
  uncertain: "Uncertain",
  cancelled: "Cancelled",
};

export const RUN_STATE_LABELS = {
  preparing: "Preparing",
  locating: "Locating the issue",
  running: "Running checks",
  capturing: "Capturing evidence",
  complete: "Complete",
  needs_attention: "Needs attention",
  cancelled: "Cancelled",
} as const;

export function failureCopy(code: string | null | undefined): {
  title: string;
  next: string;
} {
  switch (code) {
    case "sdk_missing":
      return {
        title: "Passoff isn’t installed on this website yet.",
        next: "Open website setup and add the install code, then try again.",
      };
    case "sdk_outdated":
      return {
        title: "This website is using an older Passoff install.",
        next: "Update the install code, then run the checks again.",
      };
    case "installation_disabled":
      return {
        title: "Passoff is turned off for this website.",
        next: "Turn it back on in website setup, then try again.",
      };
    case "expired_exchange":
      return {
        title: "This check session expired.",
        next: "Return to the issue and open the website again.",
      };
    case "wrong_origin":
      return {
        title: "Passoff isn’t allowed on this website address.",
        next: "Open the recorded environment for this issue.",
      };
    case "wrong_environment":
      return {
        title: "This isn’t the website environment for this issue.",
        next: "Open the correct environment, then run the checks again.",
      };
    case "version_mismatch":
      return {
        title: "The website version doesn’t match the recorded deployment.",
        next: "Choose the version that is actually running, or record a manual check later.",
      };
    case "auth_required":
      return {
        title: "This page looks like it needs you to sign in.",
        next: "Sign in to the website, then run the checks again.",
      };
    case "route_unavailable":
      return {
        title: "Passoff couldn’t open the original page.",
        next: "Open the page yourself, then run the checks again.",
      };
    case "anchor_missing":
      return {
        title: "Passoff could not confidently locate the original element.",
        next: "Relink the issue, or record a manual check.",
      };
    case "anchor_ambiguous":
      return {
        title: "More than one place on the page matched this issue.",
        next: "Relink the issue to the exact element, then try again.",
      };
    case "cross_origin_frame":
      return {
        title: "The original element is inside a page Passoff can’t inspect.",
        next: "Record a manual check instead.",
      };
    case "page_loading":
      return {
        title: "The page is still loading.",
        next: "Wait for the page to finish, then run the checks again.",
      };
    case "layout_changing":
      return {
        title: "The page is still moving, so the check isn’t reliable.",
        next: "Wait for the layout to settle, then run the checks again.",
      };
    case "hook_missing":
      return {
        title: "The named check isn’t registered on this website.",
        next: "Ask the team to register it, or run the other checks.",
      };
    case "hook_timeout":
      return {
        title: "The named check did not return before the time limit.",
        next: "Try again, or record a manual check.",
      };
    case "screenshot_failed":
      return {
        title: "Passoff couldn’t capture a fresh picture.",
        next: "The check results are still saved. You can capture later.",
      };
    case "network":
      return {
        title: "Passoff lost the connection while checking.",
        next: "Reconnect, then run the checks again.",
      };
    case "cancelled":
      return {
        title: "The checks were cancelled.",
        next: "Run them again when you’re ready.",
      };
    case "guest_denied":
      return {
        title: "Guest review sessions can’t run these workspace checks.",
        next: "Sign in as a workspace member and start from the issue.",
      };
    default:
      return {
        title: "Passoff couldn’t finish these checks.",
        next: "Try again, or record a manual verification instead.",
      };
  }
}

export function runSummary(input: {
  overall: "passed" | "failed" | "uncertain" | "cancelled" | null;
  kind?: VerificationCheckKind | null;
  environmentName: string;
  versionLabel: string;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  occlusionPercent?: number | null;
  failureCode?: string | null;
}): string {
  const viewport =
    input.viewportWidth && input.viewportHeight
      ? ` at ${input.viewportWidth} × ${input.viewportHeight}`
      : "";
  const place = `${input.environmentName} ${input.versionLabel}`.trim();

  if (input.overall === "cancelled") {
    return "The browser checks were cancelled.";
  }
  if (input.failureCode === "anchor_missing") {
    return "Passoff could not confidently locate the original element.";
  }
  if (input.failureCode === "hook_timeout") {
    return "The named check did not return before the time limit.";
  }
  if (input.kind === "element_visibility" && input.overall === "passed") {
    return `Element visibility passed on ${place}${viewport}.`;
  }
  if (
    input.kind === "bounding_box_overlap" &&
    input.overall === "failed" &&
    typeof input.occlusionPercent === "number"
  ) {
    return `Overlap check failed: approximately ${Math.round(input.occlusionPercent)}% of the target was covered by a sticky page region.`;
  }
  if (input.overall === "passed") {
    return `Browser checks passed on ${place}${viewport}.`;
  }
  if (input.overall === "failed") {
    return `A browser check failed on ${place}${viewport}.`;
  }
  if (input.overall === "uncertain") {
    return `A browser check needs a person to look on ${place}${viewport}.`;
  }
  return "Browser checks are in progress.";
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}
