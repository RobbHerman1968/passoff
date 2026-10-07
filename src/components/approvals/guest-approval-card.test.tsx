import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

import { GuestApprovalCard } from "@/components/approvals/guest-approval-card";
import type {
  ApprovalRequestView,
  GuestApprovalOffer,
  ReviewApprovalStatusView,
} from "@/lib/approvals/types";

vi.mock("@/app/r/[token]/approval-actions", () => ({
  decideApprovalFromLinkAction: vi.fn(),
}));

const request: ApprovalRequestView = {
  id: "req-1",
  state: "awaiting_decision",
  deploymentId: "dep-13",
  versionLabel: "v13",
  environmentName: "Production",
  recordedAt: "2026-10-05T12:00:00.000Z",
  message: "Please check the new footer.",
  dueAt: null,
  requestedAt: "2026-10-05T13:00:00.000Z",
  completedAt: null,
  cancelledAt: null,
  unresolvedAcknowledged: false,
  openIssueCount: 0,
  awaitingVerificationCount: 0,
  verifiedIssueCount: 3,
  requesterDisplayName: "Maya Studio",
  reviewerDisplayName: null,
  decisionNote: null,
  decidedByDisplayName: null,
  historical: false,
};

function offer(overrides: Partial<GuestApprovalOffer> = {}, status: Partial<ReviewApprovalStatusView> = {}): GuestApprovalOffer {
  return {
    canDecide: true,
    blockedReason: null,
    status: {
      visibleState: "awaiting_approval",
      currentDeploymentId: "dep-13",
      currentVersionLabel: "v13",
      currentRecordedAt: "2026-10-05T12:00:00.000Z",
      environmentName: "Production",
      activeRequest: request,
      history: [request],
      issueSummary: {
        openIssueCount: 0,
        awaitingVerificationCount: 0,
        verifiedIssueCount: 3,
        failedVerificationCount: 0,
      },
      feedbackDeadline: null,
      ...status,
    },
    ...overrides,
  };
}

describe("GuestApprovalCard", () => {
  it("lets a guest with approval permission decide on the waiting version", async () => {
    const { container } = render(<GuestApprovalCard token="tok" offer={offer()} />);

    expect(screen.getByRole("heading", { name: "Approval" })).toBeInTheDocument();
    expect(screen.getByText("Waiting for approval on v13")).toBeInTheDocument();
    expect(screen.getByText("Please check the new footer.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Approve this review" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Request changes" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByRole("button", { name: "Approve this review" })).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("never shows a decision form to a view-only link", () => {
    render(
      <GuestApprovalCard
        token="tok"
        offer={offer({ canDecide: false, blockedReason: "view_only" })}
      />,
    );
    expect(screen.getByText(/lets you view and comment, but not approve/i)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("explains when nobody has asked for approval yet", () => {
    render(
      <GuestApprovalCard
        token="tok"
        offer={offer(
          { canDecide: false, blockedReason: "no_request" },
          { visibleState: "not_requested", activeRequest: null, history: [] },
        )}
      />,
    );
    expect(screen.getByText("Approval not requested")).toBeInTheDocument();
    expect(screen.getByText(/hasn’t asked for approval on this version yet/i)).toBeInTheDocument();
  });

  it("warns when issues remain unresolved", () => {
    render(
      <GuestApprovalCard
        token="tok"
        offer={offer(
          {},
          {
            issueSummary: {
              openIssueCount: 2,
              awaitingVerificationCount: 1,
              verifiedIssueCount: 0,
              failedVerificationCount: 0,
            },
          },
        )}
      />,
    );
    expect(screen.getByText("Some issues aren’t verified yet")).toBeInTheDocument();
  });
});
