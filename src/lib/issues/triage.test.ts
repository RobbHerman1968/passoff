import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  issues,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createIssue } from "@/lib/issues/service";
import {
  ISSUE_TRIAGE_CONFLICT_MESSAGE,
  ISSUE_TRIAGE_UNAVAILABLE_MESSAGE,
} from "@/lib/issues/triage-transitions";
import {
  listIssueHistory,
  updateIssueTriageAssignee,
  updateIssueTriagePriority,
  updateIssueTriageStatus,
} from "@/lib/issues/triage";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceUser(
  label: string,
  names: { firstName: string; lastName: string },
) {
  const created = await createCredentialsUser({
    firstName: names.firstName,
    lastName: names.lastName,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");
  return created.user;
}

async function ownerContext(label: string): Promise<WorkspaceContext> {
  const user = await createWorkspaceUser(label, {
    firstName: "Rob",
    lastName: label,
  });
  const workspace = await createOwnerWorkspace({
    userId: user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("workspace create failed");

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
        eq(workspaceMemberships.userId, user.id),
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
    userId: user.id,
    userName: user.name ?? null,
    userEmail: user.email,
  };
}

async function addMember(
  owner: WorkspaceContext,
  label: string,
  names: { firstName: string; lastName: string },
  status: "active" | "suspended" = "active",
): Promise<WorkspaceContext> {
  const user = await createWorkspaceUser(label, names);
  const [membership] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: owner.workspaceId,
      userId: user.id,
      role: "member",
      status,
    })
    .returning({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
    });

  return {
    membershipId: membership.membershipId,
    workspaceId: owner.workspaceId,
    workspaceName: owner.workspaceName,
    workspaceSlug: owner.workspaceSlug,
    role: membership.role,
    userId: user.id,
    userName: user.name ?? null,
    userEmail: user.email,
  };
}

async function seedIssue(label: string) {
  const context = await ownerContext(label);
  const project = await createProject(context, `${label} Project`);
  if (!project.ok) throw new Error("project failed");
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: `${label} Review`,
    websiteUrl: "https://triage.example.com/start",
  });
  if (!review.ok) throw new Error("review failed");
  const created = await createIssue(context, {
    reviewId: review.review.id,
    body: `${label} needs a contrast fix`,
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

async function issueRow(issueId: string) {
  const [row] = await db.select().from(issues).where(eq(issues.id, issueId));
  return row;
}

async function eventsFor(issueId: string) {
  return db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.issueId, issueId));
}

describe("issue triage service", () => {
  it(
    "lets an owner update status, priority, and assignee with history",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("owner");
      const member = await addMember(seeded.context, "maya", {
        firstName: "Maya",
        lastName: "Member",
      });

      const status = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(status.ok).toBe(true);
      if (!status.ok) return;

      const priority = await updateIssueTriagePriority(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: status.issue.version,
        priority: "urgent",
      });
      expect(priority.ok).toBe(true);
      if (!priority.ok) return;

      const assigned = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: priority.issue.version,
        assigneeUserId: member.userId,
      });
      expect(assigned.ok).toBe(true);
      if (!assigned.ok) return;
      expect(assigned.issue.assigneeDisplayName).toContain("Maya");

      const row = await issueRow(seeded.issueId);
      expect(row.status).toBe("in_progress");
      expect(row.priority).toBe("urgent");
      expect(row.assigneeUserId).toBe(member.userId);
      expect(row.version).toBe(4);

      const history = await listIssueHistory(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
      });
      expect(history?.[0]?.summary).toContain("assigned this issue to Maya");
      expect(history?.some((event) => event.summary.includes("Urgent"))).toBe(true);
      expect(
        history?.some((event) =>
          event.summary.includes("changed status from Open to In progress"),
        ),
      ).toBe(true);
    },
  );

  it(
    "lets a member update status, priority, and assignee",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("member");
      const member = await addMember(seeded.context, "dev", {
        firstName: "Dev",
        lastName: "Member",
      });

      const status = await updateIssueTriageStatus(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(status.ok).toBe(true);

      const priority = await updateIssueTriagePriority(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 2,
        priority: "low",
      });
      expect(priority.ok).toBe(true);

      const assigned = await updateIssueTriageAssignee(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 3,
        assigneeUserId: member.userId,
      });
      expect(assigned.ok).toBe(true);
    },
  );

  it(
    "rejects unsupported status transitions and verified or closed changes",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("badstatus");
      const skipped = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "ready_for_verification",
      });
      expect(skipped.ok).toBe(false);
      if (!skipped.ok) {
        expect(skipped.error).toBe("validation");
      }

      const verifiedNow = new Date();
      await db
        .update(issues)
        .set({ status: "verified", verifiedAt: verifiedNow })
        .where(eq(issues.id, seeded.issueId));
      const verified = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(verified.ok).toBe(false);

      await db
        .update(issues)
        .set({
          status: "closed",
          closureReason: "not_planned",
          closedAt: verifiedNow,
          verifiedAt: null,
        })
        .where(eq(issues.id, seeded.issueId));
      const closed = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "open",
      });
      expect(closed.ok).toBe(false);
      if (!closed.ok) {
        expect(closed.message).toMatch(/reviewer workflow/i);
      }
    },
  );

  it(
    "rejects cross-workspace access without revealing the issue",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("iso-a");
      const other = await seedIssue("iso-b");
      const result = await updateIssueTriageStatus(other.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(result).toEqual({
        ok: false,
        error: "not_found",
        message: ISSUE_TRIAGE_UNAVAILABLE_MESSAGE,
      });
    },
  );

  it(
    "rejects cross-workspace and inactive assignees, and supports unassigning",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("assign");
      const other = await seedIssue("assign-other");
      const inactive = await addMember(
        seeded.context,
        "gone",
        { firstName: "Gone", lastName: "Member" },
        "suspended",
      );
      const active = await addMember(seeded.context, "maya2", {
        firstName: "Maya",
        lastName: "Active",
      });

      const outsider = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: other.context.userId,
      });
      expect(outsider.ok).toBe(false);

      const frozen = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: inactive.userId,
      });
      expect(frozen.ok).toBe(false);

      const assigned = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        assigneeUserId: active.userId,
      });
      expect(assigned.ok).toBe(true);

      const unassigned = await updateIssueTriageAssignee(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 2,
        assigneeUserId: null,
      });
      expect(unassigned.ok).toBe(true);
      if (unassigned.ok) {
        expect(unassigned.issue.assigneeUserId).toBeNull();
        expect(unassigned.event.summary).toContain("removed Maya");
      }
    },
  );

  it(
    "increments version, returns a friendly conflict, and writes history atomically",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedIssue("version");
      const first = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(first.ok).toBe(true);
      expect((await issueRow(seeded.issueId)).version).toBe(2);
      expect(await eventsFor(seeded.issueId)).toHaveLength(1);

      const stale = await updateIssueTriagePriority(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        priority: "high",
      });
      expect(stale).toEqual({
        ok: false,
        error: "conflict",
        message: ISSUE_TRIAGE_CONFLICT_MESSAGE,
      });
      expect(await eventsFor(seeded.issueId)).toHaveLength(1);
    },
  );

  it(
    "does not leave a history event when the activity write fails",
    { timeout: 60_000 },
    async () => {
      const activityRecord = await import("@/lib/issues/activity-record");
      const spy = vi
        .spyOn(activityRecord, "insertIssueActivityEvent")
        .mockRejectedValueOnce(new Error("write failed"));
      const seeded = await seedIssue("rollback");

      const result = await updateIssueTriageStatus(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        version: 1,
        status: "in_progress",
      });
      expect(result.ok).toBe(false);
      expect((await issueRow(seeded.issueId)).status).toBe("open");
      expect((await issueRow(seeded.issueId)).version).toBe(1);
      expect(await eventsFor(seeded.issueId)).toHaveLength(0);
      spy.mockRestore();
    },
  );
});
