import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { accounts, issueComments, users, workspaceMemberships, workspaces } from "@/db/schema";
import { clearAuthRateLimit } from "@/lib/auth/rate-limit";
import { createCredentialsUser, getUserAuthState } from "@/lib/auth/users";
import {
  confirmIdentity,
  deleteAccount,
  getAccountOverview,
  listAccountDeletionBlockers,
  listSoleOwnedWorkspaces,
  updateProfile,
} from "@/lib/account/service";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedReviewWithIssue,
} from "@/test/workspace-fixtures";

const PASSWORD = "long-enough-password";

describe("account settings", () => {
  it("updates the name and reports field problems plainly", async () => {
    const owner = await createOwnerContext("Profile");
    expect(await updateProfile(owner.userId, { firstName: "", lastName: "Lee" })).toMatchObject({
      ok: false,
      error: "validation",
    });
    const saved = await updateProfile(owner.userId, { firstName: " Robin ", lastName: " Lee " });
    expect(saved).toMatchObject({ ok: true, name: "Robin Lee" });
    const overview = await getAccountOverview(owner.userId);
    expect(overview).toMatchObject({ firstName: "Robin", lastName: "Lee", hasPassword: true });
    expect((await getUserAuthState(owner.userId))?.name).toBe("Robin Lee");
  });

  it("asks for the password, and counts wrong tries", async () => {
    const owner = await createOwnerContext("Reauth");
    expect(await confirmIdentity(owner.userId, { password: "wrong-password" })).toMatchObject({
      ok: false,
      error: "wrong_password",
    });
    expect(await confirmIdentity(owner.userId, {})).toMatchObject({ ok: false, error: "wrong_password" });
    expect(await confirmIdentity(owner.userId, { password: PASSWORD })).toEqual({ ok: true });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await confirmIdentity(owner.userId, { password: "still-wrong" });
    }
    expect(await confirmIdentity(owner.userId, { password: PASSWORD })).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
    await clearAuthRateLimit("account_reauth", [owner.userId]);
  });

  it("asks accounts without a password to type their email", async () => {
    const owner = await createOwnerContext("ReauthOauth");
    await db.update(users).set({ passwordHash: null }).where(eq(users.id, owner.userId));
    expect(await confirmIdentity(owner.userId, { confirmEmail: "someone@else.com" })).toMatchObject({
      ok: false,
      error: "wrong_email",
    });
    expect(
      await confirmIdentity(owner.userId, { confirmEmail: ` ${owner.userEmail!.toUpperCase()} ` }),
    ).toEqual({ ok: true });
    await clearAuthRateLimit("account_reauth", [owner.userId]);
  });
});

describe("account deletion", () => {
  it("is blocked while you own a workspace that has other people", async () => {
    const owner = await createOwnerContext("AcctBlocked");
    await addWorkspaceMember(owner, "AcctBlockedM");
    const blockers = await listAccountDeletionBlockers(owner.userId);
    expect(blockers).toEqual([
      { workspaceId: owner.workspaceId, workspaceName: owner.workspaceName, otherMembers: 1 },
    ]);
    expect(await listSoleOwnedWorkspaces(owner.userId)).toEqual([]);

    const result = await deleteAccount(owner.userId, { password: PASSWORD });
    expect(result).toMatchObject({ ok: false, error: "blocked" });
    const [row] = await db.select().from(users).where(eq(users.id, owner.userId));
    expect(row.deletedAt).toBeNull();
    expect(row.email).toBe(owner.userEmail);
  });

  it("needs the right password and changes nothing otherwise", async () => {
    const owner = await createOwnerContext("AcctWrong");
    const result = await deleteAccount(owner.userId, { password: "nope-nope-nope" });
    expect(result).toMatchObject({ ok: false, error: "wrong_password" });
    const [row] = await db.select().from(users).where(eq(users.id, owner.userId));
    expect(row.deletedAt).toBeNull();
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(workspace.deletedAt).toBeNull();
    await clearAuthRateLimit("account_reauth", [owner.userId]);
  });

  it("closes a workspace you own alone and anonymizes the account", async () => {
    const owner = await createOwnerContext("AcctSole");
    expect(await listSoleOwnedWorkspaces(owner.userId)).toHaveLength(1);
    const email = owner.userEmail!;

    const result = await deleteAccount(owner.userId, { password: PASSWORD });
    expect(result).toEqual({ ok: true, workspacesDeleted: 1 });

    const [row] = await db.select().from(users).where(eq(users.id, owner.userId));
    expect(row).toMatchObject({ name: "Former member", passwordHash: null });
    expect(row.deletedAt).not.toBeNull();
    expect(row.email).not.toBe(email);
    expect(row.email.endsWith("@deleted.passoff.invalid")).toBe(true);

    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(workspace.deletedAt).not.toBeNull();
    expect(await getUserAuthState(owner.userId)).toBeNull();

    // The email can be used to sign up again.
    const again = await createCredentialsUser({
      firstName: "Back",
      lastName: "Again",
      email,
      password: PASSWORD,
    });
    expect(again.ok).toBe(true);
  });

  it("leaves other workspaces but keeps what you wrote there", async () => {
    const seeded = await seedReviewWithIssue("AcctMember");
    const owner = seeded.context;
    const member = await addWorkspaceMember(owner, "AcctMemberM");
    await db.insert(issueComments).values({
      workspaceId: owner.workspaceId,
      issueId: seeded.issueId,
      body: "Left before I go.",
      authorDisplayName: "Member AcctMemberM",
      authorUserId: member.userId,
    });
    await db.insert(accounts).values({
      userId: member.userId,
      type: "oauth",
      provider: "github",
      providerAccountId: `gh-${member.userId}`,
    });

    expect(await deleteAccount(member.userId, { password: PASSWORD })).toMatchObject({
      ok: true,
      workspacesDeleted: 0,
    });

    const memberships = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, owner.workspaceId),
          eq(workspaceMemberships.userId, member.userId),
        ),
      );
    expect(memberships).toHaveLength(0);
    expect(await db.select().from(accounts).where(eq(accounts.userId, member.userId))).toHaveLength(0);
    const comments = await db
      .select()
      .from(issueComments)
      .where(eq(issueComments.issueId, seeded.issueId));
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe("Left before I go.");

    // The workspace they left is untouched.
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(workspace.deletedAt).toBeNull();
  });
});
