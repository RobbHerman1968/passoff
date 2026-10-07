import { describe, expect, it } from "vitest";

import {
  VIDEO_BLOCKED_MESSAGES,
  buildIssueVideoView,
  type VideoRowForView,
} from "@/lib/video/view-builder";
import type { VideoUsageView } from "@/lib/video/states";

const now = new Date("2026-05-10T12:00:00Z");
const recent = new Date("2026-05-10T11:55:00Z");

function row(overrides: Partial<VideoRowForView> = {}): VideoRowForView {
  return {
    id: "video-1",
    lifecycle: "current",
    processingStatus: "ready",
    failureReason: null,
    durationMs: 83_000,
    createdAt: recent,
    removedAt: null,
    removalReason: null,
    providerDeletedAt: null,
    uploadedByName: "Ada",
    removedByName: null,
    ...overrides,
  };
}

const roomyUsage: VideoUsageView = {
  newMinutesUsed: 1,
  newMinutesAllowed: 10,
  retainedMinutesUsed: 1,
  retainedMinutesAllowed: 15,
  level: "available",
  planName: "Free",
};

function build(overrides: Partial<Parameters<typeof buildIssueVideoView>[0]> = {}) {
  return buildIssueVideoView({
    issueId: "issue-1",
    rows: [],
    issueClosed: false,
    archived: false,
    canManage: true,
    usage: roomyUsage,
    limitsApproved: true,
    now,
    ...overrides,
  });
}

describe("buildIssueVideoView", () => {
  it("offers to add a first video on an empty issue", () => {
    const view = build();
    expect(view.current).toBeNull();
    expect(view.action).toEqual({ canUpload: true, mode: "add", blockedReason: null });
    expect(view.needsPolling).toBe(false);
  });

  it("offers replace when a ready clip exists", () => {
    const view = build({ rows: [row()] });
    expect(view.current?.state).toBe("ready");
    expect(view.current?.durationSeconds).toBe(83);
    expect(view.action.mode).toBe("replace");
    expect(view.action.canUpload).toBe(true);
  });

  it("is read-only on archived reviews", () => {
    const view = build({ rows: [row()], archived: true });
    expect(view.action.canUpload).toBe(false);
    expect(view.action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.archived);
  });

  it("asks to reopen a closed issue before replacing", () => {
    const view = build({ rows: [row()], issueClosed: true });
    expect(view.action.canUpload).toBe(false);
    expect(view.action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.closed);
  });

  it("blocks a second upload while one is in progress and keeps polling", () => {
    const view = build({
      rows: [row(), row({ id: "video-2", lifecycle: "replacement", processingStatus: "processing" })],
    });
    expect(view.replacement?.state).toBe("processing");
    expect(view.action.canUpload).toBe(false);
    expect(view.action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.busy);
    expect(view.needsPolling).toBe(true);
    // The existing clip keeps playing while the new one is prepared.
    expect(view.current?.state).toBe("ready");
  });

  it("blocks when the month's new video time is used up", () => {
    const view = build({
      usage: { ...roomyUsage, newMinutesUsed: 10, level: "full" },
    });
    expect(view.action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.monthly);
  });

  it("blocks adding when retained video is full, but lets a replacement through", () => {
    const full = { ...roomyUsage, retainedMinutesUsed: 15, level: "full" as const };
    expect(build({ usage: full }).action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.retained);
    expect(build({ usage: full, rows: [row()] }).action.canUpload).toBe(true);
  });

  it("reports archived reviews as read-only with a plain reason", () => {
    const view = build({ archived: true, rows: [row()] });
    expect(view.archived).toBe(true);
    expect(view.action).toMatchObject({
      canUpload: false,
      blockedReason: VIDEO_BLOCKED_MESSAGES.archived,
    });
    expect(build().archived).toBe(false);
  });

  it("blocks people who can't manage video and when the plan has no allowance", () => {
    expect(build({ canManage: false }).action.blockedReason).toBe(VIDEO_BLOCKED_MESSAGES.notMember);
    expect(build({ limitsApproved: false }).action.blockedReason).toBe(
      VIDEO_BLOCKED_MESSAGES.unavailable,
    );
  });

  it("shows a plain message for clips that need attention, never the raw reason", () => {
    const view = build({
      rows: [
        row({
          processingStatus: "needs_attention",
          failureReason: "duration_exceeded",
        }),
      ],
    });
    expect(view.current?.state).toBe("needs_attention");
    expect(view.current?.message).toMatch(/longer than 3 minutes/);
    expect(JSON.stringify(view)).not.toContain("duration_exceeded");
    expect(view.action.mode).toBe("add");
  });

  it("treats an upload that never finished as failed with an upload message", () => {
    const view = build({
      rows: [
        row({
          processingStatus: "uploading",
          createdAt: new Date("2026-05-10T08:00:00Z"),
        }),
      ],
    });
    expect(view.current?.state).toBe("failed");
    expect(view.current?.message).toMatch(/upload didn’t finish/);
    expect(view.needsPolling).toBe(false);
  });

  it("shows a removal note only after a person removed a clip or retention ended", () => {
    const removed = row({
      lifecycle: "removed",
      removedAt: new Date("2026-05-09T10:00:00Z"),
      removalReason: "deleted_by_member",
      removedByName: "Sam",
      providerDeletedAt: null,
    });
    const view = build({ rows: [removed] });
    expect(view.tombstone).toMatchObject({
      reason: "removed",
      removedByName: "Sam",
      cleanupPending: true,
    });

    const abandoned = build({
      rows: [{ ...removed, removalReason: "upload_abandoned" }],
    });
    expect(abandoned.tombstone).toBeNull();

    const replaced = build({ rows: [{ ...removed, removalReason: "replaced" }] });
    expect(replaced.tombstone).toBeNull();

    const expired = build({ rows: [{ ...removed, removalReason: "retention_expired" }] });
    expect(expired.tombstone?.reason).toBe("expired");
  });

  it("does not show a removal note while a current clip exists", () => {
    const view = build({
      rows: [
        row(),
        row({
          id: "old",
          lifecycle: "removed",
          removedAt: new Date("2026-05-09T10:00:00Z"),
          removalReason: "deleted_by_member",
        }),
      ],
    });
    expect(view.tombstone).toBeNull();
  });

  it("never carries provider ids or tokens", () => {
    const text = JSON.stringify(build({ rows: [row()] }));
    expect(text).not.toMatch(/provider|playback|token|asset_/i);
  });
});
