/**
 * API-level public reviewer identity tests (POST /api/public/[token]).
 * Requires DATABASE_URL. Exercises the route handler — not only token utilities.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

function cookieFromResponse(response: Response) {
  const anyHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);
  const pair = setCookies
    .flatMap((row) => String(row).split(/,(?=\s*[^;]+=)/))
    .map((row) => row.trim())
    .find((row) => row.startsWith("passoff_reviewer="));
  if (!pair) return null;
  return pair.split(";")[0];
}

async function setupPublishedShare() {
  const { createPasswordUser } = await import("@/lib/auth/password");
  const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
  const { db } = await import("@/db");
  const { projects, revisionAssets, revisions, assets, workspaces } = await import("@/db/schema");
  const { createOrRotateShareLink } = await import("@/lib/rooms/service");

  const stamp = randomBytes(4).toString("hex");
  const user = await createPasswordUser({
    email: `public-api-${stamp}@example.com`,
    password: "TestPassword123!",
    name: "Public API Owner",
  });
  const tenant = await createPrivateTenantForUser(user.id);
  const workspace = (
    await db.select().from(workspaces).where(eq(workspaces.id, tenant.workspaceId)).limit(1)
  )[0]!;
  const scope = {
    organizationId: workspace.organizationId,
    organizationName: "",
    workspaceId: tenant.workspaceId,
    workspaceName: "",
    userId: user.id,
    userName: user.name || "",
    userEmail: user.email || "",
  };

  const [room] = await db
    .insert(projects)
    .values({
      organizationId: workspace.organizationId,
      workspaceId: tenant.workspaceId,
      name: `Public API ${stamp}`,
      clientName: "Client",
      slug: `public-api-${stamp}`,
      status: "SENT",
    })
    .returning();

  const [revision] = await db
    .insert(revisions)
    .values({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      number: 1,
      status: "PUBLISHED",
      contentDigest: `digest-${stamp}`,
      publishedAt: new Date(),
    })
    .returning();

  await db
    .update(projects)
    .set({ currentPublishedRevisionId: revision.id, status: "SENT" })
    .where(eq(projects.id, room.id));

  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      kind: "image",
      label: "Hero",
      objectKey: `workspaces/${tenant.workspaceId}/rooms/${room.id}/revisions/${revision.id}/hero.png`,
      storageProvider: "local",
      uploadStatus: "ready",
      mime: "image/png",
      bytes: 12,
    })
    .returning();

  const [membership] = await db
    .insert(revisionAssets)
    .values({ revisionId: revision.id, assetId: asset.id, sortOrder: 0 })
    .returning();

  const share = await createOrRotateShareLink(scope, room.id);
  return {
    stamp,
    room,
    revision,
    membership,
    shareToken: share.token,
    workspaceId: tenant.workspaceId,
  };
}

async function postPublic(
  token: string,
  body: Record<string, unknown>,
  cookie?: string | null,
) {
  const { POST } = await import("@/app/api/public/[token]/route");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const response = await POST(
    new Request(`http://localhost/api/public/${encodeURIComponent(token)}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ token }) },
  );
  const json = (await response.json()) as Record<string, unknown>;
  return { response, json, cookie: cookieFromResponse(response) };
}

describe.skipIf(!hasDb)("public reviewer identity API", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("new visitor receives a new reviewer identity; email does not reclaim an author", async () => {
    const ctx = await setupPublishedShare();
    const authorEmail = `author-${ctx.stamp}@example.com`;

    const first = await postPublic(ctx.shareToken, {
      action: "identify",
      name: "Author",
      email: authorEmail,
    });
    expect(first.response.status).toBe(200);
    const authorId = (first.json.reviewer as { id: string }).id;
    expect(authorId).toBeTruthy();
    expect(first.cookie).toMatch(/^passoff_reviewer=/);

    const imposter = await postPublic(ctx.shareToken, {
      action: "identify",
      name: "Author",
      email: authorEmail,
    });
    expect(imposter.response.status).toBe(200);
    const imposterId = (imposter.json.reviewer as { id: string }).id;
    expect(imposterId).not.toBe(authorId);
  });

  it("comment and decision without a session are rejected", async () => {
    const ctx = await setupPublishedShare();
    const comment = await postPublic(ctx.shareToken, {
      action: "comment",
      name: "Ghost",
      email: `ghost-${ctx.stamp}@example.com`,
      revisionAssetId: ctx.membership.id,
      xPercent: 0.2,
      yPercent: 0.3,
      body: "Should fail",
    });
    expect(comment.response.status).toBe(401);

    const decision = await postPublic(ctx.shareToken, {
      action: "decision",
      name: "Ghost",
      email: `ghost-${ctx.stamp}@example.com`,
      decision: "request_changes",
    });
    expect(decision.response.status).toBe(401);
  });

  it("author can edit own comment; other session and email-only identify cannot", async () => {
    const ctx = await setupPublishedShare();
    const authorEmail = `author-edit-${ctx.stamp}@example.com`;

    const identify = await postPublic(ctx.shareToken, {
      action: "identify",
      name: "Author",
      email: authorEmail,
    });
    const authorCookie = identify.cookie!;
    const authorId = (identify.json.reviewer as { id: string }).id;

    const created = await postPublic(
      ctx.shareToken,
      {
        action: "comment",
        revisionAssetId: ctx.membership.id,
        xPercent: 0.4,
        yPercent: 0.35,
        body: "Please refine the CTA.",
      },
      authorCookie,
    );
    expect(created.response.status).toBe(201);
    const commentId = (created.json.comment as { id: string }).id;

    const edited = await postPublic(
      ctx.shareToken,
      { action: "edit_comment", commentId, body: "Updated CTA note." },
      created.cookie || authorCookie,
    );
    expect(edited.response.status).toBe(200);
    expect((edited.json.comment as { body: string }).body).toBe("Updated CTA note.");

    const other = await postPublic(ctx.shareToken, {
      action: "identify",
      name: "Other",
      email: `other-${ctx.stamp}@example.com`,
    });
    const otherEdit = await postPublic(
      ctx.shareToken,
      { action: "edit_comment", commentId, body: "Hijack" },
      other.cookie,
    );
    expect(otherEdit.response.status).toBe(403);

    // Clean session + author's email must not grant edit rights on the author's comment.
    const reclaim = await postPublic(ctx.shareToken, {
      action: "identify",
      name: "Author",
      email: authorEmail,
    });
    expect((reclaim.json.reviewer as { id: string }).id).not.toBe(authorId);
    const reclaimEdit = await postPublic(
      ctx.shareToken,
      { action: "edit_comment", commentId, body: "Email reclaim" },
      reclaim.cookie,
    );
    expect(reclaimEdit.response.status).toBe(403);
  });

  it("forged, expired, cross-project, and cross-share credentials are rejected", async () => {
    const ctx = await setupPublishedShare();
    const other = await setupPublishedShare();
    const {
      createReviewerSessionToken,
      REVIEWER_SESSION_COOKIE,
    } = await import("@/lib/rooms/reviewer-session");
    const { createReviewer } = await import("@/lib/rooms/service");

    const reviewer = await createReviewer({
      workspaceId: ctx.workspaceId,
      projectId: ctx.room.id,
      name: "Cred",
      email: `cred-${ctx.stamp}@example.com`,
    });

    const valid = createReviewerSessionToken({
      reviewerId: reviewer.id,
      projectId: ctx.room.id,
      shareToken: ctx.shareToken,
    });

    const forged = `${valid.slice(0, -4)}zzzz`;
    const forgedRes = await postPublic(
      ctx.shareToken,
      { action: "edit_comment", commentId: "00000000-0000-4000-8000-000000000000", body: "x" },
      `${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(forged)}`,
    );
    expect(forgedRes.response.status).toBe(401);

    const expired = createReviewerSessionToken({
      reviewerId: reviewer.id,
      projectId: ctx.room.id,
      shareToken: ctx.shareToken,
      maxAgeSec: 1,
      nowMs: Date.now() - 60_000,
    });
    const expiredRes = await postPublic(
      ctx.shareToken,
      { action: "comment", revisionAssetId: ctx.membership.id, xPercent: 0.1, yPercent: 0.1, body: "x" },
      `${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(expired)}`,
    );
    expect(expiredRes.response.status).toBe(401);

    const crossProject = createReviewerSessionToken({
      reviewerId: reviewer.id,
      projectId: other.room.id,
      shareToken: ctx.shareToken,
    });
    const crossProjectRes = await postPublic(
      ctx.shareToken,
      { action: "comment", revisionAssetId: ctx.membership.id, xPercent: 0.1, yPercent: 0.1, body: "x" },
      `${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(crossProject)}`,
    );
    expect([401, 403]).toContain(crossProjectRes.response.status);

    const crossShare = createReviewerSessionToken({
      reviewerId: reviewer.id,
      projectId: ctx.room.id,
      shareToken: other.shareToken,
    });
    const crossShareRes = await postPublic(
      ctx.shareToken,
      { action: "comment", revisionAssetId: ctx.membership.id, xPercent: 0.1, yPercent: 0.1, body: "x" },
      `${REVIEWER_SESSION_COOKIE}=${encodeURIComponent(crossShare)}`,
    );
    expect([401, 403]).toContain(crossShareRes.response.status);
  });
});
