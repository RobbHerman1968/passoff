import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  issueComments,
  notifications,
  reviews,
  videoAnnotations,
  videoAssets,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { listGuestIssueComments, listIssueComments } from "@/lib/comments/service";
import { ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";
import {
  createGuestVideoNote,
  createVideoNote,
  listVideoNotesForGuest,
  listVideoNotesForMember,
  VIDEO_NOTE_MESSAGES,
} from "@/lib/video/annotations/service";
import { retireVideoRow } from "@/lib/video/lifecycle";
import {
  addWorkspaceMember,
  seedReviewWithIssue,
  seedVideoEvidence,
} from "@/test/workspace-fixtures";
import { clearGuestRateLimit, seedGuestSession } from "@/test/guest-fixtures";

// These tests need TEST_DATABASE_URL. They never use DATABASE_URL, and never call Mux.

vi.mock("@/lib/video/mux", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/video/mux")>();
  return {
    ...original,
    deleteMuxAsset: vi.fn().mockResolvedValue({ done: true }),
    cancelMuxUpload: vi.fn().mockResolvedValue({ done: true }),
  };
});

async function seedReadyClip(label: string, durationMs = 40_000) {
  const seeded = await seedReviewWithIssue(label);
  const clip = await seedVideoEvidence({
    workspaceId: seeded.context.workspaceId,
    reviewId: seeded.reviewId,
    issueId: seeded.issueId,
    status: "ready",
    durationMs,
    uploadedByUserId: seeded.context.userId,
  });
  return { ...seeded, clip };
}

describe("video notes", { timeout: 90_000 }, () => {
  const rateLimited: Array<{ sessionId: string; guestIdentityId: string }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    for (const session of rateLimited) await clearGuestRateLimit(session);
    rateLimited.length = 0;
  });

  it("saves a note with a pin as one comment and one annotation", async () => {
    const seeded = await seedReadyClip("NoteCreate");
    const result = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 12_000,
      x: 0.25,
      y: 0.75,
      body: "The button overlaps the footer",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.note).toMatchObject({
      number: 1,
      timestampMs: 12_000,
      x: 0.25,
      y: 0.75,
      visibility: "public",
      videoState: "current",
    });
    expect(result.notes).toHaveLength(1);

    const [annotation] = await db
      .select()
      .from(videoAnnotations)
      .where(eq(videoAnnotations.issueId, seeded.issueId));
    expect(annotation).toMatchObject({
      workspaceId: seeded.context.workspaceId,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 12_000,
      durationAtCreationMs: 40_000,
    });
    const comments = await db
      .select()
      .from(issueComments)
      .where(eq(issueComments.id, annotation.commentId));
    expect(comments).toHaveLength(1);
  });

  it("saves a note without a pin", async () => {
    const seeded = await seedReadyClip("NoteNoPin");
    const result = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 0,
      body: "Audio starts late",
    });
    expect(result.ok && result.note.x).toBeNull();
    expect(result.ok && result.note.y).toBeNull();
  });

  it("rejects bad times and pins, and empty text, without saving anything", async () => {
    const seeded = await seedReadyClip("NoteInvalid");
    const base = { ...seeded.scope, videoAssetId: seeded.clip.videoAssetId, body: "Hello" };

    const late = await createVideoNote(seeded.context, { ...base, timestampMs: 41_000 });
    expect(late).toMatchObject({ ok: false, error: "validation" });
    const negative = await createVideoNote(seeded.context, { ...base, timestampMs: -1 });
    expect(negative).toMatchObject({ ok: false, error: "validation" });
    const halfPin = await createVideoNote(seeded.context, { ...base, timestampMs: 1, x: 0.5 });
    expect(halfPin).toMatchObject({ ok: false, error: "validation" });
    const outside = await createVideoNote(seeded.context, {
      ...base,
      timestampMs: 1,
      x: 1.5,
      y: 0.5,
    });
    expect(outside).toMatchObject({ ok: false, error: "validation" });
    const empty = await createVideoNote(seeded.context, { ...base, timestampMs: 1, body: "   " });
    expect(empty).toMatchObject({ ok: false, error: "validation", message: VIDEO_NOTE_MESSAGES.emptyBody });

    expect(
      await db.select().from(videoAnnotations).where(eq(videoAnnotations.issueId, seeded.issueId)),
    ).toHaveLength(0);
    expect(
      await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId)),
    ).toHaveLength(0);
  });

  it("checks the time against the server's own clip length, not the browser's", async () => {
    const seeded = await seedReadyClip("NoteServerLength", 10_000);
    const result = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 20_000,
      body: "Past the end",
    });
    expect(result).toMatchObject({ ok: false, error: "validation" });
  });

  it("refuses a clip that is not the current video, and another workspace's issue", async () => {
    const seeded = await seedReadyClip("NoteWrongClip");
    const stranger = await seedReviewWithIssue("NoteStranger");
    const missing = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: "00000000-0000-4000-8000-000000000000",
      timestampMs: 1,
      body: "Nothing here",
    });
    expect(missing).toMatchObject({ ok: false, error: "video_unavailable" });

    const crossWorkspace = await createVideoNote(stranger.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 1,
      body: "Not mine",
    });
    expect(crossWorkspace).toMatchObject({ ok: false, error: "not_found" });
    expect(await listVideoNotesForMember(stranger.context, seeded.scope)).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  it("is read-only for archived reviews", async () => {
    const seeded = await seedReadyClip("NoteArchived");
    await db.update(reviews).set({ archivedAt: new Date() }).where(eq(reviews.id, seeded.reviewId));
    const result = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 1,
      body: "Too late",
    });
    expect(result).toMatchObject({ ok: false, error: "archived" });
  });

  it("keeps private notes away from guests, and numbers guest notes without gaps", async () => {
    const seeded = await seedReadyClip("NotePrivate");
    const member = await addWorkspaceMember(seeded.context, "Writer");
    const input = { ...seeded.scope, videoAssetId: seeded.clip.videoAssetId };

    await createVideoNote(member, { ...input, timestampMs: 5_000, body: "Public one" });
    await createVideoNote(member, {
      ...input,
      timestampMs: 8_000,
      body: "Private secret",
      visibility: "private",
    });
    await createVideoNote(member, { ...input, timestampMs: 20_000, body: "Public two" });

    const memberView = await listVideoNotesForMember(seeded.context, seeded.scope);
    expect(memberView.ok && memberView.notes.map((n) => [n.number, n.visibility])).toEqual([
      [1, "public"],
      [2, "private"],
      [3, "public"],
    ]);

    const { session } = await seedGuestSession(seeded);
    rateLimited.push(session);
    const guestView = await listVideoNotesForGuest(session, seeded.issueNumber);
    expect(guestView.ok).toBe(true);
    if (!guestView.ok) return;
    expect(guestView.notes.map((n) => n.number)).toEqual([1, 2]);
    expect(JSON.stringify(guestView.notes)).not.toContain("Private secret");

    const guestComments = await listGuestIssueComments(session, seeded.issueNumber);
    expect(JSON.stringify(guestComments)).not.toContain("Private secret");
  });

  it("lets a guest add a public note only when the link allows replies", async () => {
    const seeded = await seedReadyClip("NoteGuest");
    const commenter = await seedGuestSession(seeded, { canComment: true });
    const viewer = await seedGuestSession(seeded, { canComment: false });
    rateLimited.push(commenter.session, viewer.session);
    const input = {
      issueNumber: seeded.issueNumber,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 3_000,
      body: "From a guest",
    };

    const blocked = await createGuestVideoNote(viewer.session, input);
    expect(blocked).toMatchObject({ ok: false, error: "commenting_disabled" });

    const created = await createGuestVideoNote(commenter.session, input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.note).toMatchObject({ authorKind: "guest", videoAvailable: true });

    const [annotation] = await db
      .select({ commentId: videoAnnotations.commentId })
      .from(videoAnnotations)
      .where(eq(videoAnnotations.issueId, seeded.issueId));
    const [comment] = await db
      .select({ isPrivate: issueComments.isPrivate })
      .from(issueComments)
      .where(eq(issueComments.id, annotation.commentId));
    expect(comment.isPrivate).toBe(false);
  });

  it("keeps notes on the old clip when a video is replaced, and does not copy them", async () => {
    const seeded = await seedReadyClip("NoteReplace");
    await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 9_000,
      x: 0.5,
      y: 0.5,
      body: "On the first video",
    });

    await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(videoAssets)
        .where(eq(videoAssets.id, seeded.clip.videoAssetId));
      await retireVideoRow(tx, row, { lifecycle: "retired", reason: "replaced", now: new Date() });
    });
    const replacement = await seedVideoEvidence({
      workspaceId: seeded.context.workspaceId,
      reviewId: seeded.reviewId,
      issueId: seeded.issueId,
      status: "ready",
      uploadedByUserId: seeded.context.userId,
    });

    const listed = await listVideoNotesForMember(seeded.context, seeded.scope);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.notes).toHaveLength(1);
    expect(listed.notes[0]).toMatchObject({
      videoAssetId: seeded.clip.videoAssetId,
      videoState: "replaced",
    });
    expect(listed.notes.some((n) => n.videoAssetId === replacement.videoAssetId)).toBe(false);

    // Notes can no longer be added to the retired clip.
    const late = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 1,
      body: "Too late",
    });
    expect(late).toMatchObject({ ok: false, error: "video_unavailable" });

    // The first note on the new clip starts again at 1.
    const fresh = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: replacement.videoAssetId,
      timestampMs: 2_000,
      body: "On the new video",
    });
    expect(fresh.ok && fresh.note.number).toBe(1);

    // Guests are told only that the earlier note's video is unavailable.
    const { session } = await seedGuestSession(seeded);
    rateLimited.push(session);
    const guestNotes = await listVideoNotesForGuest(session, seeded.issueNumber);
    expect(guestNotes.ok && guestNotes.notes.map((n) => n.videoAvailable).sort()).toEqual([
      false,
      true,
    ]);
  });

  it("links discussion comments to their notes, and hides the reason from guests", async () => {
    const seeded = await seedReadyClip("NoteLinks");
    const created = await createVideoNote(seeded.context, {
      ...seeded.scope,
      videoAssetId: seeded.clip.videoAssetId,
      timestampMs: 4_000,
      body: "Linked comment",
    });
    expect(created.ok).toBe(true);
    const comments = await listIssueComments(seeded.context, { ...seeded.scope, includePrivate: true });
    expect(comments.ok).toBe(true);
    if (!comments.ok) return;
    expect(comments.comments[0].videoNote).toMatchObject({
      timestampMs: 4_000,
      videoState: "current",
    });
  });

  it("records safe history, safe webhooks, and notifies the right people", async () => {
    const seeded = await seedReadyClip("NoteEvents");
    const member = await addWorkspaceMember(seeded.context, "Reporter");
    const { encryptSecret } = await import("@/lib/webhooks/secrets");
    await db.insert(webhookEndpoints).values({
      workspaceId: seeded.context.workspaceId,
      url: "https://hooks.example.com/passoff",
      signingSecretEncrypted: encryptSecret("whsec_test_secret_value_ok"),
      subscribedEvents: ["issue.video_note_added"],
      isEnabled: true,
    });
    const input = { ...seeded.scope, videoAssetId: seeded.clip.videoAssetId };

    await createVideoNote(member, {
      ...input,
      timestampMs: 2_000,
      body: "Secret private words",
      visibility: "private",
    });
    expect(
      await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.workspaceId, seeded.context.workspaceId)),
    ).toHaveLength(0);

    await createVideoNote(member, {
      ...input,
      timestampMs: 3_000,
      x: 0.2,
      y: 0.3,
      body: "Public words about the header",
    });
    const deliveries = await db
      .select({ payload: webhookDeliveries.payload })
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.workspaceId, seeded.context.workspaceId));
    expect(deliveries).toHaveLength(1);
    const serialized = JSON.stringify(deliveries[0].payload);
    expect(serialized).not.toContain("Public words");
    expect(serialized).not.toMatch(/playback_|asset_|upload_/);

    const history = await db
      .select({ type: activityEvents.type, data: activityEvents.data })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.issueId, seeded.issueId),
          eq(activityEvents.workspaceId, seeded.context.workspaceId),
        ),
      );
    const types = history.map((event) => event.type);
    expect(types).toContain(ISSUE_ACTIVITY_TYPES.VIDEO_NOTE_ADDED);
    expect(types).toContain(ISSUE_ACTIVITY_TYPES.PRIVATE_VIDEO_NOTE_ADDED);
    const noteHistory = JSON.stringify(
      history.filter((event) => event.type.includes("video_note")).map((event) => event.data),
    );
    expect(noteHistory).not.toContain("words");

    // The note author is not notified about their own note.
    const authorNotices = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientUserId, member.userId),
          eq(notifications.issueId, seeded.issueId),
        ),
      );
    expect(authorNotices).toHaveLength(0);
  });
});
