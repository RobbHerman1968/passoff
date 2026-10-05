import { describe, expect, it } from "vitest";

import { signWebhookBody, verifyWebhookSignature } from "@/lib/webhooks/sign";
import { parseWebhookUrl } from "@/lib/webhooks/url";
import { WEBHOOK_SCHEMA_VERSION } from "@/lib/webhooks/types";

describe("webhook security", () => {
  it("rejects localhost, loopback, private, credentials, and metadata hosts", () => {
    expect(parseWebhookUrl("http://127.0.0.1/hook", false).ok).toBe(false);
    expect(parseWebhookUrl("https://localhost/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("https://10.0.0.4/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("https://192.168.1.8/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("https://169.254.169.254/latest", true).ok).toBe(false);
    expect(parseWebhookUrl("https://metadata.google.internal/", true).ok).toBe(false);
    expect(parseWebhookUrl("https://user:pass@example.com/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("ftp://example.com/hook", true).ok).toBe(false);
    expect(parseWebhookUrl("https://example.com:8443/hook", true).ok).toBe(false);
  });

  it("allows https production endpoints on port 443", () => {
    const parsed = parseWebhookUrl("https://hooks.example.com/passoff", true);
    expect(parsed.ok).toBe(true);
  });

  it("signs and verifies the exact raw body with a timestamp", () => {
    const body = JSON.stringify({
      eventId: "11111111-1111-4111-8111-111111111111",
      schemaVersion: WEBHOOK_SCHEMA_VERSION,
    });
    const header = signWebhookBody("whsec_test", 1_700_000_000, body);
    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        header,
        rawBody: body,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        header,
        rawBody: `${body} `,
        nowSeconds: 1_700_000_000,
      }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: "whsec_test",
        header,
        rawBody: body,
        nowSeconds: 1_700_000_000 + 400,
      }),
    ).toBe(false);
  });
});
