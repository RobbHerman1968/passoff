import { describe, expect, it } from "vitest";

import { sanitizeCallbackUrl, sanitizePostSignUpUrl } from "@/lib/auth/callback-url";

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

describe("sanitizePostSignUpUrl", () => {
  const token = "abcdefghijklmnopqrstuvwxyz0123456789ABCD";

  it("sends new accounts to onboarding by default", () => {
    expect(sanitizePostSignUpUrl(undefined)).toBe("/onboarding");
    expect(sanitizePostSignUpUrl("/dashboard")).toBe("/onboarding");
    expect(sanitizePostSignUpUrl("/settings/members")).toBe("/onboarding");
  });

  it("returns people to the invitation they came from", () => {
    expect(sanitizePostSignUpUrl(`/invite/${token}`)).toBe(`/invite/${token}`);
  });

  it("ignores unsafe or malformed invitation destinations", () => {
    expect(sanitizePostSignUpUrl("https://evil.example/invite/" + token)).toBe("/onboarding");
    expect(sanitizePostSignUpUrl("//evil.example/invite/" + token)).toBe("/onboarding");
    expect(sanitizePostSignUpUrl("/invite/short")).toBe("/onboarding");
    expect(sanitizePostSignUpUrl(`/invite/${token}/extra`)).toBe("/onboarding");
  });
});
