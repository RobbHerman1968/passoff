import { describe, expect, it } from "vitest";

import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";

describe("sanitizeCallbackUrl", () => {
  it("allows safe relative destinations", () => {
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/onboarding?x=1")).toBe("/onboarding?x=1");
  });

  it("rejects open redirects", () => {
    expect(sanitizeCallbackUrl("https://evil.example/phish")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("//evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/\\evil.example")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/dashboard");
  });
});
