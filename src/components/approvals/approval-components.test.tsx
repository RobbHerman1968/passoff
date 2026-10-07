import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApprovalPanel } from "@/components/approvals/approval-panel";
import { DecideApprovalDialog } from "@/components/approvals/decide-approval-dialog";
import { RequestApprovalDialog } from "@/components/approvals/request-approval-dialog";
import type {
  ApprovalRequestView,
  IssueApprovalSummary,
  ReviewApprovalStatusView,
} from "@/lib/approvals/types";

const refresh = vi.fn();
const requestApprovalAction = vi.fn();
const decideApprovalAction = vi.fn();
const cancelApprovalRequestAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/app/(app)/projects/approval-actions", () => ({
  requestApprovalAction: (...args: unknown[]) => requestApprovalAction(...args),
  decideApprovalAction: (...args: unknown[]) => decideApprovalAction(...args),
  cancelApprovalRequestAction: (...args: unknown[]) => cancelApprovalRequestAction(...args),
}));

const clean: IssueApprovalSummary = {
  openIssueCount: 0,
  awaitingVerificationCount: 0,
  verifiedIssueCount: 3,
  failedVerificationCount: 0,
};
const unresolved: IssueApprovalSummary = {
  openIssueCount: 2,
  awaitingVerificationCount: 1,
  verifiedIssueCount: 0,
  failedVerificationCount: 0,
};

const scope = { projectId: "project-1", reviewId: "review-1" };
const summaryProps = {
  environmentName: "Production",
  versionLabel: "Release 42",
  recordedAt: "2026-10-01T12:00:00.000Z",
  feedbackDeadline: null,
};

function request(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    id: "request-1",
    state: "awaiting_decision",
    deploymentId: "deploy-2",
    versionLabel: "Release 42",
    environmentName: "Production",
    recordedAt: "2026-10-01T12:00:00.000Z",
    message: "Please check the pricing page.",
    dueAt: null,
    requestedAt: "2026-10-02T12:00:00.000Z",
    completedAt: null,
    cancelledAt: null,
    unresolvedAcknowledged: false,
    openIssueCount: 0,
    awaitingVerificationCount: 0,
    verifiedIssueCount: 1,
    requesterDisplayName: "Owner Studio",
    reviewerDisplayName: null,
    decisionNote: null,
    decidedByDisplayName: null,
    historical: false,
    ...overrides,
  };
}

function status(overrides: Partial<ReviewApprovalStatusView> = {}): ReviewApprovalStatusView {
  return {
    visibleState: "not_requested",
    currentDeploymentId: "deploy-2",
    currentVersionLabel: "Release 42",
    currentRecordedAt: "2026-10-01T12:00:00.000Z",
    environmentName: "Production",
    activeRequest: null,
    history: [],
    issueSummary: clean,
    feedbackDeadline: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RequestApprovalDialog", () => {
  function renderDialog(summary: IssueApprovalSummary, withLinks = true) {
    return render(
      <RequestApprovalDialog
        {...scope}
        {...summaryProps}
        issueSummary={summary}
        reviewers={[]}
        approvalLinks={withLinks ? [{ id: "link-1", label: "Approval link · Oct 7" }] : []}
        triggerLabel="Ask for approval"
      />,
    );
  }

  it("sends a request without the acknowledgment when every issue is verified", async () => {
    requestApprovalAction.mockResolvedValueOnce({ ok: true, requestId: "request-1" });
    const user = userEvent.setup();
    renderDialog(clean);

    await user.click(screen.getByRole("button", { name: "Ask for approval" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(await axe(dialog)).toHaveNoViolations();

    await user.type(within(dialog).getByLabelText("Message (optional)"), "Take a look");
    await user.click(within(dialog).getByRole("button", { name: "Send approval request" }));

    await waitFor(() =>
      expect(requestApprovalAction).toHaveBeenCalledWith({
        ...scope,
        message: "Take a look",
        reviewerUserId: null,
        shareLinkId: null,
        acknowledgeUnresolved: false,
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("requires the unresolved-issues acknowledgment before sending", async () => {
    const user = userEvent.setup();
    renderDialog(unresolved);

    await user.click(screen.getByRole("button", { name: "Ask for approval" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Send approval request" }));

    expect(requestApprovalAction).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Confirm that you understand");

    await user.click(within(dialog).getByRole("checkbox"));
    requestApprovalAction.mockResolvedValueOnce({ ok: true, requestId: "request-1" });
    await user.click(within(dialog).getByRole("button", { name: "Send approval request" }));
    await waitFor(() =>
      expect(requestApprovalAction).toHaveBeenCalledWith(
        expect.objectContaining({ acknowledgeUnresolved: true }),
      ),
    );
  });

  it("explains how to get a guest link when none can approve yet", async () => {
    const user = userEvent.setup();
    renderDialog(clean, false);
    await user.click(screen.getByRole("button", { name: "Ask for approval" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("No active guest link can approve yet");
    expect(
      within(dialog).getByRole("radio", { name: /guest with an approval link/i }),
    ).toBeDisabled();
  });

  it("keeps the message and shows a plain error when the server declines", async () => {
    requestApprovalAction.mockResolvedValueOnce({
      ok: false,
      message: "An approval request is already waiting for this version.",
    });
    const user = userEvent.setup();
    renderDialog(clean);
    await user.click(screen.getByRole("button", { name: "Ask for approval" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Message (optional)"), "Keep me");
    await user.click(within(dialog).getByRole("button", { name: "Send approval request" }));

    expect(await within(dialog).findByText(/already waiting/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Message (optional)")).toHaveValue("Keep me");
    expect(within(dialog).getByRole("button", { name: "Try again" })).toBeEnabled();
  });
});

describe("DecideApprovalDialog", () => {
  function renderDecide(decision: "approved" | "changes_requested", summary = clean) {
    return render(
      <DecideApprovalDialog
        {...scope}
        {...summaryProps}
        deploymentId="deploy-2"
        requestId="request-1"
        decision={decision}
        issueSummary={summary}
      />,
    );
  }

  it("approves the current version with an optional note", async () => {
    decideApprovalAction.mockResolvedValueOnce({ ok: true, message: "Approval recorded." });
    const user = userEvent.setup();
    renderDecide("approved");

    await user.click(screen.getByRole("button", { name: "Approve this review" }));
    const dialog = await screen.findByRole("dialog");
    expect(await axe(dialog)).toHaveNoViolations();
    await user.click(within(dialog).getByRole("button", { name: "Approve this version" }));

    await waitFor(() =>
      expect(decideApprovalAction).toHaveBeenCalledWith({
        ...scope,
        decision: "approved",
        note: undefined,
        deploymentId: "deploy-2",
        requestId: "request-1",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("requires a note before requesting changes and does not call the server", async () => {
    const user = userEvent.setup();
    renderDecide("changes_requested");
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));

    expect(decideApprovalAction).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("Tell the team what needs to change");
  });

  it("warns that unresolved issues remain when approving", async () => {
    const user = userEvent.setup();
    renderDecide("approved", unresolved);
    await user.click(screen.getByRole("button", { name: "Approve this review" }));
    expect(await screen.findByText("Some issues aren’t verified yet")).toBeInTheDocument();
  });

  it("offers a reload when the site moved to a newer version", async () => {
    decideApprovalAction.mockResolvedValueOnce({
      ok: false,
      message: "The site now runs a newer version. Reload to see it before deciding.",
      reason: "stale_version",
    });
    const user = userEvent.setup();
    renderDecide("approved");
    await user.click(screen.getByRole("button", { name: "Approve this review" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve this version" }));

    expect(await within(dialog).findByText(/newer version/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reload this review" }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("ApprovalPanel", () => {
  const panelProps = { ...scope, reviewers: [], approvalLinks: [], canManage: true };

  it("shows the empty state with one request action", async () => {
    const { container } = render(<ApprovalPanel {...panelProps} status={status()} />);
    expect(screen.getByText("Approval not requested")).toBeInTheDocument();
    expect(screen.getByText(/Nobody has been asked to approve yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask for approval" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve this review" })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows the waiting request with decide and cancel actions", () => {
    render(
      <ApprovalPanel
        {...panelProps}
        status={status({
          visibleState: "awaiting_approval",
          activeRequest: request(),
          history: [request()],
        })}
      />,
    );
    expect(screen.getAllByText("Waiting for approval on Release 42").length).toBeGreaterThan(0);
    expect(screen.getByText("Waiting for a decision")).toBeInTheDocument();
    expect(screen.getByText("Please check the pricing page.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve this review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel request" })).toBeInTheDocument();
  });

  it("cancels a waiting request after confirmation", async () => {
    cancelApprovalRequestAction.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(
      <ApprovalPanel
        {...panelProps}
        status={status({
          visibleState: "awaiting_approval",
          activeRequest: request(),
          history: [request()],
        })}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Cancel request" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Cancel request" }));
    await waitFor(() =>
      expect(cancelApprovalRequestAction).toHaveBeenCalledWith({
        ...scope,
        requestId: "request-1",
      }),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("labels an approval from an earlier version as historical", () => {
    const old = request({
      id: "request-0",
      state: "approved",
      deploymentId: "deploy-1",
      versionLabel: "Release 41",
      historical: true,
      completedAt: "2026-09-30T12:00:00.000Z",
      decidedByDisplayName: "Pat Client",
    });
    render(
      <ApprovalPanel
        {...panelProps}
        status={status({ visibleState: "historical_approval", history: [old] })}
      />,
    );
    expect(screen.getAllByText("Approved for Release 41").length).toBeGreaterThan(0);
    expect(screen.getByText("This approval is from an earlier version")).toBeInTheDocument();
    expect(screen.getByText(/\(earlier version\)/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ask for approval on Release 42" }),
    ).toBeInTheDocument();
  });

  it("hides every action when the review is read-only", () => {
    render(<ApprovalPanel {...panelProps} canManage={false} status={status()} />);
    expect(screen.getByText("Approval not requested")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
