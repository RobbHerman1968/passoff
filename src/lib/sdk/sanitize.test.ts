import { describe, expect, it } from "vitest";

import {
  sanitizeAnchor,
  sanitizeIdempotencyKey,
  sanitizeIssueBody,
  sanitizeScreenshot,
} from "@/lib/sdk/sanitize";

describe("SDK payload sanitization", () => {
  it("keeps approved anchor fields and drops secrets-shaped values", () => {
    const anchor = sanitizeAnchor({
      pageUrl: "https://example.com/pricing#promo",
      route: "/pricing",
      pageTitle: "Pricing",
      nearbyVisibleText: "From $29",
      elementTag: "button",
      accessibleName: "Buy",
      accessibleRole: "button",
      stableElementId: "buy",
      approvedDataAttributes: {
        "data-testid": "buy",
        "data-secret": "nope",
      },
      cssSelector: "button#buy",
      ancestryFingerprint: "main>button",
      normalizedPosition: { x: 0.5, y: 0.25 },
      documentPosition: { x: 10, y: 20 },
      elementBounds: { x: 0, y: 0, width: 80, height: 40 },
      viewport: { width: 1280, height: 720 },
      devicePixelRatio: 2,
      environment: { browser: "Chrome", operatingSystem: "macOS" },
      hostBuildId: "abc",
      capturedAt: "2026-10-04T12:00:00.000Z",
      private: false,
      cookie: "session=abc",
      localStorage: { token: "x" },
    });

    expect(anchor?.pageUrl).toBe("https://example.com/pricing");
    expect(anchor?.approvedDataAttributes).toEqual({ "data-testid": "buy" });
    expect(JSON.stringify(anchor)).not.toContain("session=abc");
    expect(JSON.stringify(anchor)).not.toContain("data-secret");
  });

  it("redacts private anchors", () => {
    const anchor = sanitizeAnchor({
      pageUrl: "https://example.com/",
      nearbyVisibleText: "4242",
      accessibleName: "Card",
      stableElementId: "card",
      cssSelector: "#card",
      approvedDataAttributes: { "data-testid": "card" },
      viewport: { width: 800, height: 600 },
      private: true,
      normalizedPosition: { x: 0.1, y: 0.1 },
    });
    expect(anchor?.selectedText).toBeNull();
    expect(anchor?.accessibleName).toBeNull();
    expect(anchor?.cssSelector).toBeNull();
    expect(anchor?.approvedDataAttributes).toEqual({});
  });

  it("rejects oversized or non-png screenshots", () => {
    const unavailable = sanitizeScreenshot({
      status: "captured",
      dataUrl: "data:image/jpeg;base64,aaaa",
    });
    expect(unavailable.status).toBe("unavailable");

    const ok = sanitizeScreenshot({
      status: "captured",
      reason: "ok",
      dataUrl: `data:image/png;base64,${"a".repeat(100)}`,
    });
    expect(ok.status).toBe("captured");
    expect(ok.base64).toHaveLength(100);
  });

  it("validates issue body and idempotency keys", () => {
    expect(sanitizeIssueBody("  hello  ")).toBe("hello");
    expect(sanitizeIssueBody("")).toBeNull();
    expect(sanitizeIdempotencyKey("sdk_abc-123")).toBe("sdk_abc-123");
    expect(sanitizeIdempotencyKey("bad key")).toBeNull();
  });
});
