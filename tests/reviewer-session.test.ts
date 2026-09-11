import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  REVIEWER_SESSION_COOKIE,
  ReviewerSessionError,
  createReviewerSessionToken,
  getReviewerSessionSecret,
  readReviewerSessionCookie,
  verifyReviewerSessionToken,
} from "@/lib/rooms/reviewer-session";

describe("reviewer session credentials", () => {
  const roomId = "11111111-2222-3333-4444-555555555555";
  const otherRoomId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const reviewerId = "99999999-8888-7777-6666-555555555555";
  const shareToken = "share-token-alpha";
  const otherShareToken = "share-token-beta";

  it("issues a verifiable credential bound to room + share token", () => {
    const token = createReviewerSessionToken({
      reviewerId,
      roomId,
      shareToken,
    });
    const payload = verifyReviewerSessionToken(token, { roomId, shareToken });
    expect(payload.reviewerId).toBe(reviewerId);
    expect(payload.roomId).toBe(roomId);
    expect(payload).not.toHaveProperty("projectId");
  });

  it("rejects missing credentials", () => {
    expect(() =>
      verifyReviewerSessionToken(null, { roomId, shareToken }),
    ).toThrow(ReviewerSessionError);
  });

  it("rejects forged signatures", () => {
    const token = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    const forged = `${token.slice(0, -4)}aaaa`;
    expect(() => verifyReviewerSessionToken(forged, { roomId, shareToken })).toThrow(
      /Invalid reviewer session/,
    );
  });

  it("rejects expired credentials", () => {
    const token = createReviewerSessionToken({
      reviewerId,
      roomId,
      shareToken,
      maxAgeSec: 1,
      nowMs: Date.now() - 60_000,
    });
    expect(() => verifyReviewerSessionToken(token, { roomId, shareToken })).toThrow(
      /expired/i,
    );
  });

  it("rejects credentials from another room", () => {
    const token = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    expect(() =>
      verifyReviewerSessionToken(token, { roomId: otherRoomId, shareToken }),
    ).toThrow(/room/i);
  });

  it("rejects credentials from another share link", () => {
    const token = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    expect(() =>
      verifyReviewerSessionToken(token, { roomId, shareToken: otherShareToken }),
    ).toThrow(/share link/i);
  });

  it("parses the HttpOnly cookie name from a Cookie header", () => {
    const token = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    const header = `other=1; ${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(token)}; path=/`;
    expect(readReviewerSessionCookie(header)).toBe(token);
  });

  it("knowing an author email alone does not create a valid edit credential", () => {
    // Payload never embeds email. API-level coverage that identify-by-email cannot
    // reclaim another reviewer lives in tests/integration/public-reviewer-identity.test.ts.
    const token = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    expect(token.includes("alex")).toBe(false);
    expect(token.includes("@")).toBe(false);
    const payload = verifyReviewerSessionToken(token, { roomId, shareToken });
    expect(payload).not.toHaveProperty("email");
    expect(payload.reviewerId).toBe(reviewerId);
  });

  it("accepts legacy signed projectId payloads and normalizes them to roomId", () => {
    const fresh = createReviewerSessionToken({ reviewerId, roomId, shareToken });
    const [freshBody] = fresh.split(".");
    const current = JSON.parse(Buffer.from(freshBody!, "base64url").toString("utf8")) as {
      reviewerId: string;
      roomId: string;
      shareTokenHash: string;
      exp: number;
    };
    const { roomId: legacyProjectId, ...rest } = current;
    const body = Buffer.from(
      JSON.stringify({ ...rest, projectId: legacyProjectId }),
      "utf8",
    ).toString("base64url");
    const signature = createHmac("sha256", getReviewerSessionSecret())
      .update(body)
      .digest("base64url");

    const payload = verifyReviewerSessionToken(`${body}.${signature}`, { roomId, shareToken });
    expect(payload.roomId).toBe(roomId);
    expect(payload).not.toHaveProperty("projectId");
  });
});
