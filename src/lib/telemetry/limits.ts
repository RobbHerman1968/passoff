export const TELEMETRY_LIMITS = {
  eventsPerMinutePerEnvironment: 600,
  eventsPerDayPerWorkspace: 250_000,
  rawRetainedEventsPerEnvironment: 500_000,
  aggregateRowsPerEnvironment: 200_000,
  errorEventsPerDayPerEnvironment: 10_000,
  testEventsPerDayPerEnvironment: 5_000,
  maxStaleEventMs: 6 * 60 * 60 * 1000,
  maxFutureEventMs: 2 * 60 * 1000,
  ingestRateWindowMs: 60_000,
  usagePeriodDays: 30,
} as const;

export const TELEMETRY_ACTIVITY = {
  settingsUpdated: "telemetry.settings_updated",
  collectionLimited: "telemetry.collection_limited",
  killSwitch: "telemetry.kill_switch",
  testCleared: "telemetry.test_cleared",
  reportViewed: "telemetry.report_viewed",
} as const;

export const FINDING_ACTIVITY = {
  created: "behavioral_finding.created",
  dispositionChanged: "behavioral_finding.disposition_changed",
  attached: "behavioral_finding.attached",
  comparisonRequested: "behavioral_comparison.requested",
  comparisonReady: "behavioral_comparison.ready",
  aiRequested: "behavioral_ai.requested",
} as const;

export const FINDING_THRESHOLDS = {
  ruleVersion: "1.0.0",
  repeatClickRate: 0.08,
  deadClickRate: 0.06,
  errorRate: 0.05,
  clickConcentrationPerSession: 0.5,
  scrollDropOffPoints: 0.25,
  materialChangePoints: 0.05,
} as const;

export const BEHAVIORAL_AI_LIMITS = {
  requestsPerWorkspacePerMonth: 40,
  cooldownMs: 15 * 60 * 1000,
  maxInputChars: 8_000,
  maxOutputTokens: 900,
  timeoutMs: 20_000,
} as const;
