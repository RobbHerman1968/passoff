import { z } from "zod";

import {
  ELEMENT_CATEGORIES,
  EVENT_ID_PATTERN,
  FORBIDDEN_EVENT_KEYS,
  MAX_BATCH_BYTES,
  MAX_EVENTS_PER_BATCH,
  ROUTE_MAX,
  SCROLL_MILESTONES,
  TAB_SESSION_PATTERN,
  TELEMETRY_SCHEMA_VERSION,
  VIEWPORT_GROUPS,
  isAllowedAnalyticsLabel,
} from "@/lib/telemetry/contract";

const uuidEventId = z.string().regex(EVENT_ID_PATTERN);
const base = {
  schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
  eventId: uuidEventId,
  batchId: uuidEventId,
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/),
  route: z.string().min(1).max(ROUTE_MAX),
  deploymentVersion: z.string().max(120),
  viewportGroup: z.enum(VIEWPORT_GROUPS),
  sampling: z
    .object({
      percent: z.number().int().min(1).max(100),
      selected: z.literal(true),
    })
    .strict(),
  tabSession: z.string().regex(TAB_SESSION_PATTERN),
  consentState: z.enum(["granted", "aggregate_notice"]),
  testMode: z.boolean().optional(),
};

const label = z.string().refine(isAllowedAnalyticsLabel);
const category = z.enum(ELEMENT_CATEGORIES);

export const telemetryEventSchema = z.discriminatedUnion("eventType", [
  z.object({ ...base, eventType: z.literal("page_view") }).strict(),
  z
    .object({
      ...base,
      eventType: z.literal("element_click"),
      elementCategory: category,
      analyticsLabel: label,
      coordinateBucketX: z.number().int().min(0).max(19),
      coordinateBucketY: z.number().int().min(0).max(19),
    })
    .strict(),
  z
    .object({
      ...base,
      eventType: z.literal("scroll_milestone"),
      scrollMilestone: z.union(
        SCROLL_MILESTONES.map((value) => z.literal(value)) as unknown as [
          z.ZodLiteral<25>,
          z.ZodLiteral<50>,
          z.ZodLiteral<75>,
          z.ZodLiteral<90>,
          z.ZodLiteral<100>,
        ],
      ),
    })
    .strict(),
  z
    .object({
      ...base,
      eventType: z.literal("repeat_click_signal"),
      elementCategory: category,
      analyticsLabel: label,
      clickCount: z.number().int().min(3).max(50),
    })
    .strict(),
  z
    .object({
      ...base,
      eventType: z.literal("dead_click_candidate"),
      elementCategory: category,
      analyticsLabel: label,
      waitMs: z.number().int().min(400).max(8_000),
    })
    .strict(),
  z
    .object({
      ...base,
      eventType: z.literal("sanitized_javascript_error"),
      errorCategory: z.string().min(1).max(40),
      errorFingerprint: z.string().min(1).max(120),
      sourceCategory: z.enum(["first_party", "unknown"]),
    })
    .strict(),
]);

export const telemetryBatchSchema = z
  .object({
    schemaVersion: z.literal(TELEMETRY_SCHEMA_VERSION),
    batchId: uuidEventId,
    installationKey: z.string().min(1).max(80),
    events: z.array(telemetryEventSchema).min(1).max(MAX_EVENTS_PER_BATCH),
  })
  .strict();

export type ParsedTelemetryBatch = z.infer<typeof telemetryBatchSchema>;

export function jsonContainsForbiddenKeys(value: unknown, path = ""): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = jsonContainsForbiddenKeys(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (
        (FORBIDDEN_EVENT_KEYS as readonly string[]).includes(key) ||
        /password|cookie|authorization|innerHTML|outerHTML/i.test(key)
      ) {
        return key;
      }
      const found = jsonContainsForbiddenKeys(child, `${path}.${key}`);
      if (found) return found;
    }
  }
  return null;
}

export function encodedBatchBytes(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

export { MAX_BATCH_BYTES, MAX_EVENTS_PER_BATCH };
