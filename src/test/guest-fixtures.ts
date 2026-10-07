import { eq } from "drizzle-orm";

import { db } from "@/db";
import { projectEnvironments, reviews } from "@/db/schema";
import { clearInstallationRateLimit } from "@/lib/installations/rate-limit";
import {
  createSdkExchangeCode,
  createShareLink,
  upsertGuestIdentity,
} from "@/lib/reviews/share-links";
import { exchangeSdkSession, resolveSdkSession } from "@/lib/sdk/session";
import type { WorkspaceContext } from "@/lib/workspaces/context";

/** Database-backed fixture: a guest on a shared review. Only import from TEST_DATABASE_URL tests. */
export async function seedGuestSession(
  seeded: { context: WorkspaceContext; projectId: string; reviewId: string },
  options: { canComment?: boolean } = {},
) {
  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
      baseUrl: projectEnvironments.baseUrl,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, seeded.reviewId));
  const origin = new URL(installation.baseUrl).origin;

  const share = await createShareLink(seeded.context, {
    projectId: seeded.projectId,
    reviewId: seeded.reviewId,
    canComment: options.canComment ?? true,
  });
  if (!share.ok) throw new Error("share failed");
  const guest = await upsertGuestIdentity({
    workspaceId: seeded.context.workspaceId,
    name: "Guest Reviewer",
    email: `guest.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`,
  });
  const exchange = await createSdkExchangeCode({
    workspaceId: seeded.context.workspaceId,
    reviewId: seeded.reviewId,
    shareLinkId: share.shareLink.id,
    guestIdentityId: guest.id,
    environmentId: installation.id,
    allowedOrigin: origin,
  });
  const exchanged = await exchangeSdkSession({
    installationKey: installation.publicKey,
    exchangeCode: exchange.rawCode,
    headerOrigin: origin,
    rateLimitSubjects: ["fp"],
  });
  if (!exchanged.ok) throw new Error(`exchange failed: ${exchanged.code}`);
  const resolved = await resolveSdkSession(
    new Request("https://app.example.com/api/sdk/v1/issues", {
      headers: { Origin: origin, Authorization: `Bearer ${exchanged.sessionToken}` },
    }),
  );
  if (!resolved.ok) throw new Error("resolve failed");
  return { session: resolved.session, guest };
}

export async function clearGuestRateLimit(session: { sessionId: string; guestIdentityId: string }) {
  await clearInstallationRateLimit("sdk_comment_write", [
    session.sessionId,
    session.guestIdentityId,
  ]);
}
