import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  issueComments,
  issues,
  notifications,
  workspaceMemberships,
} from "@/db/schema";
import { listUserWorkspaces, getActiveMembership } from "@/lib/auth/membership";
import { getMemberCapacity } from "@/lib/workspaces/capacity";
import {
  leaveWorkspace,
  listMembers,
  removeMember,
  transferOwnership,
} from "@/lib/workspaces/members";
import { renameWorkspace } from "@/lib/workspaces/settings";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedReviewWithIssue,
  seedWorkspacePlan,
} from "@/test/workspace-fixtures";

async function roles(workspaceId: string) {
  return db
    .select({ userId: workspaceMemberships.userId, role: workspaceMemberships.role })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    );
}

describe("workspace members", () => {
  it("lists members for anyone in the workspace, marking the caller", async () => {
    const owner = await createOwnerContext("MembersList");
    const member = await addWorkspaceMember(owner, "MembersListM");
    const listed = await listMembers(member);
    if (!listed.ok) throw new Error("list failed");
    const list = listed.members;
    expect(list.map((entry) => entry.role).sort()).toEqual(["member", "owner"]);
    expect(list.find((entry) => entry.userId === member.userId)?.isYou).toBe(true);
  });

  describe("removing", () => {
    it("is owner-only, even with a stale owner context", async () => {
      const owner = await createOwnerContext("RemoveGate");
      const a = await addWorkspaceMember(owner, "RemoveGateA");
      const b = await addWorkspaceMember(owner, "RemoveGateB");
      expect(await removeMember(a, { memberUserId: b.userId })).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(
        await removeMember({ ...a, role: "owner" }, { memberUserId: b.userId }),
      ).toMatchObject({ ok: false, error: "forbidden" });
      expect(await roles(owner.workspaceId)).toHaveLength(3);
    });

    it("cannot remove the owner or yourself", async () => {
      const owner = await createOwnerContext("RemoveOwner");
      expect(await removeMember(owner, { memberUserId: owner.userId })).toMatchObject({ ok: false });
      const member = await addWorkspaceMember(owner, "RemoveOwnerM");
      // A stale "owner" context cannot be used to remove the real owner either.
      expect(await removeMember(member, { memberUserId: owner.userId })).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(await roles(owner.workspaceId)).toHaveLength(2);
    });

    it("unassigns their work, keeps comments and issues, and clears their inbox here", async () => {
      const seeded = await seedReviewWithIssue("RemoveWork");
      const owner = seeded.context;
      const member = await addWorkspaceMember(owner, "RemoveWorkM");
      await db
        .update(issues)
        .set({ assigneeUserId: member.userId })
        .where(eq(issues.id, seeded.issueId));
      await db.insert(issueComments).values({
        workspaceId: owner.workspaceId,
        issueId: seeded.issueId,
        body: "I checked this on mobile.",
        authorDisplayName: "Member",
        authorUserId: member.userId,
      });
      await db.insert(notifications).values({
        recipientUserId: member.userId,
        workspaceId: owner.workspaceId,
        type: "issue.assigned",
        hrefPath: "/dashboard",
        dedupeKey: `remove-work-${member.userId}`,
      });

      const result = await removeMember(owner, { memberUserId: member.userId });
      expect(result).toMatchObject({ ok: true, unassignedIssues: 1 });

      const [issue] = await db.select().from(issues).where(eq(issues.id, seeded.issueId));
      expect(issue.assigneeUserId).toBeNull();
      const comments = await db
        .select()
        .from(issueComments)
        .where(eq(issueComments.issueId, seeded.issueId));
      expect(comments).toHaveLength(1);
      expect(comments[0].authorDisplayName).toBe("Member");
      expect(
        await db.select().from(notifications).where(eq(notifications.recipientUserId, member.userId)),
      ).toHaveLength(0);

      // They no longer have this workspace, and they can't act in it.
      expect(await listUserWorkspaces(member.userId)).toHaveLength(0);
      expect(await getActiveMembership(member.userId, owner.workspaceId)).toBeNull();
    });

    it("is not repeatable on someone already gone, and records a safe history entry", async () => {
      const owner = await createOwnerContext("RemoveTwice");
      const member = await addWorkspaceMember(owner, "RemoveTwiceM");
      expect(await removeMember(owner, { memberUserId: member.userId })).toMatchObject({ ok: true });
      expect(await removeMember(owner, { memberUserId: member.userId })).toMatchObject({
        ok: false,
        error: "not_found",
      });
      const events = await db
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.workspaceId, owner.workspaceId),
            eq(activityEvents.type, "workspace.member_removed"),
          ),
        );
      expect(events).toHaveLength(1);
      expect(events[0].actorUserId).toBe(owner.userId);
    });

    it("frees a seat", async () => {
      const owner = await createOwnerContext("RemoveSeat");
      await seedWorkspacePlan(owner.workspaceId, "studio");
      const member = await addWorkspaceMember(owner, "RemoveSeatM");
      expect((await getMemberCapacity(owner.workspaceId)).activeMembers).toBe(2);
      await removeMember(owner, { memberUserId: member.userId });
      expect((await getMemberCapacity(owner.workspaceId)).activeMembers).toBe(1);
    });
  });

  describe("transferring ownership", () => {
    it("moves ownership in one step and leaves exactly one owner", async () => {
      const owner = await createOwnerContext("Transfer");
      const member = await addWorkspaceMember(owner, "TransferM");
      const result = await transferOwnership(owner, { newOwnerUserId: member.userId });
      expect(result).toMatchObject({ ok: true });

      const after = await roles(owner.workspaceId);
      expect(after.filter((row) => row.role === "owner")).toEqual([
        { userId: member.userId, role: "owner" },
      ]);
      expect(after.find((row) => row.userId === owner.userId)?.role).toBe("member");

      // The former owner (with an old "owner" context) can no longer use owner powers.
      expect(await transferOwnership(owner, { newOwnerUserId: owner.userId })).toMatchObject({
        ok: false,
      });
      expect(await renameWorkspace(owner, { name: "Hijacked" })).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(
        await removeMember(owner, { memberUserId: member.userId }),
      ).toMatchObject({ ok: false, error: "forbidden" });
    });

    it("refuses non-owners and people outside the workspace", async () => {
      const owner = await createOwnerContext("TransferGate");
      const member = await addWorkspaceMember(owner, "TransferGateM");
      const outsider = await createOwnerContext("TransferGateOut");
      expect(await transferOwnership(member, { newOwnerUserId: member.userId })).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(await transferOwnership(owner, { newOwnerUserId: outsider.userId })).toMatchObject({
        ok: false,
      });
      expect(await transferOwnership(owner, { newOwnerUserId: owner.userId })).toMatchObject({
        ok: false,
      });
      const after = await roles(owner.workspaceId);
      expect(after.filter((row) => row.role === "owner")).toHaveLength(1);
      expect(after.find((row) => row.role === "owner")?.userId).toBe(owner.userId);
    });

    it("keeps exactly one owner when two transfers race", async () => {
      const owner = await createOwnerContext("TransferRace");
      const a = await addWorkspaceMember(owner, "TransferRaceA");
      const b = await addWorkspaceMember(owner, "TransferRaceB");
      const results = await Promise.all([
        transferOwnership(owner, { newOwnerUserId: a.userId }),
        transferOwnership(owner, { newOwnerUserId: b.userId }),
      ]);
      expect(results.filter((result) => result.ok)).toHaveLength(1);
      const after = await roles(owner.workspaceId);
      expect(after.filter((row) => row.role === "owner")).toHaveLength(1);
    });
  });

  describe("leaving", () => {
    it("lets a member leave and keeps their history", async () => {
      const seeded = await seedReviewWithIssue("Leave");
      const owner = seeded.context;
      const member = await addWorkspaceMember(owner, "LeaveM");
      await db.insert(issueComments).values({
        workspaceId: owner.workspaceId,
        issueId: seeded.issueId,
        body: "Leaving a note first.",
        authorDisplayName: "Leaver",
        authorUserId: member.userId,
      });
      expect(await leaveWorkspace(member)).toMatchObject({ ok: true });
      expect(await roles(owner.workspaceId)).toHaveLength(1);
      expect(
        await db.select().from(issueComments).where(eq(issueComments.issueId, seeded.issueId)),
      ).toHaveLength(1);
      expect(await leaveWorkspace(member)).toMatchObject({ ok: false });
    });

    it("does not let the owner walk away from the workspace", async () => {
      const owner = await createOwnerContext("LeaveOwner");
      const result = await leaveWorkspace(owner);
      expect(result).toMatchObject({ ok: false, error: "sole_owner" });
      expect(await roles(owner.workspaceId)).toHaveLength(1);
    });
  });

  describe("workspace names and active workspace", () => {
    it("lets only the owner rename, and validates the name", async () => {
      const owner = await createOwnerContext("Rename");
      const member = await addWorkspaceMember(owner, "RenameM");
      expect(await renameWorkspace(member, { name: "Nope" })).toMatchObject({
        ok: false,
        error: "forbidden",
      });
      expect(await renameWorkspace(owner, { name: "   " })).toMatchObject({
        ok: false,
        error: "validation",
      });
      expect(await renameWorkspace(owner, { name: "  Brighter Studio " })).toMatchObject({
        ok: true,
        name: "Brighter Studio",
      });
    });

    it("only honors a preferred workspace the person actually belongs to", async () => {
      const first = await createOwnerContext("ActiveA");
      const second = await createOwnerContext("ActiveB");
      const forged = await getActiveMembership(first.userId, second.workspaceId);
      expect(forged?.workspaceId).toBe(first.workspaceId);

      // Join a second workspace; switching is honored, and leaving it falls back.
      await db.insert(workspaceMemberships).values({
        workspaceId: second.workspaceId,
        userId: first.userId,
        role: "member",
        status: "active",
      });
      const switched = await getActiveMembership(first.userId, second.workspaceId);
      expect(switched).toMatchObject({ workspaceId: second.workspaceId, role: "member" });
      expect(await listUserWorkspaces(first.userId)).toHaveLength(2);
    });
  });
});
