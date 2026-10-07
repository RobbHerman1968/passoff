import { db } from "@/db";
import { activityEvents } from "@/db/schema";

type ActivityTransaction = {
  insert: Parameters<Parameters<typeof db.transaction>[0]>[0]["insert"];
};

export async function insertIssueActivityEvent(
  tx: ActivityTransaction,
  values: {
    workspaceId: string;
    projectId: string;
    reviewId: string;
    issueId: string;
    actorUserId?: string | null;
    actorGuestId?: string | null;
    type: string;
    data: Record<string, unknown>;
    createdAt: Date;
  },
) {
  const [row] = await tx
    .insert(activityEvents)
    .values({
      workspaceId: values.workspaceId,
      projectId: values.projectId,
      reviewId: values.reviewId,
      issueId: values.issueId,
      actorUserId: values.actorUserId ?? null,
      actorGuestId: values.actorGuestId ?? null,
      type: values.type,
      data: values.data,
      createdAt: values.createdAt,
    })
    .returning({
      id: activityEvents.id,
      createdAt: activityEvents.createdAt,
    });
  return row;
}
