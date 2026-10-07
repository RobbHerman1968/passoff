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

  it("rejects every non-public IPv4 and IPv6 form, including mapped and bracketed ones", () => {
    const blocked = [
      "https://0.0.0.0/h",
      "https://100.64.0.1/h",
      "https://198.18.0.1/h",
      "https://224.0.0.1/h",
      "https://255.255.255.255/h",
      "https://2130706433/h", // decimal 127.0.0.1
      "https://0x7f.1/h",
      "https://[::1]/h",
      "https://[::]/h",
      "https://[fe80::1]/h",
      "https://[fd00::1]/h",
      "https://[fec0::1]/h",
      "https://[ff02::1]/h",
      "https://[::ffff:127.0.0.1]/h",
      "https://[::ffff:7f00:1]/h",
      "https://[::ffff:a9fe:a9fe]/h", // 169.254.169.254
      "https://[64:ff9b::7f00:1]/h",
      "https://[2002:7f00:1::]/h",
      "https://service.internal/h",
      "https://printer.local/h",
    ];
    for (const url of blocked) {
      expect(parseWebhookUrl(url, true).ok, url).toBe(false);
    }
  });

  it("allows public IP literals and ordinary hosts", () => {
    expect(parseWebhookUrl("https://93.184.216.34/h", true).ok).toBe(true);
    expect(parseWebhookUrl("https://[2606:2800:220:1::1]/h", true).ok).toBe(true);
    expect(parseWebhookUrl("https://hooks.example.com/h", true).ok).toBe(true);
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
