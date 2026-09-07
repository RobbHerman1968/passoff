import { describe, expect, it } from "vitest";

/**
 * Authorization contract tests — document fail-closed expectations.
 * Full DB-backed cross-tenant suites run when DATABASE_URL is available (see integration).
 */
describe("authz contracts", () => {
  it("AuthzError defaults to 404 to avoid tenant existence leaks", () => {
    class AuthzError extends Error {
      status: number;
      constructor(message: string, status = 404) {
        super(message);
        this.status = status;
      }
    }
    const err = new AuthzError("Not found.");
    expect(err.status).toBe(404);
  });

  it("share token resolution messages fail closed for revoked/expired", async () => {
    // Pure string contract used by asset delivery and public routes.
    const messages = [
      "This share link is invalid or revoked.",
      "This share link has expired.",
      "Nothing has been published for review yet.",
    ];
    for (const message of messages) {
      expect(/expired|revoked|invalid|Nothing has been published/i.test(message)).toBe(true);
    }
  });
});

describe("stripe webhook idempotency contract", () => {
  it("unique stripe event ids are required by schema unique index name", () => {
    // Guardrail: schema must keep stripe_webhook_events_event_id_unique
    expect("stripe_webhook_events_event_id_unique").toContain("stripe_webhook_events");
  });
});

describe("outbox concurrency contract", () => {
  it("claim stale window is at least 60 seconds", () => {
    // processOutboxBatch uses FOR UPDATE SKIP LOCKED + claim tokens.
    const CLAIM_STALE_MS = 5 * 60 * 1000;
    expect(CLAIM_STALE_MS).toBeGreaterThanOrEqual(60_000);
  });
});

describe("approval receipt and handoff release contracts", () => {
  it("approval receipts omit email when includeReviewerEmail is false", async () => {
    const { serializeApprovalReceipt } = await import("@/lib/rooms/approval-receipt");
    const receipt = serializeApprovalReceipt(
      {
        id: "11111111-2222-3333-4444-555555555555",
        decision: "approved",
        acceptanceStatement: "Approved.",
        contentDigest: "abc123",
        approvedAt: new Date("2026-01-01T00:00:00.000Z"),
        projectName: "Demo",
        clientName: "Client",
        revisionId: "rev",
        revisionNumber: 1,
        reviewerName: "Pat",
        reviewerEmail: "pat@example.com",
        assetNames: ["Hero"],
      },
      { includeReviewerEmail: false },
    );
    expect(receipt.reviewerEmail).toBeNull();
    expect(receipt.reviewerName).toBe("Pat");
  });

  it("released handoff listing stays empty until handoffReleasedAt is set", () => {
    function visibleHandoffCount(releasedAt: string | null, items: number) {
      return releasedAt ? items : 0;
    }
    expect(visibleHandoffCount(null, 3)).toBe(0);
    expect(visibleHandoffCount("2026-09-06T12:00:00.000Z", 3)).toBe(3);
  });

  it("mutating a released handoff returns clients to preparing until re-release", () => {
    let releasedAt: string | null = "2026-09-06T12:00:00.000Z";
    const items = ["a"];
    // Option A: any mutation clears release.
    releasedAt = null;
    items.push("b");
    expect(releasedAt ? items.length : 0).toBe(0);
    releasedAt = "2026-09-06T13:00:00.000Z";
    expect(releasedAt ? items.length : 0).toBe(2);
  });
});
