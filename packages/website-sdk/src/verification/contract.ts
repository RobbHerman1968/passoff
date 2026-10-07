/** Versioned automated verification contract. Keep in sync with the server. */

export const VERIFICATION_CONTRACT_VERSION = 1;

export const VERIFICATION_CHECK_KINDS = [
  "element_visibility",
  "bounding_box_overlap",
  "named_test_hook",
] as const;

export type VerificationCheckKind = (typeof VERIFICATION_CHECK_KINDS)[number];

export const VERIFICATION_OUTCOMES = ["passed", "failed", "uncertain"] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const VERIFICATION_HASH_PARAM = "passoff_vx";

export const HOOK_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
export const HOOK_NAME_MAX = 63;
export const HOOK_SUMMARY_MAX = 280;
export const HOOK_TIMEOUT_MS = 3_000;

/**
 * Overlap decision thresholds. Values inside the gap, or within
 * BOUNDARY_MARGIN of a threshold, return Uncertain instead of guessing.
 */
export const OVERLAP_THRESHOLDS = {
  /** Occlusion at or below this percentage is Passed. */
  passedMaxPercent: 15,
  /** Occlusion at or above this percentage is Failed. */
  failedMinPercent: 45,
  /** Distance to a threshold that is treated as too close to decide. */
  boundaryMarginPercent: 2,
} as const;

export const VISIBILITY_VIEWPORT_REQUIRED = true;

export const LAYOUT_STABILITY = {
  sampleDelayMs: 80,
  maxCenterDeltaPx: 4,
  maxSizeDeltaRatio: 0.1,
} as const;

export const ANCHOR_CONFIDENCE_OK = new Set(["exact", "likely"]);

export function isVerificationCheckKind(
  value: string,
): value is VerificationCheckKind {
  return (VERIFICATION_CHECK_KINDS as readonly string[]).includes(value);
}

export function isVerificationOutcome(value: string): value is VerificationOutcome {
  return (VERIFICATION_OUTCOMES as readonly string[]).includes(value);
}

export function isAllowedHookName(value: string): boolean {
  return HOOK_NAME_PATTERN.test(value) && value.length <= HOOK_NAME_MAX;
}

export function overlapDecision(occlusionPercent: number): VerificationOutcome {
  if (!Number.isFinite(occlusionPercent)) return "uncertain";
  const { passedMaxPercent, failedMinPercent, boundaryMarginPercent } =
    OVERLAP_THRESHOLDS;
  if (
    Math.abs(occlusionPercent - passedMaxPercent) <= boundaryMarginPercent ||
    Math.abs(occlusionPercent - failedMinPercent) <= boundaryMarginPercent
  ) {
    return "uncertain";
  }
  if (occlusionPercent <= passedMaxPercent) return "passed";
  if (occlusionPercent >= failedMinPercent) return "failed";
  return "uncertain";
}

export function overallFromChecks(
  outcomes: VerificationOutcome[],
): VerificationOutcome {
  if (outcomes.some((item) => item === "failed")) return "failed";
  if (outcomes.some((item) => item === "uncertain") || outcomes.length === 0) {
    return "uncertain";
  }
  return "passed";
}
