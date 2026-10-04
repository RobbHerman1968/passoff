import { describe, expect, it } from "vitest";

import {
  isBlockedHostname,
  isBlockedIpAddress,
  validateFetchTarget,
} from "@/lib/website-analysis/ssrf";

describe("website analysis SSRF guards", () => {
  it("rejects localhost and loopback", async () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedIpAddress("127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::1")).toBe(true);

    const result = await validateFetchTarget({
      rawUrl: "http://localhost/admin",
      allowedOrigins: ["http://localhost"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blocked_hostname");
  });

  it("rejects private, link-local, and metadata ranges", () => {
    for (const ip of [
      "10.0.0.5",
      "192.168.1.10",
      "172.16.0.2",
      "169.254.169.254",
      "100.64.1.1",
      "224.0.0.1",
      "0.0.0.0",
      "fc00::1",
      "fe80::1",
    ]) {
      expect(isBlockedIpAddress(ip)).toBe(true);
    }
  });

  it("rejects credentials in URLs", async () => {
    const result = await validateFetchTarget({
      rawUrl: "https://user:pass@example.com/",
      allowedOrigins: ["https://example.com"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("credentials_present");
  });

  it("rejects origins outside the review allow-list", async () => {
    const result = await validateFetchTarget({
      rawUrl: "https://evil.example/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("origin_not_allowed");
  });

  it("rejects DNS results that resolve to private IPs (rebinding protection)", async () => {
    const result = await validateFetchTarget({
      rawUrl: "https://example.com/",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("dns_blocked");
  });

  it("accepts public hosts inside allowed origins", async () => {
    const result = await validateFetchTarget({
      rawUrl: "https://example.com/start",
      allowedOrigins: ["https://example.com"],
      lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(result.ok).toBe(true);
  });
});
