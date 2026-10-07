import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IssueVideoSection } from "@/components/video/issue-video-section";
import { VIDEO_BLOCKED_MESSAGES } from "@/lib/video/view-builder";
import type { IssueVideoView, VideoEvidenceView } from "@/lib/video/states";

const removeIssueVideoAction = vi.fn();
const toastSuccess = vi.fn();

vi.mock("@/app/(app)/projects/video-actions", () => ({
  removeIssueVideoAction: (...args: unknown[]) => removeIssueVideoAction(...args),
  refreshIssueVideoAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(app)/projects/video-note-actions", () => ({
  createVideoNoteAction: vi.fn(),
  refreshVideoNotesAction: vi.fn().mockResolvedValue({ ok: true, notes: [] }),
}));

vi.mock("sonner", () => ({
  toast: { success: (...args: unknown[]) => toastSuccess(...args), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/components/video/video-evidence-player", () => ({
  VideoEvidencePlayer: ({ videoAssetId, title }: { videoAssetId: string; title: string }) => (
    <div data-testid="player" data-video={videoAssetId} role="group" aria-label={title} />
  ),
}));

vi.mock("@/components/video/video-evidence-uploader", () => ({
  VideoEvidenceUploader: ({ mode }: { mode?: string }) => (
    <div data-testid="uploader" data-mode={mode} />
  ),
}));

function clip(overrides: Partial<VideoEvidenceView> = {}): VideoEvidenceView {
  return {
    videoAssetId: "v1",
    role: "current",
    state: "ready",
    durationSeconds: 83,
    message: null,
    createdAt: "2026-10-07T10:00:00.000Z",
    uploadedByName: "Ada",
    ...overrides,
  };
}

function view(overrides: Partial<IssueVideoView> = {}): IssueVideoView {
  return {
    issueId: "issue-1",
    current: null,
    replacement: null,
    tombstone: null,
    action: { canUpload: true, mode: "add", blockedReason: null },
    usage: {
      newMinutesUsed: 2,
      newMinutesAllowed: 10,
      retainedMinutesUsed: 2,
      retainedMinutesAllowed: 15,
      level: "available",
      planName: "Free",
    },
    canManage: true,
    archived: false,
    retention: null,
    needsPolling: false,
    ...overrides,
  };
}

function renderSection(initialView: IssueVideoView | null) {
  return render(
    <IssueVideoSection
      projectId="p1"
      reviewId="r1"
      issueNumber={7}
      initialView={initialView}
    />,
  );
}

describe("IssueVideoSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows an empty state and the uploader for a member", async () => {
    const { container } = renderSection(view());
    expect(screen.getByRole("heading", { level: 2, name: "Video evidence" })).toBeInTheDocument();
    expect(screen.getByText("No video has been added to this issue yet.")).toBeInTheDocument();
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-mode", "add");
    expect(screen.getByText(/2 of 10 minutes/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("plays a ready clip and offers replace and remove", async () => {
    const { container } = renderSection(
      view({ current: clip(), action: { canUpload: true, mode: "replace", blockedReason: null } }),
    );
    expect(screen.getByTestId("player")).toHaveAttribute("data-video", "v1");
    expect(screen.getByText(/Length 1:23/)).toBeInTheDocument();
    expect(screen.getByText(/Added by Ada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace video" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove video" })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("tells members when a video is kept while the issue is open, and when it will be removed", async () => {
    const replaceAction = { canUpload: true, mode: "replace" as const, blockedReason: null };
    renderSection(
      view({
        current: clip(),
        action: replaceAction,
        retention: { state: "kept", endsAt: null, daysLeft: null },
      }),
    );
    expect(screen.getByTestId("retention-note")).toHaveTextContent(/Kept while this issue is open/);
    expect(screen.queryByTestId("retention-warning")).toBeNull();
  });

  it("warns with text and an icon when removal is close", async () => {
    const { container } = renderSection(
      view({
        current: clip(),
        action: { canUpload: true, mode: "replace", blockedReason: null },
        retention: { state: "expiring_soon", endsAt: "2026-10-12T10:00:00.000Z", daysLeft: 5 },
      }),
    );
    const warning = screen.getByTestId("retention-warning");
    expect(warning).toHaveTextContent(/will be removed on/);
    expect(warning).toHaveTextContent(/5 days left/);
    expect(warning).toHaveTextContent(/Reopen the issue to keep it/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("keeps notes readable, with a warning, when the video itself is gone", () => {
    render(
      <IssueVideoSection
        projectId="p1"
        reviewId="r1"
        issueNumber={7}
        initialView={view({
          current: null,
          tombstone: {
            videoAssetId: "v1",
            removedAt: "2026-10-07T12:00:00.000Z",
            removedByName: null,
            reason: "expired",
            cleanupPending: false,
          },
        })}
        initialNotes={[
          {
            id: "n1",
            commentId: "c1",
            videoAssetId: "v1",
            videoState: "expired",
            videoEndedAt: "2026-10-07T12:00:00.000Z",
            number: 1,
            timestampMs: 42_000,
            x: null,
            y: null,
            durationAtCreationMs: 60_000,
            body: "Spacing looks off here",
            visibility: "public",
            authorDisplayName: "Ada",
            authorKind: "member",
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        ]}
      />,
    );
    expect(screen.getByText("Spacing looks off here")).toBeInTheDocument();
    expect(screen.getByText("Expired video")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Go to note/ })).toBeNull();
  });

  it("opens the uploader in replace mode on request", async () => {
    renderSection(
      view({ current: clip(), action: { canUpload: true, mode: "replace", blockedReason: null } }),
    );
    expect(screen.queryByTestId("uploader")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace video" }));
    expect(screen.getByTestId("uploader")).toHaveAttribute("data-mode", "replace");
  });

  it("names what will be removed and only removes after confirming", async () => {
    removeIssueVideoAction.mockResolvedValue({
      ok: true,
      view: view({
        tombstone: {
          videoAssetId: "v1",
          removedAt: "2026-10-07T12:00:00.000Z",
          removedByName: "Ada",
          reason: "removed",
          cleanupPending: true,
        },
      }),
    });
    renderSection(
      view({ current: clip(), action: { canUpload: true, mode: "replace", blockedReason: null } }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Remove video" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Remove this video?")).toBeInTheDocument();
    expect(within(dialog).getByText(/The issue, its discussion, and its history stay/)).toBeInTheDocument();
    expect(removeIssueVideoAction).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Keep video" }));
    expect(removeIssueVideoAction).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Remove video" }));
    const second = await screen.findByRole("alertdialog");
    await userEvent.click(within(second).getByRole("button", { name: "Remove video" }));

    await waitFor(() =>
      expect(removeIssueVideoAction).toHaveBeenCalledWith({
        projectId: "p1",
        reviewId: "r1",
        issueNumber: 7,
        videoAssetId: "v1",
      }),
    );
    expect(await screen.findByText("Video removed")).toBeInTheDocument();
    expect(screen.getByText(/Video removed on Oct 7, 2026 by Ada\./)).toBeInTheDocument();
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
    expect(toastSuccess).toHaveBeenCalledWith("Video removed.");
  });

  it("keeps the clip and explains when removal fails", async () => {
    removeIssueVideoAction.mockResolvedValue({
      ok: false,
      message: "This review is archived, so video evidence can’t be changed.",
    });
    renderSection(
      view({ current: clip(), action: { canUpload: true, mode: "replace", blockedReason: null } }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove video" }));
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove video" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/archived/);
    expect(screen.getByTestId("player")).toBeInTheDocument();
  });

  it("is read-only when the review is archived, with a reason and a next step", () => {
    renderSection(
      view({
        current: clip(),
        action: { canUpload: false, mode: "replace", blockedReason: VIDEO_BLOCKED_MESSAGES.archived },
      }),
    );
    expect(screen.getByText(/Restore it to make changes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace video" })).not.toBeInTheDocument();
    expect(screen.getByTestId("player")).toBeInTheDocument();
  });

  it("hides remove, cancel, and dismiss controls when the review is archived", () => {
    const { unmount } = renderSection(
      view({
        archived: true,
        current: clip(),
        action: { canUpload: false, mode: "replace", blockedReason: VIDEO_BLOCKED_MESSAGES.archived },
      }),
    );
    expect(screen.getByTestId("player")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove video" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Replace video" })).not.toBeInTheDocument();
    unmount();

    renderSection(
      view({
        archived: true,
        current: clip({ state: "processing" }),
        replacement: clip({ videoAssetId: "v2", role: "replacement", state: "uploading" }),
        action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.archived },
        needsPolling: true,
      }),
    );
    expect(screen.queryByRole("button", { name: "Cancel upload" })).not.toBeInTheDocument();
  });

  it("does not offer cancel to people who can't manage video", () => {
    renderSection(
      view({
        canManage: false,
        usage: null,
        current: clip({ state: "processing" }),
        action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.notMember },
        needsPolling: true,
      }),
    );
    expect(screen.getByText(/Getting your clip ready/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells people to reopen a closed issue before replacing", () => {
    renderSection(
      view({
        current: clip(),
        action: { canUpload: false, mode: "replace", blockedReason: VIDEO_BLOCKED_MESSAGES.closed },
      }),
    );
    expect(screen.getByText("Reopen this issue before adding or replacing video evidence.")).toBeInTheDocument();
  });

  it("hides every control from people who can't manage video", () => {
    renderSection(
      view({
        current: clip(),
        canManage: false,
        usage: null,
        action: { canUpload: false, mode: "replace", blockedReason: VIDEO_BLOCKED_MESSAGES.notMember },
      }),
    );
    expect(screen.getByTestId("player")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a plain message for a clip that needs attention and lets it be dismissed", async () => {
    removeIssueVideoAction.mockResolvedValue({ ok: true, view: view() });
    renderSection(
      view({
        current: clip({
          state: "needs_attention",
          message: "This video is longer than 3 minutes, so it can’t be used as evidence.",
        }),
      }),
    );
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText(/longer than 3 minutes/)).toBeInTheDocument();
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(removeIssueVideoAction).toHaveBeenCalled());
  });

  it("keeps the current video playing while a replacement is prepared", () => {
    renderSection(
      view({
        current: clip(),
        replacement: clip({ videoAssetId: "v2", role: "replacement", state: "processing" }),
        action: { canUpload: false, mode: "replace", blockedReason: VIDEO_BLOCKED_MESSAGES.busy },
        needsPolling: true,
      }),
    );
    expect(screen.getByTestId("player")).toHaveAttribute("data-video", "v1");
    expect(screen.getByText("Getting your new clip ready.")).toBeInTheDocument();
    expect(screen.getByText(/current video stays in place until the new one is ready/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel upload" })).toBeInTheDocument();
  });

  it("shows a calm message when the video couldn't be loaded", () => {
    renderSection(null);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn’t load this issue’s video/);
  });

  it("warns when the workspace is near or at its allowance", () => {
    renderSection(
      view({
        usage: {
          newMinutesUsed: 10,
          newMinutesAllowed: 10,
          retainedMinutesUsed: 3,
          retainedMinutesAllowed: 15,
          level: "full",
          planName: "Free",
        },
        action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.monthly },
      }),
    );
    expect(screen.getByText(/reached its video allowance/)).toBeInTheDocument();
    expect(screen.getByText(/Ask your workspace owner to change plans/)).toBeInTheDocument();
  });

  describe("polling", () => {
    it("checks until the clip is ready, then shows the player and says so", async () => {
      vi.useFakeTimers();
      const ready = view({
        current: clip(),
        action: { canUpload: true, mode: "replace", blockedReason: null },
      });
      const fetchSpy = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ ok: true, view: ready }) });
      vi.stubGlobal("fetch", fetchSpy);

      renderSection(
        view({
          current: clip({ state: "processing" }),
          action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.busy },
          needsPolling: true,
        }),
      );
      expect(screen.getByText(/Getting your clip ready/)).toBeInTheDocument();
      expect(screen.queryByTestId("player")).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/video/issues/issue-1",
        expect.objectContaining({ cache: "no-store" }),
      );
      expect(screen.getByTestId("player")).toBeInTheDocument();
      expect(screen.getAllByText("Your video is ready to watch.").length).toBeGreaterThan(0);
      expect(toastSuccess).toHaveBeenCalledWith("Your video is ready to watch.");

      // Final state reached: no more checks.
      fetchSpy.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("keeps what is on screen when a check fails", async () => {
      vi.useFakeTimers();
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
      renderSection(
        view({
          current: clip({ state: "processing" }),
          action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.busy },
          needsPolling: true,
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_100);
      });
      expect(screen.getByText(/Getting your clip ready/)).toBeInTheDocument();
      expect(screen.queryByText(/network/i)).not.toBeInTheDocument();
    });

    it("stops checking and says to come back later after a long wait", async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            ok: true,
            view: view({
              current: clip({ state: "processing" }),
              action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.busy },
              needsPolling: true,
            }),
          }),
        }),
      );
      renderSection(
        view({
          current: clip({ state: "processing" }),
          action: { canUpload: false, mode: "add", blockedReason: VIDEO_BLOCKED_MESSAGES.busy },
          needsPolling: true,
        }),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
      });
      expect(screen.getByText(/taking longer than usual/)).toBeInTheDocument();
    });
  });
});
