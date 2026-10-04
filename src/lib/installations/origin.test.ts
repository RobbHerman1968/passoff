import { describe, expect, it } from "vitest";

import {
  isOriginAllowed,
  normalizeOrigin,
  originsMatch,
} from "@/lib/installations/origin";

describe("origin validation", () => {
  it("normalizes scheme, hostname, and effective port", () => {
    expect(normalizeOrigin("https://Example.com:443/path")).toEqual({
      ok: true,
      origin: "https://example.com",
    });
    expect(normalizeOrigin("http://localhost:3000/app")).toEqual({
      ok: true,
      origin: "http://localhost:3000",
    });
  });

  it("rejects credentials, non-http schemes, and invalid values", () => {
    expect(normalizeOrigin("https://user:pass@example.com").ok).toBe(false);
    expect(normalizeOrigin("ftp://example.com").ok).toBe(false);
    expect(normalizeOrigin("not a url").ok).toBe(false);
  });

  it("compares origins exactly without substring or subdomain matching", () => {
    expect(originsMatch("https://example.com", "https://example.com/")).toBe(
      true,
    );
    expect(
      isOriginAllowed("https://app.example.com", ["https://example.com"]),
    ).toBe(false);
    expect(
      isOriginAllowed("https://example.com.evil.test", ["https://example.com"]),
    ).toBe(false);
    expect(
      isOriginAllowed("https://example.com", ["https://example.com"]),
    ).toBe(true);
  });

  it("supports localhost only when explicitly allowed", () => {
    expect(
      isOriginAllowed("http://localhost:3000", ["https://example.com"]),
    ).toBe(false);
    expect(
      isOriginAllowed("http://localhost:3000", ["http://localhost:3000"]),
    ).toBe(true);
  });
});
