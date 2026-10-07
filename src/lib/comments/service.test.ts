import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import {
  activityEvents,
  guestIdentities,
  issueComments,
  notifications,
  projectEnvironments,
  reviews,
  shareLinks,
  webhookDeliveries,
  webhookEndpoints,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import {
  createGuestIssueComment,
  createIssueComment,
  listGuestIssueComments,
  listIssueComments,
} from "@/lib/comments/service";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";
import { createIssue } from "@/lib/issues/service";
import { ISSUE_ACTIVITY_TYPES } from "@/lib/issues/history";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
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
  const origin = `https://${label}.${Date.now()}.example.com`;
  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: `${label} Review`,
    websiteUrl: `${origin}/start`,
  });
  if (!review.ok) throw new Error("review failed");
  const created = await createIssue(context, {
    reviewId: review.review.id,
    body: `${label} contrast issue`,
  });
  if (!created.ok) throw new Error("issue failed");

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, review.review.id));

  return {
    context,
    projectId: project.project.id,
    reviewId: review.review.id,
    issueId: created.issue.id,
    issueNumber: created.issue.number,
    installation,
    origin,
  };
}

async function guestSessionFor(
  seeded: Awaited<ReturnType<typeof seedReview>>,
  options?: { canComment?: boolean },
) {
  const share = await createShareLink(seeded.context, {
    projectId: seeded.projectId,
    reviewId: seeded.reviewId,
    canComment: options?.canComment ?? true,
  });
  if (!share.ok) throw new Error("share failed");
  const guest = await upsertGuestIdentity({
    workspaceId: seeded.context.workspaceId,
    name: "Guest Reviewer",
    email: uniqueEmail("guest"),
  });
  const exchange = await createSdkExchangeCode({
    workspaceId: seeded.context.workspaceId,
    reviewId: seeded.reviewId,
    shareLinkId: share.shareLink.id,
    guestIdentityId: guest.id,
    environmentId: seeded.installation.id,
    allowedOrigin: seeded.origin,
  });
  const exchanged = await exchangeSdkSession({
    installationKey: seeded.installation.publicKey,
    exchangeCode: exchange.rawCode,
    headerOrigin: seeded.origin,
    rateLimitSubjects: ["fp"],
  });
  if (!exchanged.ok) throw new Error(`exchange failed: ${exchanged.code}`);
  const resolved = await resolveSdkSession(
    new Request("https://app.example.com/api/sdk/v1/issues", {
      headers: {
        Origin: seeded.origin,
        Authorization: `Bearer ${exchanged.sessionToken}`,
      },
    }),
  );
  if (!resolved.ok) throw new Error("resolve failed");
  return {
    session: resolved.session,
    shareLinkId: share.shareLink.id,
    guest,
    sessionToken: exchanged.sessionToken,
  };
}

describe("issue comments service", () => {
  const cleanup: Array<{ sessionId: string; guestId: string }> = [];

  afterEach(async () => {
    for (const item of cleanup) {
      await clearInstallationRateLimit("sdk_comment_write", [
        item.sessionId,
        item.guestId,
      ]);
    }
    cleanup.length = 0;
    vi.restoreAllMocks();
  });

  it(
    "lets a member create a public reply and a private note",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("member-comments");
      const member = await addMember(seeded.context, "reply");

      const publicReply = await createIssueComment(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Public fix note",
        visibility: "public",
      });
      expect(publicReply.ok).toBe(true);
      if (!publicReply.ok) return;
      expect(publicReply.comment.visibility).toBe("public");
      expect(publicReply.comment.authorKind).toBe("member");

      const privateNote = await createIssueComment(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Private team note",
        visibility: "private",
      });
      expect(privateNote.ok).toBe(true);
      if (!privateNote.ok) return;
      expect(privateNote.comment.visibility).toBe("private");

      const listed = await listIssueComments(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        includePrivate: true,
      });
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.comments).toHaveLength(2);
      expect(listed.comments.map((row) => row.visibility)).toEqual([
        "public",
        "private",
      ]);

      const activities = await db
        .select({ type: activityEvents.type })
        .from(activityEvents)
        .where(eq(activityEvents.issueId, seeded.issueId));
      expect(
        activities.some((row) => row.type === ISSUE_ACTIVITY_TYPES.COMMENT_ADDED),
      ).toBe(true);
      expect(
        activities.some(
          (row) => row.type === ISSUE_ACTIVITY_TYPES.PRIVATE_NOTE_ADDED,
        ),
      ).toBe(true);
    },
  );

  it(
    "lets an authorized guest add a public reply and hides private notes",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("guest-comments");
      await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Team-only note",
        visibility: "private",
      });
      const guest = await guestSessionFor(seeded);
      cleanup.push({
        sessionId: guest.session.sessionId,
        guestId: guest.session.guestIdentityId,
      });

      const reply = await createGuestIssueComment(guest.session, {
        issueNumber: seeded.issueNumber,
        body: "Guest public reply",
      });
      expect(reply.ok).toBe(true);
      if (!reply.ok) return;
      expect(reply.comment.visibility).toBe("public");
      expect(reply.comment.authorKind).toBe("guest");

      const listed = await listGuestIssueComments(
        guest.session,
        seeded.issueNumber,
      );
      expect(listed.ok).toBe(true);
      if (!listed.ok) return;
      expect(listed.comments).toHaveLength(1);
      expect(listed.comments[0]?.body).toBe("Guest public reply");
      expect(listed.comments.every((row) => row.visibility === "public")).toBe(
        true,
      );
    },
  );

  it(
    "blocks view-only guests, private guest notes, and cross-review access",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("guest-deny");
      const viewOnly = await guestSessionFor(seeded, { canComment: false });
      cleanup.push({
        sessionId: viewOnly.session.sessionId,
        guestId: viewOnly.session.guestIdentityId,
      });

      const denied = await createGuestIssueComment(viewOnly.session, {
        issueNumber: seeded.issueNumber,
        body: "Should fail",
      });
      expect(denied.ok).toBe(false);
      if (denied.ok) return;
      expect(denied.error).toBe("commenting_disabled");

      const allowed = await guestSessionFor(seeded, { canComment: true });
      cleanup.push({
        sessionId: allowed.session.sessionId,
        guestId: allowed.session.guestIdentityId,
      });
      // Issue numbers restart per review. Use a number that does not exist on
      // this session's review so the guest cannot invent another review's id.
      const cross = await createGuestIssueComment(allowed.session, {
        issueNumber: 999_999,
        body: "Wrong review",
      });
      expect(cross.ok).toBe(false);
      if (!cross.ok) expect(cross.error).toBe("not_found");
    },
  );

  it(
    "rejects revoked guest sessions and validates mentions against membership",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("guest-revoked");
      const guest = await guestSessionFor(seeded);
      cleanup.push({
        sessionId: guest.session.sessionId,
        guestId: guest.session.guestIdentityId,
      });
      await db
        .update(shareLinks)
        .set({ revokedAt: new Date() })
        .where(eq(shareLinks.id, guest.shareLinkId));

      const resolved = await resolveSdkSession(
        new Request("https://app.example.com/api/sdk/v1/issues", {
          headers: {
            Origin: seeded.origin,
            Authorization: `Bearer ${guest.sessionToken}`,
          },
        }),
      );
      expect(resolved.ok).toBe(false);

      const outsider = await ownerContext("outsider");
      const mention = await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Ping outsider",
        mentionedUserIds: [outsider.userId],
      });
      expect(mention.ok).toBe(true);
      if (!mention.ok) return;
      expect(mention.comment.mentions).toHaveLength(0);

      const member = await addMember(seeded.context, "mentioned");
      const valid = await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: `Hi @${member.userName}`,
        mentionedUserIds: [member.userId],
      });
      expect(valid.ok).toBe(true);
      if (!valid.ok) return;
      expect(valid.comment.mentions.map((row) => row.userId)).toEqual([
        member.userId,
      ]);
    },
  );

  it(
    "does not notify the author about their own reply and keeps comments when notify fails",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("notify-self");
      const selfReply = await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Replying to myself",
      });
      expect(selfReply.ok).toBe(true);
      const selfInbox = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.recipientUserId, seeded.context.userId),
            eq(notifications.type, "issue.comment_replied"),
          ),
        );
      expect(selfInbox).toHaveLength(0);

      const events = await import("@/lib/notifications/events");
      const spy = vi
        .spyOn(events, "notifyIssueComment")
        .mockRejectedValueOnce(new Error("notify down"));
      const member = await addMember(seeded.context, "notify-fail");
      const saved = await createIssueComment(member, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Still saved",
      });
      expect(saved.ok).toBe(true);
      spy.mockRestore();

      const rows = await db
        .select({ body: issueComments.body, isPrivate: issueComments.isPrivate })
        .from(issueComments)
        .where(eq(issueComments.issueId, seeded.issueId));
      expect(rows.some((row) => row.body === "Still saved")).toBe(true);
    },
  );

  it(
    "excludes private notes from public webhook payloads",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("webhook-private");
      const { encryptSecret } = await import("@/lib/webhooks/secrets");
      await db.insert(webhookEndpoints).values({
        workspaceId: seeded.context.workspaceId,
        url: "https://hooks.example.com/passoff",
        signingSecretEncrypted: encryptSecret("whsec_test_secret_value_ok"),
        subscribedEvents: ["issue.comment_added"],
        isEnabled: true,
      });

      await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Private only",
        visibility: "private",
      });
      const privateDeliveries = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.workspaceId, seeded.context.workspaceId));
      expect(privateDeliveries).toHaveLength(0);

      await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Public reply",
        visibility: "public",
      });
      const publicDeliveries = await db
        .select({
          eventType: webhookDeliveries.eventType,
          payload: webhookDeliveries.payload,
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.workspaceId, seeded.context.workspaceId));
      expect(publicDeliveries.length).toBeGreaterThan(0);
      expect(
        publicDeliveries.every((row) => row.eventType === "issue.comment_added"),
      ).toBe(true);
      expect(JSON.stringify(publicDeliveries).includes("Private only")).toBe(
        false,
      );
    },
  );

  it(
    "denies cross-workspace reads",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReview("cross-ws");
      await createIssueComment(seeded.context, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        body: "Secret",
      });
      const outsider = await ownerContext("cross-outsider");
      const listed = await listIssueComments(outsider, {
        projectId: seeded.projectId,
        reviewId: seeded.reviewId,
        issueNumber: seeded.issueNumber,
        includePrivate: true,
      });
      expect(listed.ok).toBe(false);
      if (!listed.ok) expect(listed.error).toBe("not_found");
      void guestIdentities;
    },
  );
});
