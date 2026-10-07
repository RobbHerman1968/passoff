import { describe, expect, it } from "vitest";

import { toSdkApprovalView } from "@/lib/approvals/sdk-view";
import type {
  ApprovalRequestView,
  GuestApprovalOffer,
  ReviewApprovalStatusView,
} from "@/lib/approvals/types";

const request: ApprovalRequestView = {
  id: "request-1",
  state: "awaiting_decision",
  deploymentId: "deployment-1",
  versionLabel: "v1.4",
  environmentName: "Staging",
  recordedAt: null,
  message: "Please check pricing.",
  dueAt: null,
  requestedAt: "2026-10-01T00:00:00.000Z",
  completedAt: null,
  cancelledAt: null,
  unresolvedAcknowledged: false,
  openIssueCount: 0,
  awaitingVerificationCount: 0,
  verifiedIssueCount: 0,
  requesterDisplayName: "Sam",
  reviewerDisplayName: null,
  decisionNote: null,
  decidedByDisplayName: null,
  historical: false,
};

const status: ReviewApprovalStatusView = {
  visibleState: "awaiting_approval",
  currentDeploymentId: "deployment-1",
  currentVersionLabel: "v1.4",
  currentRecordedAt: null,
  environmentName: "Staging",
  activeRequest: request,
  history: [request],
  issueSummary: {
    openIssueCount: 0,
    awaitingVerificationCount: 0,
    verifiedIssueCount: 0,
    failedVerificationCount: 0,
  },
  feedbackDeadline: null,
};

describe("toSdkApprovalView", () => {
  it("gives the embed what it needs to decide on the current version", () => {
    const offer: GuestApprovalOffer = { status, canDecide: true, blockedReason: null };
    expect(toSdkApprovalView(offer)).toEqual({
      visibleState: "awaiting_approval",
      statusLabel: "Waiting for approval on v1.4",
      versionLabel: "v1.4",
      canDecide: true,
      blockedReason: null,
      request: {
        id: "request-1",
        deploymentId: "deployment-1",
        versionLabel: "v1.4",
        requesterDisplayName: "Sam",
        message: "Please check pricing.",
      },
    });
  });

  it("never includes request details for a link that can’t decide", () => {
    const view = toSdkApprovalView({
      status,
      canDecide: false,
      blockedReason: "view_only",
    });
    expect(view.canDecide).toBe(false);
    expect(view.request).toBeNull();
    expect(view.blockedReason).toBe("view_only");
    expect(JSON.stringify(view)).not.toContain("Please check pricing.");
  });

  it("does not offer a decision when there is no waiting request", () => {
    const view = toSdkApprovalView({
      status: { ...status, activeRequest: null, visibleState: "not_requested" },
      canDecide: true,
      blockedReason: null,
    });
    expect(view.canDecide).toBe(false);
    expect(view.request).toBeNull();
  });
});
