export const PLAN_IDS = ["free", "studio", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * An allowance is only shown in product copy when it is approved and has
 * defined enforcement. Undecided values stay in configuration and must not
 * appear on pricing surfaces.
 */
export type AllowanceState =
  | { status: "approved"; value: number; unit: string }
  | { status: "unlimited" }
  | { status: "undecided" };

export type PooledUsageMetric =
  | "video_processing"
  | "video_storage"
  | "video_playback"
  | "tracked_pageviews"
  | "telemetry_events"
  | "ai_analyses"
  | "browser_verification_jobs"
  | "proxy_sessions"
  | "proxy_bandwidth";

export type VideoEvidenceLimits = {
  maxClipDurationSeconds: number;
  maxClipBytes: number;
  maxQuality: "1080p";
  newUploadMinutesPerCalendarMonth: number;
  retainedMinutes: number;
  unlimitedReviewerPlayback: true;
  retentionDaysAfterIssueCloses: number;
  retainWhileIssueIsActive: true;
  automaticOverageBilling: false;
};

export type VideoEvidencePolicy =
  | { status: "approved"; limits: VideoEvidenceLimits }
  | { status: "undecided" };

export type PlanEntitlements = {
  id: PlanId;
  name: "Free" | "Studio" | "Agency";
  monthlyPriceUsd: number;
  annualMonthlyPriceUsd: number;
  annualTotalUsd: number;
  workspaceMembers: number;
  activeReviewWebsites: number | "unlimited";
  unlimitedGuestReviewers: true;
  unlimitedIssuesAndComments: true;
  videoEvidence: VideoEvidencePolicy;
};

export const AGENCY_TRIAL_DAYS = 14;

export const VIDEO_EVIDENCE_COMMON_LIMITS = {
  maxClipDurationSeconds: 3 * 60,
  maxClipBytes: 250 * 1024 * 1024,
  maxQuality: "1080p",
  unlimitedReviewerPlayback: true,
  retentionDaysAfterIssueCloses: 30,
  retainWhileIssueIsActive: true,
  automaticOverageBilling: false,
} as const satisfies Omit<
  VideoEvidenceLimits,
  "newUploadMinutesPerCalendarMonth" | "retainedMinutes"
>;

export const FREE_VIDEO_EVIDENCE_LIMITS = {
  ...VIDEO_EVIDENCE_COMMON_LIMITS,
  newUploadMinutesPerCalendarMonth: 10,
  retainedMinutes: 15,
} as const satisfies VideoEvidenceLimits;

export const STUDIO_VIDEO_EVIDENCE_LIMITS = {
  ...VIDEO_EVIDENCE_COMMON_LIMITS,
  newUploadMinutesPerCalendarMonth: 30,
  retainedMinutes: 60,
} as const satisfies VideoEvidenceLimits;

export const AGENCY_VIDEO_EVIDENCE_LIMITS = {
  ...VIDEO_EVIDENCE_COMMON_LIMITS,
  newUploadMinutesPerCalendarMonth: 60,
  retainedMinutes: 120,
} as const satisfies VideoEvidenceLimits;

export const PLAN_ENTITLEMENTS: Record<PlanId, PlanEntitlements> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    annualMonthlyPriceUsd: 0,
    annualTotalUsd: 0,
    workspaceMembers: 1,
    activeReviewWebsites: 1,
    unlimitedGuestReviewers: true,
    unlimitedIssuesAndComments: true,
    videoEvidence: { status: "approved", limits: FREE_VIDEO_EVIDENCE_LIMITS },
  },
  studio: {
    id: "studio",
    name: "Studio",
    monthlyPriceUsd: 35,
    annualMonthlyPriceUsd: 29,
    annualTotalUsd: 348,
    workspaceMembers: 3,
    activeReviewWebsites: 5,
    unlimitedGuestReviewers: true,
    unlimitedIssuesAndComments: true,
    videoEvidence: { status: "approved", limits: STUDIO_VIDEO_EVIDENCE_LIMITS },
  },
  agency: {
    id: "agency",
    name: "Agency",
    monthlyPriceUsd: 109,
    annualMonthlyPriceUsd: 89,
    annualTotalUsd: 1068,
    workspaceMembers: 6,
    activeReviewWebsites: "unlimited",
    unlimitedGuestReviewers: true,
    unlimitedIssuesAndComments: true,
    videoEvidence: { status: "approved", limits: AGENCY_VIDEO_EVIDENCE_LIMITS },
  },
};

export const ANNUAL_SAVINGS_USD =
  PLAN_ENTITLEMENTS.agency.monthlyPriceUsd * 12 -
  PLAN_ENTITLEMENTS.agency.annualTotalUsd;

/** The biggest yearly saving across paid plans, as a whole percent. Derived, never typed by hand. */
export const ANNUAL_SAVINGS_PERCENT = Math.max(
  ...(["studio", "agency"] as const).map((id) => {
    const plan = PLAN_ENTITLEMENTS[id];
    const yearlyAtMonthlyPrice = plan.monthlyPriceUsd * 12;
    return Math.round(((yearlyAtMonthlyPrice - plan.annualTotalUsd) / yearlyAtMonthlyPrice) * 100);
  }),
);

export const POOLED_USAGE_METRICS: Record<
  PooledUsageMetric,
  { label: string; allowance: AllowanceState }
> = {
  video_processing: {
    label: "Video processing",
    allowance: { status: "undecided" },
  },
  video_storage: {
    label: "Video storage",
    allowance: { status: "undecided" },
  },
  video_playback: {
    label: "Video playback",
    allowance: { status: "unlimited" },
  },
  tracked_pageviews: {
    label: "Tracked pageviews",
    allowance: { status: "undecided" },
  },
  telemetry_events: {
    label: "Telemetry events",
    allowance: { status: "undecided" },
  },
  ai_analyses: {
    label: "AI analyses",
    allowance: { status: "undecided" },
  },
  browser_verification_jobs: {
    label: "Browser verification jobs",
    allowance: { status: "undecided" },
  },
  proxy_sessions: {
    label: "Proxy sessions",
    allowance: { status: "undecided" },
  },
  proxy_bandwidth: {
    label: "Proxy bandwidth",
    allowance: { status: "undecided" },
  },
};

export function isPublishedAllowance(
  allowance: AllowanceState,
): allowance is Exclude<AllowanceState, { status: "undecided" }> {
  return allowance.status !== "undecided";
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
