import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  approvalRequests,
  approvals,
  deployments,
  projectEnvironments,
  reviews,
} from "@/db/schema";
import {
  getReviewApprovalStatus,
  requestApproval,
} from "@/lib/approvals/requests";
import { decideApproval, decideGuestApproval } from "@/lib/approvals/service";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";
import { recordManualDeployment } from "@/lib/environments/service";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import { addWorkspaceMember, seedReviewWithIssue } from "@/test/workspace-fixtures";

type Seeded = Awaited<ReturnType<typeof seedReviewWithIssue>>;

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function installationFor(seeded: Seeded) {
  const [row] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, seeded.reviewId));
  return { ...row, origin: row.allowedOrigins[0] };
}

async function guestSession(seeded: Seeded, options: { canApprove: boolean }) {
  const installation = await installationFor(seeded);
  const share = await createShareLink(seeded.context, {
    projectId: seeded.projectId,
    reviewId: seeded.reviewId,
    canApprove: options.canApprove,
  });
  if (!share.ok) throw new Error(`share link failed: ${share.error} ${share.message ?? ""}`);
  const guest = await upsertGuestIdentity({
    workspaceId: seeded.context.workspaceId,
    name: "Pat Client",
    email: uniqueEmail("guest"),
  });
  const exchange = await createSdkExchangeCode({
    workspaceId: seeded.context.workspaceId,
    reviewId: seeded.reviewId,
    shareLinkId: share.shareLink.id,
    guestIdentityId: guest.id,
    environmentId: installation.id,
    allowedOrigin: installation.origin,
  });
  const exchanged = await exchangeSdkSession({
    installationKey: installation.publicKey,
    exchangeCode: exchange.rawCode,
    headerOrigin: installation.origin,
    rateLimitSubjects: [`approvals-${Date.now()}`],
  });
  if (!exchanged.ok) throw new Error(`exchange failed: ${exchanged.code}`);
  const resolved = await resolveSdkSession(
    new Request("https://app.example.com/api/sdk/v1/approvals/decide", {
      headers: {
        Origin: installation.origin,
        Authorization: `Bearer ${exchanged.sessionToken}`,
      },
    }),
  );
  if (!resolved.ok) throw new Error("session failed");
  await clearInstallationRateLimit("sdk_session_exchange", [installation.publicKey]);
  return { session: resolved.session, shareLinkId: share.shareLink.id };
}

async function askForApproval(
  seeded: Seeded,
  extra: { shareLinkId?: string | null } = {},
) {
  const requested = await requestApproval(seeded.context, {
    projectId: seeded.projectId,
    reviewId: seeded.reviewId,
    message: "Ready for a look",
    shareLinkId: extra.shareLinkId ?? null,
    acknowledgeUnresolved: true,
  });
  if (!requested.ok) throw new Error(`request failed: ${requested.message}`);
  return requested.requestId;
}

describe("deployment-specific approval decisions", () => {
  it(
    "lets a member approve the current version and completes the request",
    { timeout: 60_000 },
    async () => {
      const seeded = await seedReviewWithIssue("decide-member");
      const member = await addWorkspaceMember(seeded.context, "decider");
      const requestId = await askForApproval(seeded);

      const decided = await decideApproval(member, {
        reviewId: seeded.reviewId,
        decision: "approved",
        note: "Looks good",
        requestId,
      });
      expect(decided.ok).toBe(true);
      if (!decided.ok) return;

      const [request] = await db
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, requestId));
      expect(request.state).toBe("approved");
      expect(request.decisionApprovalId).toBe(decided.approvalId);
      expect(request.completedAt).not.toBeNull();

      const [approval] = await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, decided.approvalId));
      expect(approval.deploymentId).toBe(request.deploymentId);
      expect(approval.workspaceId).toBe(seeded.context.workspaceId);
      expect(approval.projectId).toBe(seeded.projectId);
      expect(approval.reviewerUserId).toBe(member.userId);

      const status = await getReviewApprovalStatus(
        seeded.context.workspaceId,
        seeded.reviewId,
      );
      expect(status?.visibleState).toBe("approved");
      expect(status?.activeRequest).toBeNull();
    },
  );

  it("requires a note to request changes and records the change request", { timeout: 60_000 }, async () => {
    const seeded = await seedReviewWithIssue("decide-changes");
    const requestId = await askForApproval(seeded);

    const missingNote = await decideApproval(seeded.context, {
      reviewId: seeded.reviewId,
      decision: "changes_requested",
      requestId,
    });
    expect(missingNote.ok).toBe(false);
    if (!missingNote.ok) expect(missingNote.error).toBe("validation");

    const decided = await decideApproval(seeded.context, {
      reviewId: seeded.reviewId,
      decision: "changes_requested",
      note: "The footer overlaps the button",
      requestId,
    });
    expect(decided.ok).toBe(true);
    const [request] = await db
      .select({ state: approvalRequests.state })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(request.state).toBe("changes_requested");
  });

  it("rejects a decision made on an older version and keeps the approval historical", { timeout: 60_000 }, async () => {
    const seeded = await seedReviewWithIssue("decide-newer");
    const requestId = await askForApproval(seeded);
    const [review] = await db
      .select({
        deploymentId: reviews.deploymentId,
        environmentId: reviews.environmentId,
      })
      .from(reviews)
      .where(eq(reviews.id, seeded.reviewId));

    const approved = await decideApproval(seeded.context, {
      reviewId: seeded.reviewId,
      decision: "approved",
      requestId,
    });
    expect(approved.ok).toBe(true);

    // The site now runs a newer version.
    const recorded = await recordManualDeployment(seeded.context, {
      environmentId: review.environmentId,
      identifier: `release-${Date.now()}`,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    await db
      .update(reviews)
      .set({ deploymentId: recorded.deploymentId })
      .where(eq(reviews.id, seeded.reviewId));

    const stale = await decideApproval(seeded.context, {
      reviewId: seeded.reviewId,
      decision: "approved",
      deploymentId: review.deploymentId,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toBe("stale_version");

    const status = await getReviewApprovalStatus(
      seeded.context.workspaceId,
      seeded.reviewId,
    );
    expect(status?.visibleState).toBe("historical_approval");
    expect(status?.history.find((row) => row.state === "approved")?.historical).toBe(true);
    expect(status?.currentDeploymentId).toBe(recorded.deploymentId);

    // Only the older version carries the approval.
    const [{ id: currentId }] = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(eq(deployments.id, recorded.deploymentId));
    const onNewVersion = await db
      .select({ id: approvals.id })
      .from(approvals)
      .where(
        and(eq(approvals.reviewId, seeded.reviewId), eq(approvals.deploymentId, currentId)),
      );
    expect(onNewVersion).toHaveLength(0);
  });

  it("does not decide on an archived review", { timeout: 60_000 }, async () => {
    const seeded = await seedReviewWithIssue("decide-archived");
    const requestId = await askForApproval(seeded);
    await db
      .update(reviews)
      .set({ archivedAt: new Date() })
      .where(eq(reviews.id, seeded.reviewId));

    const decided = await decideApproval(seeded.context, {
      reviewId: seeded.reviewId,
      decision: "approved",
      requestId,
    });
    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.error).toBe("validation");
  });

  it("denies a guest whose link cannot approve", { timeout: 60_000 }, async () => {
    const seeded = await seedReviewWithIssue("guest-no-approve");
    await askForApproval(seeded);
    const { session } = await guestSession(seeded, { canApprove: false });
    expect(session.canApprove).toBe(false);

    const decided = await decideGuestApproval(session, { decision: "approved" });
    expect(decided.ok).toBe(false);
    if (!decided.ok) expect(decided.error).toBe("forbidden");

    const [row] = await db
      .select({ state: approvalRequests.state })
      .from(approvalRequests)
      .where(eq(approvalRequests.reviewId, seeded.reviewId));
    expect(row.state).toBe("awaiting_decision");
  });

  it("lets a guest with an approval link decide on the waiting request", { timeout: 60_000 }, async () => {
    const seeded = await seedReviewWithIssue("guest-approve");
    const { session, shareLinkId } = await guestSession(seeded, { canApprove: true });
    const requestId = await askForApproval(seeded, { shareLinkId });

    const decided = await decideGuestApproval(session, {
      decision: "approved",
      note: "Ship it",
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;

    const [approval] = await db
      .select()
      .from(approvals)
      .where(eq(approvals.id, decided.approvalId));
    expect(approval.reviewerGuestId).toBe(session.guestIdentityId);
    expect(approval.reviewerUserId).toBeNull();
    const [request] = await db
      .select({ state: approvalRequests.state, decisionApprovalId: approvalRequests.decisionApprovalId })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId));
    expect(request.state).toBe("approved");
    expect(request.decisionApprovalId).toBe(approval.id);
  });

  it("never lets a guest decide on another review", { timeout: 90_000 }, async () => {
    const mine = await seedReviewWithIssue("guest-mine");
    const other = await seedReviewWithIssue("guest-other");
    const otherRequestId = await askForApproval(other);
    const { session } = await guestSession(mine, { canApprove: true });

    // A decision is always scoped to the session’s own review. Nothing is waiting there.
    const decided = await decideGuestApproval(session, {
      decision: "approved",
      requestId: otherRequestId,
    });
    expect(decided.ok).toBe(false);

    const [untouched] = await db
      .select({ state: approvalRequests.state })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, otherRequestId));
    expect(untouched.state).toBe("awaiting_decision");
    const stray = await db
      .select({ id: approvals.id })
      .from(approvals)
      .where(eq(approvals.reviewId, other.reviewId));
    expect(stray).toHaveLength(0);
  });
});
