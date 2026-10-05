import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { issues, notifications, workspaceMemberships, workspaces } from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createIssueComment } from "@/lib/comments/service";
import { setEmailTransportForTests } from "@/lib/email";
import { TestEmailTransport } from "@/lib/email/test-transport";
import { createIssue } from "@/lib/issues/service";
import {
  updateIssueTriageAssignee,
  updateIssueTriageStatus,
} from "@/lib/issues/triage";
import {
  countUnreadNotifications,
  dispatchNotifications,
  getNotificationForUser,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  notificationTargetAccessible,
  updateUserNotificationSettings,
} from "@/lib/notifications/service";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function ownerContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Owner",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");
  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace failed");
  const [membership] = await db
    .select({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, created.user.id),
        eq(workspaceMemberships.workspaceId, workspace.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);

  return {
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

async function addMember(owner: WorkspaceContext, label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Maya",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("member failed");
  const [membership] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: owner.workspaceId,
      userId: created.user.id,
      role: "member",
      status: "active",
    })
    .returning({ membershipId: workspaceMemberships.id, role: workspaceMemberships.role });

  return {
    membershipId: membership.membershipId,
    workspaceId: owner.workspaceId,
    workspaceName: owner.workspaceName,
    workspaceSlug: owner.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

async function seedReview(label: string) {
  const context = await ownerContext(label);
  const project = await createProject(context, `${label} Project`);
  if (!project.ok) throw new Error("project failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: `${label} Review`,
    websiteUrl: "https://notify.example.com/start",
  });
  if (!review.ok) throw new Error("review failed");
  const created = await createIssue(context, {
    reviewId: review.review.id,
    body: `${label} contrast issue`,
  });
  if (!created.ok) throw new Error("issue failed");
  return {
    context,
    projectId: project.project.id,
    reviewId: review.review.id,
    issueId: created.issue.id,
    issueNumber: created.issue.number,
  };
}

describe("notifications", () => {
  it(
    "notifies the assignee, skips the actor, and emails once",
    { timeout: 60_000 },
    async () => {
      const transport = new TestEmailTransport();
      setEmailTransportForTests(transport);
      const seeded = await seedReview("assign");
      const member = await addMember(seeded.context, "assignee");

      const assigned = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: member.userId,
      });
      expect(assigned.ok).toBe(true);

      const inbox = await listNotificationsForUser(member.userId);
      expect(inbox.items).toHaveLength(1);
      expect(inbox.items[0]?.type).toBe("issue.assigned");
      expect(await countUnreadNotifications(member.userId)).toBe(1);
      expect(await countUnreadNotifications(seeded.context.userId)).toBe(0);
      expect(transport.findByRecipient(member.userEmail ?? "")).toBeTruthy();

      const again = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 2,
        assigneeUserId: member.userId,
      });
      expect(again.ok).toBe(true);
      await dispatchNotifications([
        {
          recipientUserId: member.userId,
          actorUserId: seeded.context.userId,
          workspaceId: seeded.context.workspaceId,
          projectId: seeded.projectId,
          reviewId: seeded.reviewId,
          issueId: seeded.issueId,
          type: "issue.assigned",
          dedupeKey: `issue.assigned:${seeded.issueId}:${member.userId}:2`,
          hrefPath: `/projects/${seeded.projectId}/reviews/${seeded.reviewId}/issues/${seeded.issueNumber}`,
          data: inbox.items[0]!.data,
        },
      ]);
      expect((await listNotificationsForUser(member.userId)).items).toHaveLength(1);
      setEmailTransportForTests(null);
    },
  );

  it(
    "does not email when the preference is off, and failed email does not undo assignment",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("prefs");
      const member = await addMember(seeded.context, "prefs-member");
      await updateUserNotificationSettings(member.userId, { emailAssignments: false });
      const transport = new TestEmailTransport();
      setEmailTransportForTests(transport);

      const assigned = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: member.userId,
      });
      expect(assigned.ok).toBe(true);
      expect((await listNotificationsForUser(member.userId)).items).toHaveLength(1);
      expect(transport.findByRecipient(member.userEmail ?? "")).toBeUndefined();

      setEmailTransportForTests({
        send: async () => {
          throw new Error("smtp down");
        },
      });
      const other = await addMember(seeded.context, "prefs-other");
      const second = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 2,
        assigneeUserId: other.userId,
      });
      expect(second.ok).toBe(true);
      const [row] = await db
        .select({ emailStatus: notifications.emailStatus, assignee: issues.assigneeUserId })
        .from(notifications)
        .innerJoin(issues, eq(issues.id, notifications.issueId))
        .where(eq(notifications.recipientUserId, other.userId));
      expect(row?.assignee).toBe(other.userId);
      expect(row?.emailStatus).toBe("failed");
      setEmailTransportForTests(null);
    },
  );

  it(
    "notifies on replies, verification, approval, and respects workspace boundaries",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("flow");
      const member = await addMember(seeded.context, "flow-member");
      await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: member.userId,
      });
      await markAllNotificationsRead(member.userId);

      const reply = await createIssueComment(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "I started the fix.",
        mentionedUserIds: [seeded.context.userId],
      });
      expect(reply.ok).toBe(true);
      const ownerInbox = await listNotificationsForUser(seeded.context.userId);
      expect(ownerInbox.items.some((item) => item.type === "issue.comment_replied")).toBe(true);
      expect(ownerInbox.items.some((item) => item.type === "issue.mentioned")).toBe(true);

      await updateIssueTriageStatus(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 2,
        status: "in_progress",
      });
      await updateIssueTriageStatus(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 3,
        status: "ready_for_verification",
      });
      const ownerReady = await listNotificationsForUser(seeded.context.userId);
      expect(
        ownerReady.items.some((item) => item.type === "issue.ready_for_verification"),
      ).toBe(true);

      const outsider = await ownerContext("outside");
      const first = (await listNotificationsForUser(member.userId)).items[0];
      expect(first).toBeTruthy();
      if (!first) return;
      expect(await getNotificationForUser(outsider.userId, first.id)).toBeNull();
      expect(
        await notificationTargetAccessible(outsider, first),
      ).toBe(false);

      await markNotificationRead(member.userId, first.id);
      expect(await countUnreadNotifications(member.userId)).toBeGreaterThanOrEqual(0);
      const afterRead = await getNotificationForUser(member.userId, first.id);
      expect(afterRead?.readAt).toBeTruthy();
    },
  );
});
