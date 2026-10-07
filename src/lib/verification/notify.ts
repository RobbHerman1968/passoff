import "server-only";

import {
  dispatchNotifications,
  issueHref,
} from "@/lib/notifications/service";
import type { CreateNotificationInput } from "@/lib/notifications/service";
import { db } from "@/db";
import { issues } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function notifyVerificationRunFinished(input: {
  workspaceId: string;
  projectId: string;
  reviewId: string;
  issueId: string;
  issueNumber: number;
  runId: string;
  initiatingUserId: string;
  overall: "passed" | "failed" | "uncertain" | "cancelled";
  versionLabel: string;
}): Promise<void> {
  if (input.overall === "passed" || input.overall === "cancelled") return;

  const [issue] = await db
    .select({
      assigneeUserId: issues.assigneeUserId,
    })
    .from(issues)
    .where(
      and(eq(issues.id, input.issueId), eq(issues.workspaceId, input.workspaceId)),
    )
    .limit(1);

  const href = issueHref(input.projectId, input.reviewId, input.issueNumber);
  const type =
    input.overall === "failed"
      ? "verification_run.failed"
      : "verification_run.uncertain";

  const recipients = new Set<string>();
  if (issue?.assigneeUserId && issue.assigneeUserId !== input.initiatingUserId) {
    recipients.add(issue.assigneeUserId);
  }

  const events: CreateNotificationInput[] = [...recipients].map((recipientUserId) => ({
    recipientUserId,
    actorUserId: input.initiatingUserId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    reviewId: input.reviewId,
    issueId: input.issueId,
    type,
    dedupeKey: `${type}:${input.runId}:${recipientUserId}`,
    hrefPath: href,
    data: {
      workspaceName: "",
      projectName: "",
      reviewName: "",
      actorName: "A teammate",
      issueNumber: input.issueNumber,
      versionLabel: input.versionLabel,
    },
  }));

  if (events.length === 0) return;

  const { loadNotificationContext } = await import("@/lib/notifications/service");
  const names = await loadNotificationContext(
    input.workspaceId,
    input.projectId,
    input.reviewId,
  );
  if (!names) return;
  for (const event of events) {
    event.data = {
      ...event.data,
      workspaceName: names.workspaceName,
      projectName: names.projectName,
      reviewName: names.reviewName,
    };
  }
  await dispatchNotifications(events);
}
