/** Versioned visitor telemetry contract. Keep in sync with server ingest. */

export const TELEMETRY_SCHEMA_VERSION = 1;

export const TELEMETRY_EVENT_TYPES = [
  "page_view",
  "element_click",
  "scroll_milestone",
  "repeat_click_signal",
  "dead_click_candidate",
  "sanitized_javascript_error",
] as const;

export type TelemetryEventType = (typeof TELEMETRY_EVENT_TYPES)[number];

export const ELEMENT_CATEGORIES = [
  "button",
  "link",
  "navigation",
  "form_action",
  "dialog_action",
  "page_region",
  "unlabeled_interactive",
] as const;

export type ElementCategory = (typeof ELEMENT_CATEGORIES)[number];

export const VIEWPORT_GROUPS = ["mobile", "tablet", "desktop"] as const;
export type ViewportGroup = (typeof VIEWPORT_GROUPS)[number];

export const SCROLL_MILESTONES = [25, 50, 75, 90, 100] as const;

export const COORDINATE_BUCKETS = 20;
export const ANALYTICS_LABEL_MAX = 64;
export const ANALYTICS_LABEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
export const ROUTE_MAX = 512;
export const DEPLOYMENT_VERSION_MAX = 120;
export const EVENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const TAB_SESSION_PATTERN = /^[a-f0-9]{64}$/i;

export const REPEAT_CLICK_THRESHOLD = 3;
export const REPEAT_CLICK_WINDOW_MS = 1_500;
export const DEAD_CLICK_WAIT_MS = 800;

export const MAX_EVENTS_PER_BATCH = 50;
export const MAX_BATCH_BYTES = 32_768;
export const FLUSH_INTERVAL_MS = 4_000;

export const CONSENT_STORAGE_KEY = "passoff.usabilityChoice.v1";
export const EXCLUDE_SESSION_KEY = "passoff.excludeUsabilitySession.v1";
export const NOTICE_SEEN_KEY = "passoff.usabilityNoticeSeen.v1";

export const FORBIDDEN_EVENT_KEYS = [
  "name",
  "email",
  "userId",
  "user_id",
  "accountId",
  "account_id",
  "crmId",
  "advertisingId",
  "visitorId",
  "deviceFingerprint",
  "cookie",
  "cookies",
  "authorization",
  "headers",
  "requestBody",
  "responseBody",
  "formValue",
  "formValues",
  "password",
  "keystrokes",
  "clipboard",
  "pageText",
  "innerText",
  "outerHTML",
  "dom",
  "chat",
  "payment",
  "geolocation",
  "ip",
  "ipAddress",
  "sessionRecording",
  "screenshot",
  "selector",
  "cssSelector",
  "elementId",
  "accessibleName",
] as const;

export const DEFAULT_SENSITIVE_ROUTE_PATTERNS = [
  /^\/(login|log-in|signin|sign-in|signup|sign-up|register|auth|oauth|sso)\b/i,
  /^\/(account|profile|settings|preferences)\b/i,
  /^\/(billing|checkout|payment|pay|cart|wallet|invoice)\b/i,
  /^\/(admin|administrator|dashboard\/admin)\b/i,
  /^\/(health|medical|patient)\b/i,
  /^\/(messages|inbox|chat|dm|mail)\b/i,
  /^\/(password|reset|mfa|2fa|verify-email)\b/i,
];

export type TelemetryConsentState = "granted" | "aggregate_notice";

export type SamplingMetadata = {
  percent: number;
  selected: true;
};

export type TelemetryEventBase = {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  eventId: string;
  batchId: string;
  eventType: TelemetryEventType;
  occurredAt: string;
  route: string;
  deploymentVersion: string;
  viewportGroup: ViewportGroup;
  sampling: SamplingMetadata;
  tabSession: string;
  consentState: TelemetryConsentState;
  testMode?: boolean;
};

export type PageViewEvent = TelemetryEventBase & {
  eventType: "page_view";
};

export type ElementClickEvent = TelemetryEventBase & {
  eventType: "element_click";
  elementCategory: ElementCategory;
  analyticsLabel: string;
  coordinateBucketX: number;
  coordinateBucketY: number;
};

export type ScrollMilestoneEvent = TelemetryEventBase & {
  eventType: "scroll_milestone";
  scrollMilestone: (typeof SCROLL_MILESTONES)[number];
};

export type RepeatClickEvent = TelemetryEventBase & {
  eventType: "repeat_click_signal";
  elementCategory: ElementCategory;
  analyticsLabel: string;
  clickCount: number;
};

export type DeadClickEvent = TelemetryEventBase & {
  eventType: "dead_click_candidate";
  elementCategory: ElementCategory;
  analyticsLabel: string;
  waitMs: number;
};

export type SanitizedErrorEvent = TelemetryEventBase & {
  eventType: "sanitized_javascript_error";
  errorCategory: string;
  errorFingerprint: string;
  sourceCategory: "first_party" | "unknown";
};

export type TelemetryEvent =
  | PageViewEvent
  | ElementClickEvent
  | ScrollMilestoneEvent
  | RepeatClickEvent
  | DeadClickEvent
  | SanitizedErrorEvent;

export type TelemetryBatch = {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION;
  batchId: string;
  installationKey: string;
  events: TelemetryEvent[];
};

export type AnalyticsBootstrap = {
  enabled: boolean;
  mode?: "strict_consent" | "privacy_first_aggregate";
  samplingPercent?: number;
  excludedRoutes?: string[];
  privacyPolicyUrl?: string;
  organizationName?: string;
  testMode?: boolean;
  killSwitch?: boolean;
  schemaVersion?: number;
  hideBuiltInPrivacyLink?: boolean;
};

export function viewportGroupFromWidth(width: number): ViewportGroup {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function bucketCoordinate(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(COORDINATE_BUCKETS - 1, Math.floor(clamped * COORDINATE_BUCKETS));
}

export function isAllowedAnalyticsLabel(value: string): boolean {
  return ANALYTICS_LABEL_PATTERN.test(value) && value.length <= ANALYTICS_LABEL_MAX;
}
