import { afterEach, describe, expect, it } from "vitest";

import {
  clearStoredVerificationSession,
  consumeExchangeCodeFromLocation,
  consumeVerificationExchangeFromLocation,
  readStoredVerificationSession,
  writeStoredVerificationSession,
} from "./session-store";
import { VERIFICATION_HASH_PARAM } from "./verification/contract";

describe("SDK session store", () => {
  afterEach(() => {
    clearStoredVerificationSession();
    window.history.replaceState(null, "", "/page");
  });

  it("retains the verification bootstrap needed to resume after refresh", () => {
    const bootstrap = {
      issueNumber: 12,
      issueTitle: "Checkout button overlaps",
      environmentName: "Production",
      expectedVersion: "release-12",
      pageRoute: "/checkout",
      selectedChecks: ["element_visibility"],
      namedHook: null,
      hookAllowlist: [],
      returnPath: "/issues/12",
      marker: null,
    };
    writeStoredVerificationSession({
      sessionToken: "session-token",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      installationKey: "pk_test",
      bootstrap,
    });

    expect(readStoredVerificationSession()).toEqual(
      expect.objectContaining({ sessionToken: "session-token", bootstrap }),
    );
  });

  it("strips the review exchange from the URL immediately", () => {
    window.history.replaceState(null, "", `/page#passoff_x=review-one&keep=1`);
    expect(consumeExchangeCodeFromLocation()).toBe("review-one");
    expect(window.location.hash).toBe("#keep=1");
    expect(consumeExchangeCodeFromLocation()).toBeNull();
  });

  it("strips the one-time verification exchange from the URL immediately", () => {
    window.history.replaceState(
      null,
      "",
      `/cart#${VERIFICATION_HASH_PARAM}=verify-one`,
    );
    expect(consumeVerificationExchangeFromLocation()).toBe("verify-one");
    expect(window.location.hash).toBe("");
    expect(consumeVerificationExchangeFromLocation()).toBeNull();
  });
});
