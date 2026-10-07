import { describe, expect, it } from "vitest";

import {
  jsonContainsForbiddenKeys,
  telemetryBatchSchema,
} from "@/lib/telemetry/event-schema";
import { isSensitiveRoute, normalizeTelemetryRoute } from "@/lib/telemetry/routes";
import { bucketCoordinate, viewportGroupFromWidth } from "@/lib/telemetry/contract";

describe("telemetry routes", () => {
  it("strips identifiers from routes", () => {
    expect(
      normalizeTelemetryRoute("/users/550e8400-e29b-41d4-a716-446655440000"),
    ).toBe("/users/:id");
    expect(normalizeTelemetryRoute("/search", "/catalog")).toBe("/catalog");
  });

  it("excludes sensitive routes", () => {
    expect(isSensitiveRoute("/login")).toBe(true);
    expect(isSensitiveRoute("/checkout/pay")).toBe(true);
    expect(isSensitiveRoute("/pricing")).toBe(false);
    expect(isSensitiveRoute("/secret", ["/secret"])).toBe(true);
  });
});

describe("telemetry contract", () => {
  it("buckets coordinates and viewports", () => {
    expect(bucketCoordinate(0)).toBe(0);
    expect(bucketCoordinate(1)).toBe(19);
    expect(viewportGroupFromWidth(320)).toBe("mobile");
    expect(viewportGroupFromWidth(800)).toBe("tablet");
    expect(viewportGroupFromWidth(1280)).toBe("desktop");
  });

  it("rejects forbidden fields", () => {
    expect(jsonContainsForbiddenKeys({ email: "a@b.c" })).toBe("email");
    expect(jsonContainsForbiddenKeys({ password: "x" })).toBe("password");
    expect(jsonContainsForbiddenKeys({ eventType: "page_view" })).toBeNull();
  });

  it("accepts a valid page view batch", () => {
    const parsed = telemetryBatchSchema.safeParse({
      schemaVersion: 1,
      batchId: "11111111-1111-4111-8111-111111111111",
      installationKey: "pk_" + "a".repeat(32),
      events: [
        {
          schemaVersion: 1,
          eventId: "22222222-2222-4222-8222-222222222222",
          batchId: "11111111-1111-4111-8111-111111111111",
          eventType: "page_view",
          occurredAt: "2026-10-05T12:00:00.000Z",
          route: "/pricing",
          deploymentVersion: "v1",
          viewportGroup: "desktop",
          sampling: { percent: 100, selected: true },
          tabSession: "ab".repeat(32),
          consentState: "granted",
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
