import { stripHtml } from "@/lib/verification/copy";
import {
  HOOK_SUMMARY_MAX,
  isAllowedHookName,
  isVerificationCheckKind,
  isVerificationOutcome,
  type VerificationCheckKind,
  type VerificationOutcome,
} from "@/lib/verification/contract";

const SENSITIVE_QUERY = /(token|secret|password|passwd|auth|session|code|key|jwt|otp)/i;

export function sanitizeCheckedUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) {
    parsed.username = "";
    parsed.password = "";
  }
  parsed.hash = "";
  const kept = new URLSearchParams();
  parsed.searchParams.forEach((value, key) => {
    if (SENSITIVE_QUERY.test(key) || SENSITIVE_QUERY.test(value)) return;
    kept.append(key, value);
  });
  parsed.search = kept.toString();
  const out = parsed.toString();
  return out.length > 2_000 ? out.slice(0, 2_000) : out;
}

export function sanitizeSummary(value: unknown): string {
  if (typeof value !== "string") return "";
  return stripHtml(value).slice(0, HOOK_SUMMARY_MAX);
}

const MEASUREMENT_KEYS = new Set([
  "connected",
  "width",
  "height",
  "display",
  "visibility",
  "opacity",
  "inViewport",
  "clipped",
  "inert",
  "hidden",
  "sampledPoints",
  "uncoveredPoints",
  "occlusionPercent",
  "coverCategory",
  "coverPlacement",
  "pointerEventsNone",
  "viewportWidth",
  "viewportHeight",
  "devicePixelRatio",
  "matchCount",
  "confidence",
  "hookName",
  "timedOut",
]);

export function sanitizeMeasurements(
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cleaned: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!MEASUREMENT_KEYS.has(key)) continue;
    if (typeof entry === "string") {
      cleaned[key] = stripHtml(entry).slice(0, 80);
    } else if (typeof entry === "number" && Number.isFinite(entry)) {
      cleaned[key] = entry;
    } else if (typeof entry === "boolean") {
      cleaned[key] = entry;
    }
  }
  return cleaned;
}

export function sanitizeLimitations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => stripHtml(item).slice(0, 200))
    .filter(Boolean)
    .slice(0, 8);
}

export type IncomingCheckResult = {
  kind: VerificationCheckKind;
  outcome: VerificationOutcome;
  summary: string;
  measurements: Record<string, unknown>;
  limitations: string[];
  hookName: string;
};

export function parseIncomingCheck(raw: unknown): IncomingCheckResult | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;
  if (typeof input.kind !== "string" || !isVerificationCheckKind(input.kind)) {
    return null;
  }
  if (typeof input.outcome !== "string" || !isVerificationOutcome(input.outcome)) {
    return null;
  }
  const hookName =
    typeof input.hookName === "string" && isAllowedHookName(input.hookName)
      ? input.hookName
      : "";
  return {
    kind: input.kind,
    outcome: input.outcome,
    summary: sanitizeSummary(input.summary) || "No summary was provided.",
    measurements: sanitizeMeasurements(input.measurements),
    limitations: sanitizeLimitations(input.limitations),
    hookName: input.kind === "named_test_hook" ? hookName : "",
  };
}
