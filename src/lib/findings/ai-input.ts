import { FORBIDDEN_AI_INPUT_KEYS } from "@/lib/findings/ai-schema";

export type SafeBehavioralAiInput = {
  findingType: string;
  metricName: string;
  metricValue: number;
  denominatorName: string;
  denominatorValue: number;
  eligibleSessionCount: number;
  coverageStatus: string;
  environmentKind: string;
  normalizedRoute: string;
  deploymentVersion: string;
  viewportGroup: string;
  elementCategory: string;
  analyticsLabel: string;
  errorCategory: string;
  issueTitle: string;
  redactedIssueDescription: string;
  previousVerificationOutcomes: string[];
  comparisonSummary: string;
};

const ALLOWED_KEYS = [
  "findingType",
  "metricName",
  "metricValue",
  "denominatorName",
  "denominatorValue",
  "eligibleSessionCount",
  "coverageStatus",
  "environmentKind",
  "normalizedRoute",
  "deploymentVersion",
  "viewportGroup",
  "elementCategory",
  "analyticsLabel",
  "errorCategory",
  "issueTitle",
  "redactedIssueDescription",
  "previousVerificationOutcomes",
  "comparisonSummary",
] as const;

export function redactIssueText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted]")
    .slice(0, 400);
}

export function buildSafeAiInput(
  input: SafeBehavioralAiInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    payload[key] = input[key];
  }
  for (const key of FORBIDDEN_AI_INPUT_KEYS) {
    delete payload[key];
  }
  return payload;
}

export function aiInputContainsProhibitedFields(
  input: Record<string, unknown>,
): boolean {
  return FORBIDDEN_AI_INPUT_KEYS.some((key) => key in input);
}
