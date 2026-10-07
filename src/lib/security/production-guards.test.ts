import { describe, expect, it } from "vitest";

import { isAuthorizedCronRequest, testRoutesEnabled } from "./production-guards";

function request(authorization?: string) {
  return new Request("https://example.com/api/cron/x", {
    headers: authorization ? { authorization } : {},
  });
}

describe("testRoutesEnabled", () => {
  it("opens only for test email mode outside production", () => {
    expect(testRoutesEnabled({ EMAIL_TRANSPORT: "test", NODE_ENV: "development" })).toBe(true);
    expect(testRoutesEnabled({ EMAIL_TRANSPORT: "test", NODE_ENV: "test" })).toBe(true);
  });

  it("stays closed in production even when test email mode is set by mistake", () => {
    expect(testRoutesEnabled({ EMAIL_TRANSPORT: "test", NODE_ENV: "production" })).toBe(false);
  });

  it("stays closed without test email mode", () => {
    expect(testRoutesEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(testRoutesEnabled({ EMAIL_TRANSPORT: "resend", NODE_ENV: "development" })).toBe(false);
    expect(testRoutesEnabled({})).toBe(false);
  });
});

describe("isAuthorizedCronRequest", () => {
  const production = { NODE_ENV: "production", CRON_SECRET: "s3cret-value" };

  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(request("Bearer s3cret-value"), production)).toBe(true);
  });

  it("rejects missing, wrong, partial, and differently shaped credentials", () => {
    expect(isAuthorizedCronRequest(request(), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer wrong"), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer s3cret"), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer s3cret-value-extra"), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("s3cret-value"), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("Basic s3cret-value"), production)).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer "), production)).toBe(false);
  });

  it("refuses everything in production when the secret is missing or blank", () => {
    expect(isAuthorizedCronRequest(request(), { NODE_ENV: "production" })).toBe(false);
    expect(
      isAuthorizedCronRequest(request("Bearer "), { NODE_ENV: "production", CRON_SECRET: "  " }),
    ).toBe(false);
    expect(
      isAuthorizedCronRequest(request("Bearer undefined"), { NODE_ENV: "production" }),
    ).toBe(false);
  });

  it("allows local runs without a secret outside production only", () => {
    expect(isAuthorizedCronRequest(request(), { NODE_ENV: "development" })).toBe(true);
  });

  it("still enforces the secret outside production when one is set", () => {
    expect(
      isAuthorizedCronRequest(request(), { NODE_ENV: "development", CRON_SECRET: "x" }),
    ).toBe(false);
  });
});
