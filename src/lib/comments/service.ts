import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { issueComments, issues, mentions } from "@/db/schema";
import { listActiveWorkspaceMemberIds } from "@/lib/notifications/service";
import { notifyIssueComment } from "@/lib/notifications/events";
import { actorLabel } from "@/lib/notifications/service";
import { canMutateProjects } from "@/lib/projects/permissions";
import { enqueueWebhookEventSafely } from "@/lib/webhooks/enqueue";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export async function createIssueComment(
  context: WorkspaceContext,
  input: {
    projectId: string;
    reviewId: string;
    issueNumber: number;
    body: string;
    mentionedUserIds?: string[];
  },
): Promise<
  | { ok: true; commentId: string }
  | { ok: false; error: "forbidden" | "not_found" | "validation" | "unavailable"; message?: string }
> {
  if (!canMutateProjects(context)) {
    return { ok: false, error: "forbidden" };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: "validation", message: "Enter a reply." };
  }
  if (body.length > 4000) {
    return {
      ok: false,
      error: "validation",
      message: "Keep this reply under 4,000 characters.",
    };
  }

  try {
    const members = new Set(
      await listActiveWorkspaceMemberIds(context.workspaceId, context.userId),
    );
    const mentioned = [...new Set(input.mentionedUserIds ?? [])].filter((userId) =>
      members.has(userId),
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

      const [comment] = await tx
        .insert(issueComments)
        .values({
          workspaceId: issue.workspaceId,
          issueId: issue.id,
          body,
          authorUserId: context.userId,
        })
        .returning({ id: issueComments.id });

      if (mentioned.length > 0) {
        await tx.insert(mentions).values(
          mentioned.map((mentionedUserId) => ({
            mentionedUserId,
            commentId: comment.id,
          })),
        );
      }

      return {
        ok: true as const,
        commentId: comment.id,
        issue,
        mentioned,
      };
    });

    if (!created.ok) return created;

    try {
      await notifyIssueComment({
        context,
        projectId: created.issue.projectId,
        reviewId: created.issue.reviewId,
        issueId: created.issue.id,
        issueNumber: created.issue.number,
        commentId: created.commentId,
        issueAuthorUserId: created.issue.authorUserId,
        mentionedUserIds: created.mentioned,
      });
    } catch {
      // Keep the reply even if notifying fails.
    }
    await enqueueWebhookEventSafely({
      eventId: created.commentId,
      subscribedType: "issue.comment_added",
      eventType: "issue.comment_added",
      occurredAt: new Date().toISOString(),
      workspaceId: context.workspaceId,
      projectId: created.issue.projectId,
      reviewId: created.issue.reviewId,
      issueId: created.issue.id,
      issueNumber: created.issue.number,
      actor: { type: "user", name: actorLabel(context) },
      data: { visibility: "public" },
    });

    return { ok: true, commentId: created.commentId };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
