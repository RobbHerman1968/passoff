import { describe, expect, it } from "vitest";

import {
  REVIEWER_SESSION_COOKIE,
  ReviewerSessionError,
  createReviewerSessionToken,
  readReviewerSessionCookie,
  verifyReviewerSessionToken,
} from "@/lib/rooms/reviewer-session";

describe("reviewer session credentials", () => {
  const projectId = "11111111-2222-3333-4444-555555555555";
  const otherProjectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const reviewerId = "99999999-8888-7777-6666-555555555555";
  const shareToken = "share-token-alpha";
  const otherShareToken = "share-token-beta";

  it("issues a verifiable credential bound to project + share token", () => {
    const token = createReviewerSessionToken({
      reviewerId,
      projectId,
      shareToken,
    });
    const payload = verifyReviewerSessionToken(token, { projectId, shareToken });
    expect(payload.reviewerId).toBe(reviewerId);
    expect(payload.projectId).toBe(projectId);
  });

  it("rejects missing credentials", () => {
    expect(() =>
      verifyReviewerSessionToken(null, { projectId, shareToken }),
    ).toThrow(ReviewerSessionError);
  });

  it("rejects forged signatures", () => {
    const token = createReviewerSessionToken({ reviewerId, projectId, shareToken });
    const forged = `${token.slice(0, -4)}aaaa`;
    expect(() => verifyReviewerSessionToken(forged, { projectId, shareToken })).toThrow(
      /Invalid reviewer session/,
    );
  });

  it("rejects expired credentials", () => {
    const token = createReviewerSessionToken({
      reviewerId,
      projectId,
      shareToken,
      maxAgeSec: 1,
      nowMs: Date.now() - 60_000,
    });
    expect(() => verifyReviewerSessionToken(token, { projectId, shareToken })).toThrow(
      /expired/i,
    );
  });

  it("rejects credentials from another project", () => {
    const token = createReviewerSessionToken({ reviewerId, projectId, shareToken });
    expect(() =>
      verifyReviewerSessionToken(token, { projectId: otherProjectId, shareToken }),
    ).toThrow(/project/i);
  });

  it("rejects credentials from another share link", () => {
    const token = createReviewerSessionToken({ reviewerId, projectId, shareToken });
    expect(() =>
      verifyReviewerSessionToken(token, { projectId, shareToken: otherShareToken }),
    ).toThrow(/share link/i);
  });

  it("parses the HttpOnly cookie name from a Cookie header", () => {
    const token = createReviewerSessionToken({ reviewerId, projectId, shareToken });
    const header = `other=1; ${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/`;
    expect(readReviewerSessionCookie(header)).toBe(token);
  });

  it("knowing an author email alone does not create a valid edit credential", () => {
    // Payload never embeds email. API-level coverage that identify-by-email cannot
    // reclaim another reviewer lives in tests/integration/public-reviewer-identity.test.ts.
    const token = createReviewerSessionToken({ reviewerId, projectId, shareToken });
    expect(token.includes("alex")).toBe(false);
    expect(token.includes("@")).toBe(false);
    const payload = verifyReviewerSessionToken(token, { projectId, shareToken });
    expect(payload).not.toHaveProperty("email");
    expect(payload.reviewerId).toBe(reviewerId);
  });
});
