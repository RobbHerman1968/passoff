import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  IssueDetailView,
  IssueUnavailableView,
} from "@/components/issues/issue-detail";
import type { IssueDetail } from "@/lib/issues/list";

const refresh = vi.fn();
const toastSuccess = vi.fn();
const updateIssueStatusAction = vi.fn();
const updateIssuePriorityAction = vi.fn();
const updateIssueAssigneeAction = vi.fn();
const listIssueHistoryAction = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

vi.mock("@/app/(app)/projects/issue-triage-actions", () => ({
  updateIssueStatusAction: (...args: unknown[]) => updateIssueStatusAction(...args),
  updateIssuePriorityAction: (...args: unknown[]) =>
    updateIssuePriorityAction(...args),
  updateIssueAssigneeAction: (...args: unknown[]) =>
    updateIssueAssigneeAction(...args),
  listIssueHistoryAction: (...args: unknown[]) => listIssueHistoryAction(...args),
}));

vi.mock("@/app/(app)/projects/label-actions", () => ({
  addIssueLabelAction: vi.fn(),
  removeIssueLabelAction: vi.fn(),
  createAndAddIssueLabelAction: vi.fn(),
}));

vi.mock("@/app/(app)/projects/attachment-actions", () => ({
  attachFileToIssueAction: vi.fn(),
  removeIssueAttachmentAction: vi.fn(),
  setAttachmentVisibilityAction: vi.fn(),
}));

vi.mock("@/app/(app)/usability/actions", () => ({
  requestComparisonAction: vi.fn(),
}));

vi.mock("@/app/(app)/projects/verification-actions", () => ({
  startVerificationChecksAction: vi.fn(),
  recordHumanVerificationAction: vi.fn(),
}));

vi.mock("@/app/(app)/projects/video-actions", () => ({
  removeIssueVideoAction: vi.fn(),
  refreshIssueVideoAction: vi.fn(),
}));

vi.mock("@/app/(app)/projects/video-note-actions", () => ({
  createVideoNoteAction: vi.fn(),
  refreshVideoNotesAction: vi.fn().mockResolvedValue({ ok: true, notes: [] }),
}));

vi.mock("@/components/video/video-evidence-player", () => ({
  VideoEvidencePlayer: () => <div data-testid="video-player" />,
}));

vi.mock("@/app/(app)/projects/comment-actions", () => ({
  createIssueCommentAction: vi.fn(),
}));

vi.mock("@/components/issues/use-online-status", () => ({
  useOnlineStatus: () => true,
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

function makeDetail(overrides: Partial<IssueDetail> = {}): IssueDetail {
  return {
    id: "issue-1",
    number: 3,
    body: "Header overlaps navigation\nAlso wraps on mobile.",
    displayTitle: "Header overlaps navigation",
    status: "open",
    priority: "high",
    pageRoute: "/pricing",
    pageTitle: "Pricing page with a very long title that must wrap safely",
    pageUrl: "https://example.com/pricing?utm=long",
    reporterDisplayName: "Guest Reviewer",
    assigneeDisplayName: "Unassigned",
    assigneeUserId: null,
    hasScreenshotEvidence: true,
    screenshotCaptureStatus: "ready",
    hasVideoEvidence: false,
    createdAt: new Date("2026-10-01T12:00:00.000Z"),
    updatedAt: new Date("2026-10-02T12:00:00.000Z"),
    environmentName: "Production",
    versionLabel: "v1",
    screenshotCaptureMethod: "browser_reconstruction",
    screenshotAnnotation: null,
    version: 1,
    ...overrides,
  };
}

describe("IssueDetailView", () => {
  beforeEach(() => {
    refresh.mockReset();
    toastSuccess.mockReset();
    updateIssueStatusAction.mockReset();
    updateIssuePriorityAction.mockReset();
    updateIssueAssigneeAction.mockReset();
    listIssueHistoryAction.mockReset();
  });

  it("shows video evidence with the player when a clip is ready", () => {
    render(
      <IssueDetailView
        issue={makeDetail({ hasVideoEvidence: true })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        videoView={{
          issueId: "i1",
          current: {
            videoAssetId: "v1",
            role: "current",
            state: "ready",
            durationSeconds: 30,
            message: null,
            createdAt: "2026-10-02T12:00:00.000Z",
            uploadedByName: "Ada",
          },
          replacement: null,
          tombstone: null,
          action: { canUpload: true, mode: "replace", blockedReason: null },
          usage: null,
          canManage: true,
          archived: false,
          retention: null,
          needsPolling: false,
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Video evidence" })).toBeVisible();
    expect(screen.getByTestId("video-player")).toBeInTheDocument();
  });

  it("explains when video evidence could not be loaded, without hiding the issue", () => {
    render(
      <IssueDetailView
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        videoView={null}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t load this issue’s video/);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });

  it("renders feedback, metadata, and a large screenshot", () => {
    render(
      <IssueDetailView
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1?q=header&p=2"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Header overlaps navigation" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Feedback" })).toBeVisible();
    expect(
      screen.getByText((_, element) => {
        return (
          element?.tagName === "P" &&
          element.textContent ===
            "Header overlaps navigation\nAlso wraps on mobile."
        );
      }),
    ).toBeVisible();
    expect(screen.getByText("Pricing page with a very long title that must wrap safely")).toBeVisible();
    expect(screen.getByText("https://example.com/pricing?utm=long")).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "Captured page context for issue 3.",
      }),
    ).toHaveAttribute(
      "src",
      expect.stringContaining("/api/projects/p1/reviews/r1/issues/3/screenshot"),
    );
    expect(
      screen.getByText("The exact selected area was not recorded for this issue."),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Captured in the reviewer’s browser\. Small visual differences from the live page are possible\./,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Back to issues" }),
    ).toHaveAttribute("href", "/projects/p1/reviews/r1?q=header&p=2");
  });

  it("covers pending, unavailable, failed, and image-load-error screenshot states", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <IssueDetailView
        issue={makeDetail({ screenshotCaptureStatus: "pending" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByText("Picture still preparing")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeVisible();

    rerender(
      <IssueDetailView
        issue={makeDetail({ screenshotCaptureStatus: "unavailable" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByText("No picture available")).toBeVisible();

    rerender(
      <IssueDetailView
        issue={makeDetail({ screenshotCaptureStatus: "failed" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByText("Picture couldn’t be prepared")).toBeVisible();

    rerender(
      <IssueDetailView
        issue={makeDetail({ screenshotCaptureStatus: "ready" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    const image = screen.getByRole("img", {
      name: "Captured page context for issue 3.",
    });
    fireEvent.error(image);
    expect(await screen.findByText("We couldn’t show this picture")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("opens and closes the full-size screenshot dialog accessibly", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <IssueDetailView
        issue={makeDetail({
          screenshotAnnotation: {
            version: 1,
            selectedBounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
            pin: { x: 0.2, y: 0.2 },
          },
        })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );

    expect(
      screen.getByText(
        "The orange outline and numbered pin show what the reviewer selected.",
      ),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "View full size" }));
    const dialog = screen.getByRole("dialog", { name: "Full-size screenshot" });
    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole("img", {
        name: "Captured page context for issue 3. The selected area is marked.",
      }),
    ).toBeVisible();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();

    expect(await axe(container)).toHaveNoViolations();
  });

  it("renders an unavailable state with a safe back link", () => {
    render(
      <IssueUnavailableView
        projectId="p1"
        projectName="Acme"
        reviewId="r1"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1?show=closed"
        issueNumber={99}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "This issue isn’t available" }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Back to issues" })[0],
    ).toHaveAttribute("href", "/projects/p1/reviews/r1?show=closed");
  });

  it("stacks metadata without truncating important content", () => {
    render(
      <IssueDetailView
        issue={makeDetail({
          body: "Line one\nLine two with lots of detail about the overlap.",
        })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );

    const feedback = screen.getByText(/Line one/);
    expect(feedback.className).toMatch(/whitespace-pre-wrap/);
    expect(feedback.className).toMatch(/break-words/);
    expect(screen.queryByText(/\.\.\./)).toBeNull();
  });

  it("shows the matching primary action for each active status", () => {
    const { rerender } = render(
      <IssueDetailView
        key="open"
        issue={makeDetail({ status: "open" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByRole("button", { name: "Start work" })).toBeVisible();

    rerender(
      <IssueDetailView
        key="in-progress"
        issue={makeDetail({ status: "in_progress" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Mark ready for verification" }),
    ).toBeVisible();

    rerender(
      <IssueDetailView
        key="ready"
        issue={makeDetail({ status: "ready_for_verification" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Return to in progress" }),
    ).toBeVisible();
  });

  it("does not expose member-only transitions for verified or closed issues", () => {
    const { rerender } = render(
      <IssueDetailView
        key="verified"
        issue={makeDetail({ status: "verified" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByText("Verified")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Mark ready for verification" }),
    ).toBeNull();
    expect(
      screen.getByText("Verification requires the reviewer workflow."),
    ).toBeVisible();

    rerender(
      <IssueDetailView
        key="closed"
        issue={makeDetail({ status: "closed" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(screen.getByText("Closed")).toBeVisible();
    expect(
      screen.getByText("Reopening requires the reviewer workflow."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Return to in progress" }),
    ).toBeNull();
  });

  it("labels assignee and priority controls and keeps unassigned with one member", () => {
    render(
      <IssueDetailView
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        members={[{ userId: "user-1", displayName: "Rob Owner" }]}
      />,
    );

    expect(screen.getByLabelText("Assignee")).toBeVisible();
    expect(screen.getByLabelText("Priority")).toBeVisible();
    expect(screen.getByLabelText("Priority")).toHaveTextContent("High");
  });

  it("renders empty, loading, error, success, and conflict history states", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <IssueDetailView
        key="empty"
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    expect(
      screen.getByText(
        "Changes to status, priority, and assignment will appear here.",
      ),
    ).toBeVisible();

    rerender(
      <IssueDetailView
        key="error"
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        historyError="We couldn’t load history. Try again."
      />,
    );
    expect(screen.getByText("We couldn’t load history. Try again.")).toBeVisible();

    let resolveHistory: ((value: unknown) => void) | undefined;
    listIssueHistoryAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHistory = resolve;
        }),
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Loading history")).toBeVisible();
    resolveHistory?.({
      ok: true,
      events: [
        {
          id: "evt-1",
          type: "issue.status_changed",
          createdAt: "2026-10-02T12:00:00.000Z",
          actorDisplayName: "Rob",
          summary: "Rob changed status from Open to In progress.",
        },
      ],
    });
    expect(
      await screen.findByText("Rob changed status from Open to In progress."),
    ).toBeVisible();
    expect(screen.getByText("Rob changed status from Open to In progress.").closest("li")?.querySelector("time")).toHaveAttribute(
      "dateTime",
      "2026-10-02T12:00:00.000Z",
    );

    updateIssueStatusAction.mockResolvedValue({
      ok: false,
      error: "conflict",
      message:
        "This issue changed while you were viewing it. Refresh to see the latest details.",
    });
    rerender(
      <IssueDetailView
        key="conflict"
        issue={makeDetail({ status: "open" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Start work" }));
    expect(
      await screen.findByText(
        "This issue changed while you were viewing it. Refresh to see the latest details.",
      ),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("updates status from the keyboard and announces success", async () => {
    const user = userEvent.setup();
    updateIssueStatusAction.mockResolvedValue({
      ok: true,
      issue: {
        version: 2,
        status: "in_progress",
        priority: "high",
        assigneeUserId: null,
        assigneeDisplayName: "Unassigned",
        updatedAt: "2026-10-03T12:00:00.000Z",
      },
      event: {
        id: "evt-status",
        type: "issue.status_changed",
        createdAt: "2026-10-03T12:00:00.000Z",
        actorDisplayName: "Rob",
        summary: "Rob changed status from Open to In progress.",
      },
    });

    render(
      <IssueDetailView
        issue={makeDetail({ status: "open" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        members={[{ userId: "user-1", displayName: "Maya Member" }]}
      />,
    );

    const startWork = screen.getByRole("button", { name: "Start work" });
    startWork.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("In progress")).toBeVisible();
    expect(
      screen.getByText("Rob changed status from Open to In progress."),
    ).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Status updated.");
    expect(updateIssueStatusAction).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "in_progress",
        version: 1,
      }),
    );
  });

  it("has no serious accessibility violations with triage controls", async () => {
    const { container } = render(
      <IssueDetailView
        issue={makeDetail()}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        members={[{ userId: "user-1", displayName: "Rob Owner" }]}
        history={[
          {
            id: "evt-1",
            type: "issue.priority_changed",
            createdAt: "2026-10-02T12:00:00.000Z",
            actorDisplayName: "Rob",
            summary: "Rob set priority to High.",
          },
        ]}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps browser checks separate from human verification and explains they do not close the issue", async () => {
    const user = userEvent.setup();
    render(
      <IssueDetailView
        issue={makeDetail({ status: "ready_for_verification" })}
        projectId="p1"
        reviewId="r1"
        projectName="Acme"
        reviewName="Launch"
        backHref="/projects/p1/reviews/r1"
        verificationLaunch={{
          eligible: true,
          blocker: null,
          issueNumber: 3,
          issueTitle: "Header overlaps navigation",
          environmentName: "Production",
          versionLabel: "v19",
          pageRoute: "/pricing",
          pageUrl: "https://example.com/pricing",
          viewportWidth: 1440,
          viewportHeight: 900,
          matchConfidence: "exact",
          availableChecks: [
            { kind: "element_visibility", label: "Element visibility" },
            { kind: "bounding_box_overlap", label: "Overlap" },
          ],
          namedHooks: [],
        }}
        verificationRuns={[
          {
            id: "run-1",
            state: "complete",
            overall: "failed",
            summary: "Overlap check failed: approximately 48% of the target was covered by a sticky page region.",
            environmentName: "Production",
            versionLabel: "v19",
            route: "/pricing",
            viewportWidth: 1440,
            viewportHeight: 900,
            viewportGroup: "desktop",
            startedAt: new Date("2026-10-05T12:00:00.000Z"),
            completedAt: new Date("2026-10-05T12:01:00.000Z"),
            initiatorName: "Rob",
            limitations: [],
            failureCode: null,
            evidenceStatus: "ready",
            hasEvidence: true,
            selectedChecks: ["element_visibility", "bounding_box_overlap"],
            actualUrl: "https://example.com/pricing",
            checks: [
              {
                kind: "element_visibility",
                outcome: "passed",
                summary: "The expected element is on the page and visible.",
                measurements: {},
                limitations: [],
              },
              {
                kind: "bounding_box_overlap",
                outcome: "failed",
                summary: "Covered by a sticky page region.",
                measurements: { occlusionPercent: 48 },
                limitations: [],
              },
            ],
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Verification checks" })).toBeVisible();
    expect(
      screen.getByText(
        "Browser checks are evidence. A person still records whether the issue is fixed.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Failed")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Run again" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Run again" }));
    expect(
      screen.getByText("Automated checks provide evidence. They do not verify or close the issue."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open website and run checks" }),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Record human verification" })).toBeVisible();
  });
});
