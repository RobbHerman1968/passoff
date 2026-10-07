import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  guestIdentities,
  issueComments,
  issues,
  mentions,
  users,
  workspaceMemberships,
} from "@/db/schema";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import type { VideoNoteLink } from "@/lib/video/annotations/types";
import type {
  CommentVisibility,
  IssueCommentMention,
  IssueCommentView,
} from "@/lib/comments/types";
import { insertIssueActivityEvent } from "@/lib/issues/activity-record";
import { ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";
import { notifyIssueComment } from "@/lib/notifications/events";
import {
  actorLabel,
  listActiveWorkspaceMemberIds,
} from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import type { SdkSession } from "@/lib/sdk/session";
import { personDisplayName } from "@/lib/users/display-name";
import { loadVideoNoteLinks } from "@/lib/video/annotations/links";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type CommentMutationError =
  | "forbidden"
  | "not_found"
  | "validation"
  | "unavailable"
  | "rate_limited"
  | "commenting_disabled"
  | "expired"
  | "revoked";

type ScopedIssueRow = {
  id: string;
  workspaceId: string;
  projectId: string;
  reviewId: string;
  number: number;
  authorUserId: string | null;
};

function normalizeBody(raw: string): {
  ok: true;
  body: string;
} | {
  ok: false;
  message: string;
} {
  const body = raw.trim();
  if (!body) {
    return { ok: false, message: "Enter a reply." };
  }
  if (body.length > ISSUE_COMMENT_MAX_LENGTH) {
    return {
      ok: false,
      message: `Keep this reply under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
    };
  }
  return { ok: true, body };
}

function parseVisibility(value: unknown): CommentVisibility | null {
  if (value === "public" || value === "private") return value;
  if (value === false) return "public";
  if (value === true) return "private";
  return null;
}

async function loadScopedIssue(
  workspaceId: string,
  input: { projectId: string; reviewId: string; issueNumber: number },
): Promise<ScopedIssueRow | null> {
  const [issue] = await db
    .select({
      id: issues.id,
      workspaceId: issues.workspaceId,
      projectId: issues.projectId,
      reviewId: issues.reviewId,
      number: issues.number,
      authorUserId: issues.authorUserId,
    })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, workspaceId),
        eq(issues.projectId, input.projectId),
        eq(issues.reviewId, input.reviewId),
        eq(issues.number, input.issueNumber),
        isNull(issues.deletedAt),
      ),
    )
    .limit(1);
  return issue ?? null;
}

async function validateMentionUserIds(
  workspaceId: string,
  mentionedUserIds: string[] | undefined,
): Promise<string[]> {
  const unique = [...new Set(mentionedUserIds ?? [])].filter(Boolean);
  if (unique.length === 0) return [];

  const rows = await db
    .select({ userId: workspaceMemberships.userId })
    .from(workspaceMemberships)
    .innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
        isNull(users.deletedAt),
        inArray(workspaceMemberships.userId, unique),
      ),
    );

  const active = new Set(rows.map((row) => row.userId));
  return unique.filter((userId) => active.has(userId));
}

async function mentionsForComments(
  commentIds: string[],
): Promise<Map<string, IssueCommentMention[]>> {
  const map = new Map<string, IssueCommentMention[]>();
  if (commentIds.length === 0) return map;

  const rows = await db
    .select({
      commentId: mentions.commentId,
      userId: mentions.mentionedUserId,
      name: users.name,
      email: users.email,
    })
    .from(mentions)
    .innerJoin(users, eq(users.id, mentions.mentionedUserId))
    .where(inArray(mentions.commentId, commentIds));

  for (const row of rows) {
    if (!row.commentId) continue;
    const list = map.get(row.commentId) ?? [];
    list.push({
      userId: row.userId,
      displayName: personDisplayName(row.name, row.email),
    });
    map.set(row.commentId, list);
  }
  return map;
}

function toCommentView(
  row: {
    id: string;
    body: string;
    isPrivate: boolean;
    authorDisplayName: string;
    authorUserId: string | null;
    authorGuestId: string | null;
    createdAt: Date;
  },
  mentionList: IssueCommentMention[],
  videoNote: VideoNoteLink | null = null,
): IssueCommentView {
  return {
    id: row.id,
    body: row.body,
    visibility: row.isPrivate ? "private" : "public",
    authorDisplayName: row.authorDisplayName.trim() || "Someone",
    authorKind: row.authorGuestId ? "guest" : "member",
    createdAt: row.createdAt.toISOString(),
    mentions: mentionList,
    ...(videoNote ? { videoNote } : {}),
  };
}

export async function listIssueComments(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    /** Members see all; guests must use listGuestIssueComments. */
    includePrivate: boolean;
  },
): Promise<
  | { ok: true; comments: IssueCommentView[] }
  | { ok: false; error: "forbidden" | "not_found" | "unavailable" }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  try {
    const issue = await loadScopedIssue(context.workspaceId, input);
    if (!issue) return { ok: false, error: "not_found" };

    const filters = [
      eq(issueComments.workspaceId, context.workspaceId),
      eq(issueComments.issueId, issue.id),
      isNull(issueComments.deletedAt),
    ];
    if (!input.includePrivate) {
      filters.push(eq(issueComments.isPrivate, false));
    }

    const rows = await db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        isPrivate: issueComments.isPrivate,
        authorDisplayName: issueComments.authorDisplayName,
        authorUserId: issueComments.authorUserId,
        authorGuestId: issueComments.authorGuestId,
        createdAt: issueComments.createdAt,
      })
      .from(issueComments)
      .where(and(...filters))
      .orderBy(asc(issueComments.createdAt));

    const mentionMap = await mentionsForComments(rows.map((row) => row.id));
    const noteLinks = await loadVideoNoteLinks(
      context.workspaceId,
      rows.map((row) => row.id),
    );
    return {
      ok: true,
      comments: rows.map((row) =>
        toCommentView(row, mentionMap.get(row.id) ?? [], noteLinks.get(row.id) ?? null),
      ),
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function listGuestIssueComments(
  session: SdkSession,
  issueNumber: number,
): Promise<
  | { ok: true; comments: IssueCommentView[]; canComment: boolean }
  | {
      ok: false;
      error: "not_found" | "unavailable" | "forbidden";
    }
> {
  try {
    const issue = await loadScopedIssue(session.workspaceId, {
      projectId: session.projectId,
      reviewId: session.reviewId,
      issueNumber,
    });
    if (!issue) return { ok: false, error: "not_found" };

    const rows = await db
      .select({
        id: issueComments.id,
        body: issueComments.body,
        isPrivate: issueComments.isPrivate,
        authorDisplayName: issueComments.authorDisplayName,
        authorUserId: issueComments.authorUserId,
        authorGuestId: issueComments.authorGuestId,
        createdAt: issueComments.createdAt,
      })
      .from(issueComments)
      .where(
        and(
          eq(issueComments.workspaceId, session.workspaceId),
          eq(issueComments.issueId, issue.id),
          eq(issueComments.isPrivate, false),
          isNull(issueComments.deletedAt),
        ),
      )
      .orderBy(asc(issueComments.createdAt));

    const mentionMap = await mentionsForComments(rows.map((row) => row.id));
    const noteLinks = await loadVideoNoteLinks(
      session.workspaceId,
      rows.map((row) => row.id),
    );
    return {
      ok: true,
      canComment: session.canComment,
      comments: rows.map((row) => {
        const link = noteLinks.get(row.id) ?? null;
        // Guests learn whether the clip can still be watched, never why it is gone.
        const guestLink = link
          ? { ...link, videoState: link.videoState === "current" ? link.videoState : "removed" as const }
          : null;
        return toCommentView(row, mentionMap.get(row.id) ?? [], guestLink);
      }),
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

async function afterCommentSaved(input: {
  workspaceId: string;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  commentId: string;
  issueAuthorUserId: string | null;
  mentionedUserIds: string[];
  isPrivate: boolean;
  actorUserId: string | null;
  actorName: string;
  actorType: "user" | "guest";
}): Promise<void> {
  try {
    await notifyIssueComment({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      projectId: input.projectId,
      reviewId: input.reviewId,
      issueId: input.issueId,
      issueNumber: input.issueNumber,
      commentId: input.commentId,
      issueAuthorUserId: input.issueAuthorUserId,
      mentionedUserIds: input.mentionedUserIds,
      isPrivate: input.isPrivate,
    });
  } catch {
    // Keep the reply even if notifying fails.
  }

  if (input.isPrivate) {
    return;
  }

  await enqueueWebhookEventSafely({
    eventId: input.commentId,
    subscribedType: "issue.comment_added",
    eventType: "issue.comment_added",
    occurredAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    issueId: input.issueId,
    issueNumber: input.issueNumber,
    actor: { type: input.actorType, name: input.actorName },
    data: { visibility: "public" },
  });
}

export async function createIssueComment(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    body: string;
    visibility?: CommentVisibility | boolean;
    mentionedUserIds?: string[];
  },
): Promise<
  | { ok: true; comment: IssueCommentView }
  | { ok: false; error: CommentMutationError; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const normalized = normalizeBody(input.body);
  if (!normalized.ok) {
    return { ok: false, error: "validation", message: normalized.message };
  }

  const visibility =
    parseVisibility(input.visibility ?? "public") ?? "public";
  const isPrivate = visibility === "private";
  const authorDisplayName = actorLabel(context);

  try {
    const mentioned = await validateMentionUserIds(
      context.workspaceId,
      input.mentionedUserIds,
    );

    const created = await db.transaction(async (tx) => {
      const [issue] = await tx
        .select({
          id: issues.id,
          workspaceId: issues.workspaceId,
          projectId: issues.projectId,
          reviewId: issues.reviewId,
          number: issues.number,
          authorUserId: issues.authorUserId,
        })
        .from(issues)
        .where(
          and(
            eq(issues.workspaceId, context.workspaceId),
            eq(issues.projectId, input.projectId),
            eq(issues.reviewId, input.reviewId),
            eq(issues.number, input.issueNumber),
            isNull(issues.deletedAt),
          ),
        )
        .limit(1);

      if (!issue) {
        return { ok: false as const, error: "not_found" as const };
      }

      const now = new Date();
      const [comment] = await tx
        .insert(issueComments)
        .values({
          workspaceId: issue.workspaceId,
          issueId: issue.id,
          body: normalized.body,
          isPrivate,
          authorDisplayName,
          authorUserId: context.userId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: issueComments.id,
          body: issueComments.body,
          isPrivate: issueComments.isPrivate,
          authorDisplayName: issueComments.authorDisplayName,
          authorUserId: issueComments.authorUserId,
          authorGuestId: issueComments.authorGuestId,
          createdAt: issueComments.createdAt,
        });

      if (mentioned.length > 0) {
        await tx.insert(mentions).values(
          mentioned.map((mentionedUserId) => ({
            mentionedUserId,
            commentId: comment.id,
          })),
        );
      }

      await insertIssueActivityEvent(tx, {
        workspaceId: issue.workspaceId,
        projectId: issue.projectId,
        reviewId: issue.reviewId,
        issueId: issue.id,
        actorUserId: context.userId,
        type: isPrivate
          ? ISSUE_ACTIVITY_TYPES.PRIVATE_NOTE_ADDED
          : ISSUE_ACTIVITY_TYPES.COMMENT_ADDED,
        data: { visibility: isPrivate ? "private" : "public" },
        createdAt: now,
      });

      return {
        ok: true as const,
        comment,
        issue,
        mentioned,
      };
    });

    if (!created.ok) return created;

    const mentionViews: IssueCommentMention[] = [];
    if (created.mentioned.length > 0) {
      const names = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, created.mentioned));
      for (const row of names) {
        mentionViews.push({
          userId: row.id,
          displayName: personDisplayName(row.name, row.email),
        });
      }
    }

    await afterCommentSaved({
      workspaceId: context.workspaceId,
      projectId: created.issue.projectId,
      reviewId: created.issue.reviewId,
      issueId: created.issue.id,
      issueNumber: created.issue.number,
      commentId: created.comment.id,
      issueAuthorUserId: created.issue.authorUserId,
      mentionedUserIds: created.mentioned,
      isPrivate,
      actorUserId: context.userId,
      actorName: authorDisplayName,
      actorType: "user",
    });

    return {
      ok: true,
      comment: toCommentView(created.comment, mentionViews),
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

export async function createGuestIssueComment(
  session: SdkSession,
  input: {
    issueNumber: number;
    body: string;
    rateLimitSubjects?: string[];
  },
): Promise<
  | { ok: true; comment: IssueCommentView }
  | { ok: false; error: CommentMutationError; message?: string }
> {
  if (!session.canComment) {
    return {
      ok: false,
      error: "commenting_disabled",
      message: "This review link is view-only, so replies can’t be added.",
    };
  }

  const normalized = normalizeBody(input.body);
  if (!normalized.ok) {
    return { ok: false, error: "validation", message: normalized.message };
  }

  const rate = await enforceInstallationRateLimit({
    scope: "sdk_comment_write",
    subjects: [
      session.sessionId,
      session.guestIdentityId,
      ...(input.rateLimitSubjects ?? []),
    ],
  });
  if (!rate.ok) {
    return {
      ok: false,
      error: "rate_limited",
      message: "Too many replies just now. Wait a moment, then try again.",
    };
  }

  const [guest] = await db
    .select({
      id: guestIdentities.id,
      name: guestIdentities.name,
      email: guestIdentities.email,
    })
    .from(guestIdentities)
    .where(
      and(
        eq(guestIdentities.id, session.guestIdentityId),
        eq(guestIdentities.workspaceId, session.workspaceId),
      ),
    )
    .limit(1);

  if (!guest) {
    return { ok: false, error: "forbidden" };
  }

  const authorDisplayName = personDisplayName(guest.name, guest.email);

  try {
    const created = await db.transaction(async (tx) => {
      const [issue] = await tx
        .select({
          id: issues.id,
          workspaceId: issues.workspaceId,
          projectId: issues.projectId,
          reviewId: issues.reviewId,
          number: issues.number,
          authorUserId: issues.authorUserId,
        })
        .from(issues)
        .where(
          and(
            eq(issues.workspaceId, session.workspaceId),
            eq(issues.projectId, session.projectId),
            eq(issues.reviewId, session.reviewId),
            eq(issues.number, input.issueNumber),
            isNull(issues.deletedAt),
          ),
        )
        .limit(1);

      if (!issue) {
        return { ok: false as const, error: "not_found" as const };
      }

      const now = new Date();
      const [comment] = await tx
        .insert(issueComments)
        .values({
          workspaceId: issue.workspaceId,
          issueId: issue.id,
          body: normalized.body,
          isPrivate: false,
          authorDisplayName,
          authorGuestId: guest.id,
          createdAt: now,
          updatedAt: now,
        })
        .returning({
          id: issueComments.id,
          body: issueComments.body,
          isPrivate: issueComments.isPrivate,
          authorDisplayName: issueComments.authorDisplayName,
          authorUserId: issueComments.authorUserId,
          authorGuestId: issueComments.authorGuestId,
          createdAt: issueComments.createdAt,
        });

      await insertIssueActivityEvent(tx, {
        workspaceId: issue.workspaceId,
        projectId: issue.projectId,
        reviewId: issue.reviewId,
        issueId: issue.id,
        actorGuestId: guest.id,
        type: ISSUE_ACTIVITY_TYPES.COMMENT_ADDED,
        data: { visibility: "public" },
        createdAt: now,
      });

      return {
        ok: true as const,
        comment,
        issue,
      };
    });

    if (!created.ok) return created;

    await afterCommentSaved({
      workspaceId: session.workspaceId,
      projectId: created.issue.projectId,
      reviewId: created.issue.reviewId,
      issueId: created.issue.id,
      issueNumber: created.issue.number,
      commentId: created.comment.id,
      issueAuthorUserId: created.issue.authorUserId,
      mentionedUserIds: [],
      isPrivate: false,
      actorUserId: null,
      actorName: authorDisplayName,
      actorType: "guest",
    });

    return {
      ok: true,
      comment: toCommentView(created.comment, []),
    };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}

/** Active members the signed-in author may mention (never accept arbitrary browser IDs). */
export async function listMentionableMembers(
  context: WorkspaceContext,
): Promise<Array<{ userId: string; displayName: string }>> {
  const ids = await listActiveWorkspaceMemberIds(context.workspaceId);
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(inArray(users.id, ids), isNull(users.deletedAt)));

  return rows
    .map((row) => ({
      userId: row.userId,
      displayName: personDisplayName(row.name, row.email),
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}
