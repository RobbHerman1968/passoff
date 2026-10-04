import { describe, expect, it } from "vitest";

import { normalizeWebsiteUrl } from "@/lib/projects/urls";

describe("normalizeWebsiteUrl", () => {
  it("normalizes https website addresses and derives the origin", () => {
    const result = normalizeWebsiteUrl("https://Example.com/path?q=1#hash");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startingUrl).toBe("https://example.com/path?q=1");
    expect(result.allowedOrigin).toBe("https://example.com");
  });

  it("adds https when the scheme is omitted", () => {
    const result = normalizeWebsiteUrl("staging.example.com/app");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.startingUrl).toBe("https://staging.example.com/app");
    expect(result.allowedOrigin).toBe("https://staging.example.com");
  });

  it("rejects non-http schemes", () => {
    const result = normalizeWebsiteUrl("ftp://example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/http/i);
  });

  it("rejects embedded usernames and passwords", () => {
    const result = normalizeWebsiteUrl("https://user:pass@example.com");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/username and password/i);
  });

  it("rejects empty values", () => {
    const result = normalizeWebsiteUrl("   ");
    expect(result.ok).toBe(false);
  });
});
