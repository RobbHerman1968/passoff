import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  guestIdentities,
  issueComments,
  issues,
  videoAnnotations,
  videoAssets,
} from "@/db/schema";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import type { CommentVisibility } from "@/lib/comments/types";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { insertIssueActivityEvent } from "@/lib/issues/activity-record";
import { ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";
import type { IssueScopeInput } from "@/lib/issues/scope";
import { notifyIssueComment } from "@/lib/notifications/events";
import { actorLabel } from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import type { SdkSession } from "@/lib/sdk/session";
import { personDisplayName } from "@/lib/users/display-name";
import { videoNoteVideoStateFor } from "@/lib/video/annotations/state";
import {
  checkVideoNoteInput,
  numberVideoNotes,
  videoNoteProblemMessage,
  type GuestVideoNoteView,
  type VideoNoteView,
} from "@/lib/video/annotations/types";
import { loadVideoIssueState } from "@/lib/video/issue-video";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type VideoNoteError =
  | "forbidden"
  | "not_found"
  | "validation"
  | "unavailable"
  | "video_unavailable"
  | "archived"
  | "rate_limited"
  | "commenting_disabled";

export const VIDEO_NOTE_MESSAGES = {
  forbidden: "You don’t have permission to add notes on this video.",
  notFound: "This issue isn’t available anymore.",
  videoUnavailable:
    "This video was replaced or removed, so notes can’t be added to it. Reload the page to see the current video.",
  archived: "This review is archived, so notes can’t be added. Restore it to make changes.",
  rateLimited: "Too many notes just now. Wait a moment, then try again.",
  commentingDisabled: "This review link is view-only, so notes can’t be added.",
  unavailable: "We couldn’t save that note. Your text is still here. Try again.",
  emptyBody: "Write your note before adding it.",
  tooLong: `Keep this note under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
} as const;

type NoteRow = {
  id: string;
  commentId: string;
  videoAssetId: string;
  timestampMs: number;
  normalizedX: string | null;
  normalizedY: string | null;
  durationAtCreationMs: number | null;
  createdAt: Date;
  body: string;
  isPrivate: boolean;
  authorDisplayName: string;
  authorGuestId: string | null;
  lifecycle: string;
  removalReason: string | null;
  removedAt: Date | null;
};

async function loadNoteRows(
  workspaceId: string,
  issueId: string,
  options: { includePrivate: boolean },
): Promise<NoteRow[]> {
  const conditions = [
    eq(videoAnnotations.workspaceId, workspaceId),
    eq(videoAnnotations.issueId, issueId),
    eq(issueComments.workspaceId, workspaceId),
    isNull(issueComments.deletedAt),
  ];
  // Private notes are filtered here, before anything is numbered or sent anywhere.
  if (!options.includePrivate) conditions.push(eq(issueComments.isPrivate, false));

  return db
    .select({
      id: videoAnnotations.id,
      commentId: videoAnnotations.commentId,
      videoAssetId: videoAnnotations.videoAssetId,
      timestampMs: videoAnnotations.timestampMs,
      normalizedX: videoAnnotations.normalizedX,
      normalizedY: videoAnnotations.normalizedY,
      durationAtCreationMs: videoAnnotations.durationAtCreationMs,
      createdAt: videoAnnotations.createdAt,
      body: issueComments.body,
      isPrivate: issueComments.isPrivate,
      authorDisplayName: issueComments.authorDisplayName,
      authorGuestId: issueComments.authorGuestId,
      lifecycle: videoAssets.lifecycle,
      removalReason: videoAssets.removalReason,
      removedAt: videoAssets.removedAt,
    })
    .from(videoAnnotations)
    .innerJoin(issueComments, eq(issueComments.id, videoAnnotations.commentId))
    .innerJoin(videoAssets, eq(videoAssets.id, videoAnnotations.videoAssetId))
    .where(and(...conditions))
    .orderBy(asc(videoAnnotations.timestampMs), asc(videoAnnotations.createdAt));
}

function toMemberViews(rows: NoteRow[]): VideoNoteView[] {
  const numbered = numberVideoNotes(
    rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  );
  return numbered
    .map((row) => {
      const videoState = videoNoteVideoStateFor(row.lifecycle, row.removalReason);
      return {
        id: row.id,
        commentId: row.commentId,
        videoAssetId: row.videoAssetId,
        videoState,
        videoEndedAt: videoState === "current" ? null : (row.removedAt?.toISOString() ?? null),
        number: row.number,
        timestampMs: row.timestampMs,
        x: row.normalizedX == null ? null : Number(row.normalizedX),
        y: row.normalizedY == null ? null : Number(row.normalizedY),
        durationAtCreationMs: row.durationAtCreationMs,
        body: row.body,
        visibility: (row.isPrivate ? "private" : "public") as CommentVisibility,
        authorDisplayName: row.authorDisplayName.trim() || "Someone",
        authorKind: row.authorGuestId ? ("guest" as const) : ("member" as const),
        createdAt: row.createdAt,
      };
    })
    .sort(
      (a, b) =>
        // Current clip first, then older clips; time order inside each.
        Number(b.videoState === "current") - Number(a.videoState === "current") ||
        a.videoAssetId.localeCompare(b.videoAssetId) ||
        a.timestampMs - b.timestampMs ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

/** Every note on an issue, for people in the workspace. Includes private notes. */
export async function listVideoNotesForMember(
  context: WorkspaceContext,
  input: IssueScopeInput,
): Promise<
  | { ok: true; notes: VideoNoteView[] }
  | { ok: false; error: "forbidden" | "not_found" | "unavailable" }
> {
  if (!canMutateProjects(context)) return { ok: false, error: "forbidden" };
  try {
    const state = await loadVideoIssueState(db, context.workspaceId, input);
    if (!state) return { ok: false, error: "not_found" };
    const rows = await loadNoteRows(context.workspaceId, state.issueId, {
      includePrivate: true,
    });
    return { ok: true, notes: toMemberViews(rows) };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

function toGuestViews(rows: NoteRow[]): GuestVideoNoteView[] {
  return toMemberViews(rows).map((note) => ({
    id: note.id,
    commentId: note.commentId,
    videoAssetId: note.videoAssetId,
    // Guests learn only whether the clip can still be watched, never why or when it left.
    videoAvailable: note.videoState === "current",
    number: note.number,
    timestampMs: note.timestampMs,
    x: note.x,
    y: note.y,
    body: note.body,
    authorDisplayName: note.authorDisplayName,
    authorKind: note.authorKind,
    createdAt: note.createdAt,
  }));
}

/** Public notes only, for a guest on a shared review. Numbers never reveal hidden notes. */
export async function listVideoNotesForGuest(
  session: SdkSession,
  issueNumber: number,
): Promise<
  | { ok: true; notes: GuestVideoNoteView[]; canComment: boolean }
  | { ok: false; error: "not_found" | "unavailable" }
> {
  try {
    const state = await loadVideoIssueState(db, session.workspaceId, {
      projectId: session.projectId,
      reviewId: session.reviewId,
      issueNumber,
    });
    if (!state) return { ok: false, error: "not_found" };
    const rows = await loadNoteRows(session.workspaceId, state.issueId, {
      includePrivate: false,
    });
    return { ok: true, notes: toGuestViews(rows), canComment: session.canComment };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

type NoteAuthor =
  | { kind: "member"; userId: string; displayName: string }
  | { kind: "guest"; guestId: string; displayName: string };

type NoteRequest = {
  workspaceId: string;
  scope: IssueScopeInput;
  videoAssetId: string;
  timestampMs: unknown;
  x?: unknown;
  y?: unknown;
  body: string;
  isPrivate: boolean;
  author: NoteAuthor;
};

type SavedNote = {
  annotationId: string;
  commentId: string;
  issue: {
    id: string;
    number: number;
    projectId: string;
    reviewId: string;
    authorUserId: string | null;
  };
  timestampMs: number;
  hasPin: boolean;
};

type SaveResult =
  | { ok: true; saved: SavedNote }
  | { ok: false; error: VideoNoteError; message: string };

function normalizeBody(raw: string): { ok: true; body: string } | { ok: false; message: string } {
  const body = raw.trim();
  if (!body) return { ok: false, message: VIDEO_NOTE_MESSAGES.emptyBody };
  if (body.length > ISSUE_COMMENT_MAX_LENGTH) {
    return { ok: false, message: VIDEO_NOTE_MESSAGES.tooLong };
  }
  return { ok: true, body };
}

/**
 * Saves the words, the time, and the optional pin together or not at all. The clip is locked
 * for the length of the save, so a note can never land on a clip that is being replaced,
 * removed, or expired at the same moment.
 */
async function saveNote(request: NoteRequest): Promise<SaveResult> {
  const normalized = normalizeBody(request.body);
  if (!normalized.ok) {
    return { ok: false, error: "validation", message: normalized.message };
  }

  try {
    return await db.transaction(async (tx): Promise<SaveResult> => {
      const state = await loadVideoIssueState(tx, request.workspaceId, request.scope);
      if (!state) {
        return { ok: false, error: "not_found", message: VIDEO_NOTE_MESSAGES.notFound };
      }
      if (state.archived) {
        return { ok: false, error: "archived", message: VIDEO_NOTE_MESSAGES.archived };
      }

      const [issue] = await tx
        .select({
          id: issues.id,
          number: issues.number,
          projectId: issues.projectId,
          reviewId: issues.reviewId,
          authorUserId: issues.authorUserId,
        })
        .from(issues)
        .where(and(eq(issues.id, state.issueId), eq(issues.workspaceId, request.workspaceId)))
        .limit(1);
      if (!issue) {
        return { ok: false, error: "not_found", message: VIDEO_NOTE_MESSAGES.notFound };
      }

      const [video] = await tx
        .select({ id: videoAssets.id, durationMs: videoAssets.durationMs })
        .from(videoAssets)
        .where(
          and(
            eq(videoAssets.id, request.videoAssetId),
            eq(videoAssets.workspaceId, request.workspaceId),
            eq(videoAssets.issueId, issue.id),
            eq(videoAssets.lifecycle, "current"),
            eq(videoAssets.processingStatus, "ready"),
          ),
        )
        .limit(1)
        .for("update");
      if (!video) {
        return {
          ok: false,
          error: "video_unavailable",
          message: VIDEO_NOTE_MESSAGES.videoUnavailable,
        };
      }

      const checked = checkVideoNoteInput({
        timestampMs: request.timestampMs,
        x: request.x,
        y: request.y,
        durationMs: video.durationMs,
      });
      if (!checked.ok) {
        return {
          ok: false,
          error: "validation",
          message: videoNoteProblemMessage(checked.problem),
        };
      }

      const now = new Date();
      const [comment] = await tx
        .insert(issueComments)
        .values({
          workspaceId: request.workspaceId,
          issueId: issue.id,
          body: normalized.body,
          isPrivate: request.isPrivate,
          authorDisplayName: request.author.displayName,
          authorUserId: request.author.kind === "member" ? request.author.userId : null,
          authorGuestId: request.author.kind === "guest" ? request.author.guestId : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: issueComments.id });

      const [annotation] = await tx
        .insert(videoAnnotations)
        .values({
          workspaceId: request.workspaceId,
          issueId: issue.id,
          commentId: comment.id,
          videoAssetId: video.id,
          timestampMs: checked.value.timestampMs,
          normalizedX: checked.value.x == null ? null : String(checked.value.x),
          normalizedY: checked.value.y == null ? null : String(checked.value.y),
          durationAtCreationMs: video.durationMs,
          createdAt: now,
        })
        .returning({ id: videoAnnotations.id });

      // History records the time and whether there is a pin. Never the words of the note.
      await insertIssueActivityEvent(tx, {
        workspaceId: request.workspaceId,
        projectId: issue.projectId,
        reviewId: issue.reviewId,
        issueId: issue.id,
        actorUserId: request.author.kind === "member" ? request.author.userId : null,
        actorGuestId: request.author.kind === "guest" ? request.author.guestId : null,
        type: request.isPrivate
          ? ISSUE_ACTIVITY_TYPES.PRIVATE_VIDEO_NOTE_ADDED
          : ISSUE_ACTIVITY_TYPES.VIDEO_NOTE_ADDED,
        data: {
          timestampMs: checked.value.timestampMs,
          hasPin: checked.value.x != null,
          visibility: request.isPrivate ? "private" : "public",
        },
        createdAt: now,
      });

      return {
        ok: true,
        saved: {
          annotationId: annotation.id,
          commentId: comment.id,
          issue,
          timestampMs: checked.value.timestampMs,
          hasPin: checked.value.x != null,
        },
      };
    });
  } catch {
    return { ok: false, error: "unavailable", message: VIDEO_NOTE_MESSAGES.unavailable };
  }
}

/** Tells the right people and queues a webhook. Never changes the saved note. */
async function afterNoteSaved(
  request: NoteRequest,
  saved: SavedNote,
  actorName: string,
): Promise<void> {
  try {
    await notifyIssueComment({
      workspaceId: request.workspaceId,
      actorUserId: request.author.kind === "member" ? request.author.userId : null,
      actorName,
      projectId: saved.issue.projectId,
      reviewId: saved.issue.reviewId,
      issueId: saved.issue.id,
      issueNumber: saved.issue.number,
      commentId: saved.commentId,
      issueAuthorUserId: saved.issue.authorUserId,
      mentionedUserIds: [],
      isPrivate: request.isPrivate,
    });
  } catch {
    // The note is saved even if notifying fails.
  }

  // Private notes never leave the workspace, so they never become a webhook.
  if (request.isPrivate) return;
  await enqueueWebhookEventSafely({
    eventId: saved.annotationId,
    subscribedType: "issue.video_note_added",
    eventType: "issue.video_note_added",
    occurredAt: new Date().toISOString(),
    workspaceId: request.workspaceId,
    projectId: saved.issue.projectId,
    reviewId: saved.issue.reviewId,
    issueId: saved.issue.id,
    issueNumber: saved.issue.number,
    actor: { type: request.author.kind === "guest" ? "guest" : "user", name: actorName },
    data: {
      timestampSeconds: Math.floor(saved.timestampMs / 1_000),
      hasPin: saved.hasPin,
    },
  });
}

export type CreateVideoNoteInput = IssueScopeInput & {
  videoAssetId: string;
  timestampMs: number;
  x?: number | null;
  y?: number | null;
  body: string;
  visibility?: CommentVisibility;
};

export type CreateVideoNoteResult =
  | { ok: true; note: VideoNoteView; notes: VideoNoteView[] }
  | { ok: false; error: VideoNoteError; message: string };

/**
 * Adds a note at one moment of the video people are watching. Members choose whether it is
 * public or private. The note appears in the discussion like any other reply.
 */
export async function createVideoNote(
  context: WorkspaceContext,
  input: CreateVideoNoteInput,
): Promise<CreateVideoNoteResult> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden", message: VIDEO_NOTE_MESSAGES.forbidden };
  }
  const displayName = actorLabel(context);
  const request: NoteRequest = {
    workspaceId: context.workspaceId,
    scope: {
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueNumber: input.issueNumber,
    },
    videoAssetId: input.videoAssetId,
    timestampMs: input.timestampMs,
    x: input.x,
    y: input.y,
    body: input.body,
    isPrivate: input.visibility === "private",
    author: { kind: "member", userId: context.userId, displayName },
  };

  const result = await saveNote(request);
  if (!result.ok) return result;
  await afterNoteSaved(request, result.saved, displayName);

  const listed = await listVideoNotesForMember(context, request.scope);
  const note = listed.ok
    ? listed.notes.find((item) => item.id === result.saved.annotationId)
    : undefined;
  if (!listed.ok || !note) {
    return { ok: false, error: "unavailable", message: VIDEO_NOTE_MESSAGES.unavailable };
  }
  return { ok: true, note, notes: listed.notes };
}

export type CreateGuestVideoNoteResult =
  | { ok: true; note: GuestVideoNoteView; notes: GuestVideoNoteView[] }
  | { ok: false; error: VideoNoteError; message: string };

/**
 * Adds a public note for a guest on a shared review, when the link allows replies. Guest
 * notes are always public.
 */
export async function createGuestVideoNote(
  session: SdkSession,
  input: {
    issueNumber: number;
    videoAssetId: string;
    timestampMs: number;
    x?: number | null;
    y?: number | null;
    body: string;
    rateLimitSubjects?: string[];
  },
): Promise<CreateGuestVideoNoteResult> {
  if (!session.canComment) {
    return {
      ok: false,
      error: "commenting_disabled",
      message: VIDEO_NOTE_MESSAGES.commentingDisabled,
    };
  }

  const rate = await enforceInstallationRateLimit({
    scope: "sdk_comment_write",
    subjects: [session.sessionId, session.guestIdentityId, ...(input.rateLimitSubjects ?? [])],
  });
  if (!rate.ok) {
    return { ok: false, error: "rate_limited", message: VIDEO_NOTE_MESSAGES.rateLimited };
  }

  const [guest] = await db
    .select({ id: guestIdentities.id, name: guestIdentities.name, email: guestIdentities.email })
    .from(guestIdentities)
    .where(
      and(
        eq(guestIdentities.id, session.guestIdentityId),
        eq(guestIdentities.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);
  if (!guest) {
    return { ok: false, error: "forbidden", message: VIDEO_NOTE_MESSAGES.forbidden };
  }

  const displayName = personDisplayName(guest.name, guest.email);
  const request: NoteRequest = {
    workspaceId: session.workspaceId,
    scope: {
      projectId: session.projectId,
      reviewId: session.reviewId,
      issueNumber: input.issueNumber,
    },
    videoAssetId: input.videoAssetId,
    timestampMs: input.timestampMs,
    x: input.x,
    y: input.y,
    body: input.body,
    isPrivate: false,
    author: { kind: "guest", guestId: guest.id, displayName },
  };

  const result = await saveNote(request);
  if (!result.ok) return result;
  await afterNoteSaved(request, result.saved, displayName);

  const listed = await listVideoNotesForGuest(session, input.issueNumber);
  const note = listed.ok
    ? listed.notes.find((item) => item.id === result.saved.annotationId)
    : undefined;
  if (!listed.ok || !note) {
    return { ok: false, error: "unavailable", message: VIDEO_NOTE_MESSAGES.unavailable };
  }
  return { ok: true, note, notes: listed.notes };
}
