import type { behavioralFindings } from "@/db/schema";

const SNAPSHOT_FORBIDDEN_KEYS = [
  "rawEvents",
  "tabSession",
  "ip",
  "cookie",
  "userId",
  "accountId",
  "email",
  "form",
  "screenshot",
  "visitor",
  "crm",
] as const;

export type BehavioralEvidenceSnapshotPayload = {
  findingType: string;
  observedMetric: string;
  metricValue: number;
  denominatorName: string;
  denominatorValue: number;
  eligibleSessionCount: number;
  environmentId: string;
  route: string;
  deploymentVersion: string;
  viewportGroup: string;
  windowStart: string;
  windowEnd: string;
  samplingPercent: number;
  coverageStatus: string;
  detectionRuleVersion: string;
  safeLabel: string;
  createdAt: string;
  sourceAggregates: string;
  uncertainty: string;
  explanation: string;
};

export function buildEvidenceSnapshotPayload(
  finding: typeof behavioralFindings.$inferSelect,
  createdAt = new Date(),
): BehavioralEvidenceSnapshotPayload {
  return {
    findingType: finding.findingType,
    observedMetric: finding.metricName,
    metricValue: Number(finding.metricValue),
    denominatorName: finding.denominatorName,
    denominatorValue: finding.denominatorValue,
    eligibleSessionCount: finding.eligibleSessionCount,
    environmentId: finding.environmentId,
    route: finding.normalizedRoute,
    deploymentVersion: finding.deploymentVersion,
    viewportGroup: finding.viewportGroup,
    windowStart: finding.windowStart.toISOString(),
    windowEnd: finding.windowEnd.toISOString(),
    samplingPercent: finding.samplingPercent,
    coverageStatus: finding.coverageStatus,
    detectionRuleVersion: finding.ruleVersion,
    safeLabel: finding.analyticsLabel || finding.elementCategory || "",
    createdAt: createdAt.toISOString(),
    sourceAggregates: "telemetry_aggregates",
    uncertainty: finding.uncertainty,
    explanation: finding.explanation,
  };
}

export function snapshotContainsProhibitedFields(
  payload: Record<string, unknown>,
): boolean {
  return SNAPSHOT_FORBIDDEN_KEYS.some((key) => key in payload);
}
