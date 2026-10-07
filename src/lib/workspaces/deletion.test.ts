import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  assets,
  issues,
  shareLinks,
  videoAssets,
  webhookDeliveries,
  webhookEndpoints,
  workspaceInvitations,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { getActiveMembership, listUserWorkspaces } from "@/lib/auth/membership";
import { getTestEmailTransport } from "@/lib/email/test-transport";
import { createShareLink } from "@/lib/reviews/share-links";
import { deleteWorkspace, purgeDeletedWorkspaces } from "@/lib/workspaces/deletion";
import { inviteMember } from "@/lib/workspaces/invitations";
import {
  addWorkspaceMember,
  createOwnerContext,
  seedReviewWithIssue,
  seedVideoEvidence,
  seedWorkspacePlan,
} from "@/test/workspace-fixtures";

const DAY = 24 * 60 * 60 * 1000;

describe("workspace deletion", () => {
  beforeEach(() => getTestEmailTransport().clear());

  it("is owner-only and needs the exact name and the right workspace", async () => {
    const owner = await createOwnerContext("DeleteGate");
    const member = await addWorkspaceMember(owner, "DeleteGateM");

    expect(
      await deleteWorkspace(member, { workspaceId: owner.workspaceId, confirmName: owner.workspaceName }),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      await deleteWorkspace(
        { ...member, role: "owner" },
        { workspaceId: owner.workspaceId, confirmName: owner.workspaceName },
      ),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      await deleteWorkspace(owner, { workspaceId: owner.workspaceId, confirmName: "something else" }),
    ).toMatchObject({ ok: false, error: "confirm_mismatch" });
    expect(
      await deleteWorkspace(owner, {
        workspaceId: "00000000-0000-4000-8000-000000000000",
        confirmName: owner.workspaceName,
      }),
    ).toMatchObject({ ok: false, error: "stale" });

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(row.deletedAt).toBeNull();
  });

  it("revokes access, invitations, guest links, webhooks, and schedules cleanup", async () => {
    const seeded = await seedReviewWithIssue("DeleteAll");
    const owner = seeded.context;
    await seedWorkspacePlan(owner.workspaceId, "studio");
    const member = await addWorkspaceMember(owner, "DeleteAllM");
    const invited = await inviteMember(owner, { email: `pending.${Date.now()}@example.com` });
    expect(invited).toMatchObject({ ok: true });
    const link = await createShareLink(owner, {
      projectId: seeded.projectId,
      reviewId: seeded.reviewId,
    });
    expect(link).toMatchObject({ ok: true });
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        workspaceId: owner.workspaceId,
        url: "https://hooks.example.com/passoff",
        signingSecretEncrypted: "not-a-real-secret",
        subscribedEvents: ["issue.created"],
        isEnabled: true,
      })
      .returning({ id: webhookEndpoints.id });
    expect(endpoint.id).toBeTruthy();

    const now = new Date();
    const result = await deleteWorkspace(
      owner,
      { workspaceId: owner.workspaceId, confirmName: ` ${owner.workspaceName} ` },
      now,
    );
    expect(result).toMatchObject({ ok: true, alreadyDeleted: false });
    if (!result.ok) return;
    expect(result.purgeAfter.getTime()).toBeGreaterThan(now.getTime() + 29 * DAY);

    const [row] = await db.select().from(workspaces).where(eq(workspaces.id, owner.workspaceId));
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedByUserId).toBe(owner.userId);

    // Nobody can get in any more.
    expect(await getActiveMembership(owner.userId, owner.workspaceId)).toBeNull();
    expect(await getActiveMembership(member.userId, owner.workspaceId)).toBeNull();
    expect(await listUserWorkspaces(member.userId)).toHaveLength(0);

    const invitations = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, owner.workspaceId));
    expect(invitations.every((invitation) => invitation.revokedAt !== null)).toBe(true);

    const links = await db.select().from(shareLinks).where(eq(shareLinks.workspaceId, owner.workspaceId));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((entry) => entry.revokedAt !== null)).toBe(true);

    const endpoints = await db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.workspaceId, owner.workspaceId));
    expect(endpoints.every((entry) => entry.isEnabled === false)).toBe(true);
    expect(
      await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.workspaceId, owner.workspaceId)),
    ).toBeDefined();

    // The data is still there until the cleanup date.
    expect(
      await db.select({ id: issues.id }).from(issues).where(eq(issues.id, seeded.issueId)),
    ).toHaveLength(1);
  });

  it("is safe to repeat, and a repeat does not move the cleanup date", async () => {
    const owner = await createOwnerContext("DeleteTwice");
    const first = await deleteWorkspace(owner, {
      workspaceId: owner.workspaceId,
      confirmName: owner.workspaceName,
    });
    const second = await deleteWorkspace(owner, {
      workspaceId: owner.workspaceId,
      confirmName: owner.workspaceName,
    });
    expect(first).toMatchObject({ ok: true, alreadyDeleted: false });
    expect(second).toMatchObject({ ok: true, alreadyDeleted: true });
    if (first.ok && second.ok) {
      expect(second.purgeAfter.getTime()).toBe(first.purgeAfter.getTime());
    }
  });

  describe("cleanup", () => {
    it("leaves workspaces alone until their date, then erases everything, including evidence", async () => {
      const seeded = await seedReviewWithIssue("PurgeAll");
      const owner = seeded.context;
      const other = await createOwnerContext("PurgeOther");

      const created = await deleteWorkspace(owner, {
        workspaceId: owner.workspaceId,
        confirmName: owner.workspaceName,
      });
      expect(created).toMatchObject({ ok: true });

      // Not due yet.
      await purgeDeletedWorkspaces({ now: new Date(), limit: 50 });
      expect(
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId)),
      ).toHaveLength(1);

      // Due now.
      await db
        .update(workspaces)
        .set({ purgeAfter: new Date(Date.now() - 1000) })
        .where(eq(workspaces.id, owner.workspaceId));
      const summary = await purgeDeletedWorkspaces({ limit: 50 });
      expect(summary.failed).toBe(0);
      expect(summary.purged).toBeGreaterThanOrEqual(1);
      expect(
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId)),
      ).toHaveLength(0);
      expect(
        await db.select({ id: issues.id }).from(issues).where(eq(issues.id, seeded.issueId)),
      ).toHaveLength(0);
      expect(
        await db
          .select({ id: workspaceMemberships.id })
          .from(workspaceMemberships)
          .where(eq(workspaceMemberships.workspaceId, owner.workspaceId)),
      ).toHaveLength(0);

      // Another workspace is untouched.
      expect(
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, other.workspaceId)),
      ).toHaveLength(1);
    });

    it("waits while a stored video copy has not been confirmed gone, then erases it", async () => {
      const seeded = await seedReviewWithIssue("PurgeVideo");
      const owner = seeded.context;
      const video = await seedVideoEvidence({
        workspaceId: owner.workspaceId,
        reviewId: seeded.reviewId,
        issueId: seeded.issueId,
        status: "ready",
        uploadedByUserId: owner.userId,
      });

      await deleteWorkspace(owner, {
        workspaceId: owner.workspaceId,
        confirmName: owner.workspaceName,
      });
      await db
        .update(workspaces)
        .set({ purgeAfter: new Date(Date.now() - 1000) })
        .where(eq(workspaces.id, owner.workspaceId));
      // Pretend the provider has not confirmed deletion yet.
      await db
        .update(videoAssets)
        .set({ providerDeletedAt: null, providerDeleteRequestedAt: new Date() })
        .where(eq(videoAssets.id, video.videoAssetId));

      const waiting = await purgeDeletedWorkspaces({ limit: 50 });
      expect(waiting.waitingOnStorage).toBeGreaterThanOrEqual(1);
      expect(
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId)),
      ).toHaveLength(1);

      await db
        .update(videoAssets)
        .set({ providerDeletedAt: new Date() })
        .where(eq(videoAssets.id, video.videoAssetId));
      const done = await purgeDeletedWorkspaces({ limit: 50 });
      expect(done.failed).toBe(0);
      expect(
        await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, owner.workspaceId)),
      ).toHaveLength(0);
      expect(
        await db.select({ id: assets.id }).from(assets).where(eq(assets.id, video.originalAssetId)),
      ).toHaveLength(0);
    });
  });
});
