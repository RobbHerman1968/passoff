import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  notifications,
  workspaceInvitations,
  workspaceMemberships,
} from "@/db/schema";
import { clearAuthRateLimit, seedAuthRateLimit } from "@/lib/auth/rate-limit";
import { hashToken } from "@/lib/auth/tokens";
import { createCredentialsUser } from "@/lib/auth/users";
import { getTestEmailTransport } from "@/lib/email/test-transport";
import {
  acceptInvitation,
  inspectInvitation,
  inviteMember,
  listInvitations,
  resendInvitation,
  revokeInvitation,
} from "@/lib/workspaces/invitations";
import { getMemberCapacity } from "@/lib/workspaces/capacity";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedWorkspacePlan,
} from "@/test/workspace-fixtures";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

function tokenFor(email: string): string {
  const path = getTestEmailTransport().extractInvitationPath(email);
  if (!path) throw new Error(`no invitation email for ${email}`);
  return path.replace("/invite/", "");
}

async function newUser(label: string, email = uniqueEmail(label)) {
  const created = await createCredentialsUser({
    firstName: "Invited",
    lastName: label,
    email,
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");
  return { userId: created.user.id, email };
}

async function studioOwner(label: string) {
  const owner = await createOwnerContext(label);
  await seedWorkspacePlan(owner.workspaceId, "studio");
  return owner;
}

describe("workspace invitations", () => {
  beforeEach(() => {
    getTestEmailTransport().clear();
  });

  it("only lets an owner invite, even with a stale owner context", async () => {
    const owner = await studioOwner("InviteGate");
    const member = await addWorkspaceMember(owner, "InviteGateMember");

    const refused = await inviteMember(member, { email: uniqueEmail("x") });
    expect(refused).toMatchObject({ ok: false, error: "forbidden" });

    // The caller's context says "owner", but the database says "member".
    const stale = await inviteMember({ ...member, role: "owner" }, { email: uniqueEmail("y") });
    expect(stale).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("normalizes the address, stores only a hash, and sends the link by email", async () => {
    const owner = await studioOwner("InviteHash");
    const email = uniqueEmail("mixedcase");
    const result = await inviteMember(owner, { email: `  ${email.toUpperCase()} ` });
    expect(result).toMatchObject({ ok: true, emailSent: true });
    if (!result.ok) return;

    const token = tokenFor(email);
    expect(token.length).toBeGreaterThanOrEqual(32);

    const [row] = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, result.invitation.id));
    expect(row.email).toBe(email);
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.role).toBe("member");
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DAY);
  });

  it("rejects bad addresses, existing members, and duplicate open invitations", async () => {
    const owner = await studioOwner("InviteDupes");
    expect(await inviteMember(owner, { email: "nope" })).toMatchObject({
      ok: false,
      error: "invalid_email",
    });
    expect(await inviteMember(owner, { email: owner.userEmail! })).toMatchObject({
      ok: false,
      error: "already_member",
    });

    const email = uniqueEmail("dupe");
    expect(await inviteMember(owner, { email })).toMatchObject({ ok: true });
    expect(await inviteMember(owner, { email: email.toUpperCase() })).toMatchObject({
      ok: false,
      error: "already_invited",
    });
    const open = await db
      .select({ id: workspaceInvitations.id })
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, owner.workspaceId));
    expect(open).toHaveLength(1);
  });

  it("replaces an expired invitation with a fresh one", async () => {
    const owner = await studioOwner("InviteExpired");
    const email = uniqueEmail("expired");
    const first = await inviteMember(owner, { email }, new Date(Date.now() - 10 * DAY));
    expect(first).toMatchObject({ ok: true });
    const oldToken = tokenFor(email);

    const second = await inviteMember(owner, { email });
    expect(second).toMatchObject({ ok: true });
    const newToken = tokenFor(email);
    expect(newToken).not.toBe(oldToken);

    const old = await acceptInvitation({ userId: (await newUser("late", email)).userId }, oldToken);
    expect(old).toMatchObject({ ok: false });
  });

  it("blocks invitations that would go over the plan, counting pending ones", async () => {
    const owner = await createOwnerContext("InviteFree");
    const free = await inviteMember(owner, { email: uniqueEmail("free") });
    expect(free).toMatchObject({ ok: false, error: "at_capacity" });

    await seedWorkspacePlan(owner.workspaceId, "studio");
    expect(await inviteMember(owner, { email: uniqueEmail("a") })).toMatchObject({ ok: true });
    expect(await inviteMember(owner, { email: uniqueEmail("b") })).toMatchObject({ ok: true });
    const capacity = await getMemberCapacity(owner.workspaceId);
    expect(capacity).toMatchObject({ limit: 3, activeMembers: 1, pendingInvitations: 2, atCapacity: true });
    expect(await inviteMember(owner, { email: uniqueEmail("c") })).toMatchObject({
      ok: false,
      error: "at_capacity",
    });
  });

  it("limits how many invitations a workspace can send per hour", async () => {
    const owner = await studioOwner("InviteRate");
    await seedAuthRateLimit({
      scope: "workspace_invite",
      subjects: [owner.workspaceId],
      attemptCount: 20,
    });
    const result = await inviteMember(owner, { email: uniqueEmail("rate") });
    expect(result).toMatchObject({ ok: false, error: "rate_limited" });
    await clearAuthRateLimit("workspace_invite", [owner.workspaceId]);
  });

  it("resend rotates the link, keeps it to one open invitation, and waits between sends", async () => {
    const owner = await studioOwner("InviteResend");
    const email = uniqueEmail("resend");
    const sent = await inviteMember(owner, { email });
    if (!sent.ok) throw new Error("invite failed");
    const firstToken = tokenFor(email);

    const tooSoon = await resendInvitation(owner, { invitationId: sent.invitation.id });
    expect(tooSoon).toMatchObject({ ok: false, error: "too_soon" });

    const later = new Date(Date.now() + 2 * MINUTE);
    const resent = await resendInvitation(owner, { invitationId: sent.invitation.id }, later);
    expect(resent).toMatchObject({ ok: true });
    const secondToken = tokenFor(email);
    expect(secondToken).not.toBe(firstToken);

    const user = await newUser("resend", email);
    expect(await acceptInvitation({ userId: user.userId }, firstToken)).toMatchObject({ ok: false });
    expect(await acceptInvitation({ userId: user.userId }, secondToken)).toMatchObject({ ok: true });

    const list = await listInvitations(owner);
    expect(list).toMatchObject({ ok: true, invitations: [] });
  });

  it("revoke kills the link, and repeating it is safe", async () => {
    const owner = await studioOwner("InviteRevoke");
    const email = uniqueEmail("revoke");
    const sent = await inviteMember(owner, { email });
    if (!sent.ok) throw new Error("invite failed");
    const token = tokenFor(email);

    expect(await revokeInvitation(owner, { invitationId: sent.invitation.id })).toMatchObject({ ok: true });
    expect(await revokeInvitation(owner, { invitationId: sent.invitation.id })).toMatchObject({ ok: true });
    expect(await inspectInvitation(token, null)).toEqual({ status: "revoked" });

    const user = await newUser("revoke", email);
    expect(await acceptInvitation({ userId: user.userId }, token)).toMatchObject({
      ok: false,
      error: "revoked",
    });
  });

  it("members cannot resend or revoke", async () => {
    const owner = await studioOwner("InviteMemberManage");
    const member = await addWorkspaceMember(owner, "InviteMemberManageM");
    const sent = await inviteMember(owner, { email: uniqueEmail("m") });
    if (!sent.ok) throw new Error("invite failed");
    expect(await revokeInvitation(member, { invitationId: sent.invitation.id })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
    expect(await resendInvitation(member, { invitationId: sent.invitation.id })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
  });

  it("cannot manage another workspace's invitation", async () => {
    const owner = await studioOwner("InviteCross");
    const other = await studioOwner("InviteCrossOther");
    const sent = await inviteMember(owner, { email: uniqueEmail("cross") });
    if (!sent.ok) throw new Error("invite failed");
    expect(await revokeInvitation(other, { invitationId: sent.invitation.id })).toMatchObject({
      ok: false,
      error: "not_found",
    });
  });

  describe("accepting", () => {
    it("lets a brand-new account join with the invited address", async () => {
      const owner = await studioOwner("AcceptNew");
      const email = uniqueEmail("new");
      await inviteMember(owner, { email });
      const token = tokenFor(email);

      const user = await newUser("new", email);
      const view = await inspectInvitation(token, { userId: user.userId, email });
      expect(view).toMatchObject({ status: "pending", emailMismatch: false, alreadyMember: false });

      const result = await acceptInvitation({ userId: user.userId }, token);
      expect(result).toMatchObject({ ok: true, workspaceId: owner.workspaceId, alreadyMember: false });

      const [membership] = await db
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, owner.workspaceId),
            eq(workspaceMemberships.userId, user.userId),
          ),
        );
      expect(membership).toMatchObject({ role: "member", status: "active" });
    });

    it("is safe to repeat for the same person", async () => {
      const owner = await studioOwner("AcceptTwice");
      const email = uniqueEmail("twice");
      await inviteMember(owner, { email });
      const token = tokenFor(email);
      const user = await newUser("twice", email);

      expect(await acceptInvitation({ userId: user.userId }, token)).toMatchObject({ ok: true });
      expect(await acceptInvitation({ userId: user.userId }, token)).toMatchObject({
        ok: true,
        alreadyMember: true,
      });
      const rows = await db
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, owner.workspaceId),
            eq(workspaceMemberships.userId, user.userId),
          ),
        );
      expect(rows).toHaveLength(1);
    });

    it("does not let someone else reuse a link that was already used", async () => {
      const owner = await studioOwner("AcceptUsed");
      const email = uniqueEmail("used");
      await inviteMember(owner, { email });
      const token = tokenFor(email);
      const user = await newUser("used", email);
      await acceptInvitation({ userId: user.userId }, token);

      const other = await newUser("usedother");
      expect(await acceptInvitation({ userId: other.userId }, token)).toMatchObject({
        ok: false,
        error: "used",
      });
    });

    it("refuses a different email address and shows only a masked address", async () => {
      const owner = await studioOwner("AcceptMismatch");
      const email = uniqueEmail("invited");
      await inviteMember(owner, { email });
      const token = tokenFor(email);

      const wrong = await newUser("wrong");
      const view = await inspectInvitation(token, { userId: wrong.userId, email: wrong.email });
      expect(view).toMatchObject({ status: "pending", emailMismatch: true });
      expect(JSON.stringify(view)).not.toContain(email);

      const result = await acceptInvitation({ userId: wrong.userId }, token);
      expect(result).toMatchObject({ ok: false, error: "email_mismatch" });
      expect(JSON.stringify(result)).not.toContain(email);
    });

    it("tells an existing member they are already in", async () => {
      const owner = await studioOwner("AcceptExisting");
      const member = await addWorkspaceMember(owner, "AcceptExistingM");
      const email = uniqueEmail("stranger");
      await inviteMember(owner, { email });
      const token = tokenFor(email);

      const existing = await newUser("existing", email);
      await db.insert(workspaceMemberships).values({
        workspaceId: owner.workspaceId,
        userId: existing.userId,
        role: "member",
        status: "active",
      });
      const view = await inspectInvitation(token, { userId: existing.userId, email });
      expect(view).toMatchObject({ status: "pending", alreadyMember: true });
      expect(member.workspaceId).toBe(owner.workspaceId);
    });

    it("reports expired, unknown, and malformed links without detail", async () => {
      const owner = await studioOwner("AcceptExpired");
      const email = uniqueEmail("old");
      await inviteMember(owner, { email }, new Date(Date.now() - 10 * DAY));
      const token = tokenFor(email);
      const user = await newUser("old", email);

      expect(await inspectInvitation(token, null)).toMatchObject({ status: "expired" });
      expect(await acceptInvitation({ userId: user.userId }, token)).toMatchObject({
        ok: false,
        error: "expired",
      });
      expect(await inspectInvitation("does-not-exist-token-value", null)).toEqual({ status: "invalid" });
      expect(await inspectInvitation("x".repeat(500), null)).toEqual({ status: "invalid" });
      expect(await acceptInvitation({ userId: user.userId }, "")).toMatchObject({
        ok: false,
        error: "invalid",
      });
    });

    it("refuses to join a workspace that filled up after the invitation was sent", async () => {
      const owner = await studioOwner("AcceptFull");
      const email = uniqueEmail("late");
      await inviteMember(owner, { email });
      const token = tokenFor(email);
      // Studio allows 3 seats: owner + pending invitation + one more member fills it.
      await addWorkspaceMember(owner, "AcceptFullA");
      await addWorkspaceMember(owner, "AcceptFullB");

      const user = await newUser("late", email);
      expect(await acceptInvitation({ userId: user.userId }, token)).toMatchObject({
        ok: false,
        error: "at_capacity",
      });
    });

    it("treats a link for a deleted workspace as invalid", async () => {
      const owner = await studioOwner("AcceptDeletedWs");
      const email = uniqueEmail("gone");
      await inviteMember(owner, { email });
      const token = tokenFor(email);
      const { deleteWorkspace } = await import("@/lib/workspaces/deletion");
      await deleteWorkspace(owner, { workspaceId: owner.workspaceId, confirmName: owner.workspaceName });

      expect(await inspectInvitation(token, null)).toEqual({ status: "invalid" });
    });
  });

  it("never writes invitation links into history or notifications", async () => {
    const owner = await studioOwner("InviteSafe");
    const email = uniqueEmail("safe");
    const sent = await inviteMember(owner, { email });
    if (!sent.ok) throw new Error("invite failed");
    const token = tokenFor(email);
    await resendInvitation(owner, { invitationId: sent.invitation.id }, new Date(Date.now() + 2 * MINUTE));
    const newest = tokenFor(email);
    const user = await newUser("safe", email);
    await acceptInvitation({ userId: user.userId }, newest);

    const events = await db
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.workspaceId, owner.workspaceId));
    const inbox = await db
      .select()
      .from(notifications)
      .where(eq(notifications.workspaceId, owner.workspaceId));
    const dump = JSON.stringify([events, inbox]);
    expect(events.length).toBeGreaterThan(0);
    expect(dump).not.toContain(token);
    expect(dump).not.toContain(newest);
    expect(dump).not.toContain("/invite/");
    expect(dump).not.toContain(hashToken(newest));
  });
});
