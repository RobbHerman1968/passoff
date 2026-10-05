import { z } from "zod";

import {
  parseScreenshotAnnotation,
  type ScreenshotAnnotationV1,
} from "@/lib/issues/screenshot-annotation";
import { ISSUE_PRIORITIES, type IssuePriority } from "@/lib/issues/statuses";
import { normalizePageUrl, pageRouteFromUrl } from "@/lib/sdk/page-url";

const STRING_LIMITS = {
  body: 8_000,
  pageTitle: 300,
  selectedText: 180,
  stableElementId: 200,
  cssSelector: 1_000,
  fingerprint: 1_000,
  browser: 120,
  os: 120,
  buildId: 256,
  role: 120,
  name: 300,
  tag: 64,
  attrKey: 64,
  attrValue: 200,
  reason: 400,
  idempotencyKey: 128,
} as const;

const APPROVED_ATTRS = new Set([
  "data-testid",
  "data-qa",
  "data-cy",
  "data-passoff-anchor",
]);

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function clampNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export type SanitizedAnchor = {
  pageUrl: string;
  route: string;
  pageTitle: string | null;
  selectedText: string | null;
  elementTag: string | null;
  accessibleRole: string | null;
  accessibleName: string | null;
  stableElementId: string | null;
  approvedDataAttributes: Record<string, string>;
  cssSelector: string | null;
  ancestryFingerprint: string | null;
  normalizedX: number | null;
  normalizedY: number | null;
  documentX: number | null;
  documentY: number | null;
  elementBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  viewportWidth: number;
  viewportHeight: number;
  browser: string | null;
  operatingSystem: string | null;
  devicePixelRatio: number | null;
  applicationBuildId: string | null;
  private: boolean;
  capturedAt: Date | null;
};

export type SanitizedScreenshot = {
  status: "captured" | "partially-captured" | "unavailable";
  reason: string | null;
  mimeType: "image/png" | null;
  /** Raw base64 without data-url prefix. Capped server-side. */
  base64: string | null;
  byteLength: number | null;
  /** Validated annotation, or null when missing/invalid. */
  annotation: ScreenshotAnnotationV1 | null;
};

const MAX_SCREENSHOT_BASE64_CHARS = 280_000; // ~200KB binary

export function sanitizeIssueBody(raw: unknown): string | null {
  const body = clampString(raw, STRING_LIMITS.body);
  return body;
}

export function sanitizeIdempotencyKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  if (!key || key.length > STRING_LIMITS.idempotencyKey) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(key)) return null;
  return key;
}

export function sanitizePriority(raw: unknown): IssuePriority {
  if (typeof raw === "string" && (ISSUE_PRIORITIES as readonly string[]).includes(raw)) {
    return raw as IssuePriority;
  }
  return "normal";
}

export function sanitizeAnchor(raw: unknown): SanitizedAnchor | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  const pageUrl = normalizePageUrl(
    typeof input.pageUrl === "string" ? input.pageUrl : null,
  );
  if (!pageUrl) return null;

  const viewport =
    input.viewport && typeof input.viewport === "object"
      ? (input.viewport as Record<string, unknown>)
      : {};
  const viewportWidth = clampNumber(viewport.width, 1, 10_000) ?? 1;
  const viewportHeight = clampNumber(viewport.height, 1, 10_000) ?? 1;

  const normalized =
    input.normalizedPosition && typeof input.normalizedPosition === "object"
      ? (input.normalizedPosition as Record<string, unknown>)
      : {};
  const documentPosition =
    input.documentPosition && typeof input.documentPosition === "object"
      ? (input.documentPosition as Record<string, unknown>)
      : {};
  const bounds =
    input.elementBounds && typeof input.elementBounds === "object"
      ? (input.elementBounds as Record<string, unknown>)
      : null;
  const environment =
    input.environment && typeof input.environment === "object"
      ? (input.environment as Record<string, unknown>)
      : {};

  const attrsRaw =
    input.approvedDataAttributes && typeof input.approvedDataAttributes === "object"
      ? (input.approvedDataAttributes as Record<string, unknown>)
      : {};
  const approvedDataAttributes: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrsRaw)) {
    if (!APPROVED_ATTRS.has(key)) continue;
    const safe = clampString(value, STRING_LIMITS.attrValue);
    if (safe) {
      approvedDataAttributes[key.slice(0, STRING_LIMITS.attrKey)] = safe;
    }
  }

  const isPrivate = Boolean(input.private);
  let capturedAt: Date | null = null;
  if (typeof input.capturedAt === "string") {
    const date = new Date(input.capturedAt);
    if (!Number.isNaN(date.getTime())) {
      capturedAt = date;
    }
  }

  return {
    pageUrl,
    route:
      clampString(input.route, 2_048) ?? pageRouteFromUrl(pageUrl),
    pageTitle: clampString(input.pageTitle, STRING_LIMITS.pageTitle),
    selectedText: isPrivate
      ? null
      : clampString(input.nearbyVisibleText, STRING_LIMITS.selectedText),
    elementTag: clampString(input.elementTag, STRING_LIMITS.tag),
    accessibleRole: clampString(input.accessibleRole, STRING_LIMITS.role),
    accessibleName: isPrivate
      ? null
      : clampString(input.accessibleName, STRING_LIMITS.name),
    stableElementId: isPrivate
      ? null
      : clampString(input.stableElementId, STRING_LIMITS.stableElementId),
    approvedDataAttributes: isPrivate ? {} : approvedDataAttributes,
    cssSelector: isPrivate
      ? null
      : clampString(input.cssSelector, STRING_LIMITS.cssSelector),
    ancestryFingerprint: isPrivate
      ? null
      : clampString(input.ancestryFingerprint, STRING_LIMITS.fingerprint),
    normalizedX: clampNumber(normalized.x, 0, 1),
    normalizedY: clampNumber(normalized.y, 0, 1),
    documentX: clampNumber(documentPosition.x, 0, 100_000),
    documentY: clampNumber(documentPosition.y, 0, 100_000),
    elementBounds: bounds
      ? {
          x: clampNumber(bounds.x, -100_000, 100_000) ?? 0,
          y: clampNumber(bounds.y, -100_000, 100_000) ?? 0,
          width: clampNumber(bounds.width, 0, 100_000) ?? 0,
          height: clampNumber(bounds.height, 0, 100_000) ?? 0,
        }
      : null,
    viewportWidth,
    viewportHeight,
    browser: clampString(environment.browser, STRING_LIMITS.browser),
    operatingSystem: clampString(
      environment.operatingSystem,
      STRING_LIMITS.os,
    ),
    devicePixelRatio: clampNumber(input.devicePixelRatio, 0.5, 8),
    applicationBuildId: clampString(input.hostBuildId, STRING_LIMITS.buildId),
    private: isPrivate,
    capturedAt,
  };
}

export function sanitizeScreenshot(raw: unknown): SanitizedScreenshot {
  if (!raw || typeof raw !== "object") {
    return {
      status: "unavailable",
      reason: "Passoff couldn’t capture a picture of this page.",
      mimeType: null,
      base64: null,
      byteLength: null,
      annotation: null,
    };
  }
  const input = raw as Record<string, unknown>;
  const status =
    input.status === "captured" ||
    input.status === "partially-captured" ||
    input.status === "unavailable"
      ? input.status
      : "unavailable";

  const reason = clampString(input.reason, STRING_LIMITS.reason);

  let base64: string | null = null;
  let mimeType: "image/png" | null = null;
  let byteLength: number | null = null;

  if (
    (status === "captured" || status === "partially-captured") &&
    typeof input.dataUrl === "string"
  ) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
      input.dataUrl.trim(),
    );
    if (match?.[1] && match[1].length <= MAX_SCREENSHOT_BASE64_CHARS) {
      base64 = match[1];
      mimeType = "image/png";
      byteLength = Math.floor((base64.length * 3) / 4);
    }
  }

  if (status !== "unavailable" && !base64) {
    return {
      status: "unavailable",
      reason:
        reason ??
        "Passoff couldn’t capture a picture of this page. You can still send your feedback.",
      mimeType: null,
      base64: null,
      byteLength: null,
      annotation: null,
    };
  }

  // Never trust SDK coordinates without validation. Invalid annotation is
  // dropped without rejecting an otherwise valid screenshot.
  const annotation =
    base64 && status !== "unavailable"
      ? parseScreenshotAnnotation(input.annotation)
      : null;

  return {
    status,
    reason,
    mimeType,
    base64,
    byteLength,
    annotation,
  };
}

export const sdkExchangeBodySchema = z
  .object({
    installationKey: z.string().trim().min(1).max(80),
    exchangeCode: z.string().trim().min(16).max(200),
  })
  .strict();

export const sdkCreateIssueBodySchema = z
  .object({
    body: z.string().trim().min(1).max(STRING_LIMITS.body),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    pageUrl: z.string().trim().min(1).max(4_096),
    anchor: z.unknown(),
    screenshot: z.unknown().optional(),
    idempotencyKey: z.string().trim().min(8).max(STRING_LIMITS.idempotencyKey),
  })
  .strict();

export const EXCHANGE_BODY_MAX_BYTES = 4_096;
export const CREATE_ISSUE_BODY_MAX_BYTES = 400_000;
