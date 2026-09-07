/**
 * Migration readiness + handoff release boundary + comment authz (DB).
 * Skips when DATABASE_URL is unset. Applies pending drizzle-postgres migrations first.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("release hardening (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("tenant isolation still requires first-release schema", async () => {
    const { db } = await import("@/db");
    const { workspaces } = await import("@/db/schema");
    const rows = await db
      .select({ id: workspaces.id, notificationEmail: workspaces.notificationEmail })
      .from(workspaces)
      .limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("handoff release gates visibility and clears on post-release add", async () => {
    const { createPasswordUser } = await import("@/lib/auth/password");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const { db } = await import("@/db");
    const { projects, revisions, workspaces } = await import("@/db/schema");
    const {
      addHandoffItem,
      listReleasedHandoffItems,
      releaseHandoff,
    } = await import("@/lib/rooms/service");

    const stamp = randomBytes(4).toString("hex");
    const user = await createPasswordUser({
      email: `handoff-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "Handoff Owner",
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
        name: `Handoff ${stamp}`,
        clientName: "Client",
        slug: `handoff-${stamp}`,
        status: "APPROVED",
      })
      .returning();

    await db.insert(revisions).values({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      number: 1,
      status: "APPROVED",
      contentDigest: "abc",
      publishedAt: new Date(),
    });

    expect(await listReleasedHandoffItems(room.id)).toEqual([]);

    const first = await addHandoffItem({
      scope,
      projectId: room.id,
      label: "Spec PDF",
      category: "file",
    });
    expect(first.releaseCleared).toBe(false);
    expect(await listReleasedHandoffItems(room.id)).toEqual([]);

    await releaseHandoff(scope, room.id);
    const released = await listReleasedHandoffItems(room.id);
    expect(released).toHaveLength(1);
    expect(released[0]?.label).toBe("Spec PDF");

    const second = await addHandoffItem({
      scope,
      projectId: room.id,
      label: "Extra ZIP",
      category: "file",
    });
    expect(second.releaseCleared).toBe(true);
    expect(await listReleasedHandoffItems(room.id)).toEqual([]);

    await releaseHandoff(scope, room.id);
    const again = await listReleasedHandoffItems(room.id);
    expect(again.map((i) => i.label).sort()).toEqual(["Extra ZIP", "Spec PDF"]);
  });

  it("comment edits require matching reviewer id (email alone is insufficient)", async () => {
    const { createPasswordUser } = await import("@/lib/auth/password");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const { db } = await import("@/db");
    const { projects, revisionAssets, revisions, assets, workspaces } = await import("@/db/schema");
    const {
      createPublicComment,
      updatePublicComment,
      upsertReviewer,
    } = await import("@/lib/rooms/service");
    const {
      createReviewerSessionToken,
      verifyReviewerSessionToken,
    } = await import("@/lib/rooms/reviewer-session");

    const stamp = randomBytes(4).toString("hex");
    const user = await createPasswordUser({
      email: `comments-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "Comment Owner",
    });
    const tenant = await createPrivateTenantForUser(user.id);
    const workspace = (
      await db.select().from(workspaces).where(eq(workspaces.id, tenant.workspaceId)).limit(1)
    )[0]!;

    const [room] = await db
      .insert(projects)
      .values({
        organizationId: workspace.organizationId,
        workspaceId: tenant.workspaceId,
        name: `Comments ${stamp}`,
        clientName: "Client",
        slug: `comments-${stamp}`,
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
        contentDigest: "digest",
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

    const author = await upsertReviewer({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      name: "Author",
      email: `author-${stamp}@example.com`,
    });
    const interloper = await upsertReviewer({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      name: "Other",
      email: `other-${stamp}@example.com`,
    });

    const comment = await createPublicComment({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      revisionId: revision.id,
      revisionAssetId: membership.id,
      reviewerId: author.id,
      xPercent: 0.4,
      yPercent: 0.3,
      body: "Please refine the CTA.",
    });

    const shareToken = `tok-${stamp}`;
    const authorCred = createReviewerSessionToken({
      reviewerId: author.id,
      projectId: room.id,
      shareToken,
    });
    const session = verifyReviewerSessionToken(authorCred, {
      projectId: room.id,
      shareToken,
    });

    const edited = await updatePublicComment({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      revisionId: revision.id,
      commentId: comment.id,
      reviewerId: session.reviewerId,
      body: "Updated CTA note.",
    });
    expect(edited.body).toBe("Updated CTA note.");

    await expect(
      updatePublicComment({
        workspaceId: tenant.workspaceId,
        projectId: room.id,
        revisionId: revision.id,
        commentId: comment.id,
        reviewerId: interloper.id,
        body: "Impersonation attempt",
      }),
    ).rejects.toThrow(/only edit comments you left/i);

    // Knowing the author's email and upserting as them yields the same reviewer id —
    // edit auth must still come from the signed session, not mere email knowledge.
    const viaEmail = await upsertReviewer({
      workspaceId: tenant.workspaceId,
      projectId: room.id,
      name: "Author",
      email: `author-${stamp}@example.com`,
    });
    expect(viaEmail.id).toBe(author.id);

    const otherShare = createReviewerSessionToken({
      reviewerId: author.id,
      projectId: room.id,
      shareToken: "other-share",
    });
    expect(() =>
      verifyReviewerSessionToken(otherShare, { projectId: room.id, shareToken }),
    ).toThrow(/share link/i);
  });

  it("handoff path validation rejects foreign project paths and oversized sizes", async () => {
    const { MAX_UPLOAD_BYTES, buildHandoffObjectPath } = await import("@/lib/rooms/storage");
    const path = buildHandoffObjectPath({
      workspaceId: "11111111-1111-1111-1111-111111111111",
      projectId: "22222222-2222-2222-2222-222222222222",
      filename: "pack.zip",
    });
    expect(path).toContain("/handoff/");
    expect(path).toContain("22222222-2222-2222-2222-222222222222");
    expect(MAX_UPLOAD_BYTES).toBe(25 * 1024 * 1024);

    const { createPasswordUser } = await import("@/lib/auth/password");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const { db } = await import("@/db");
    const { projects, workspaces } = await import("@/db/schema");
    const { completeHandoffDirectUpload } = await import("@/lib/rooms/service");

    const stamp = randomBytes(4).toString("hex");
    const user = await createPasswordUser({
      email: `upload-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "Upload Owner",
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
      userName: "",
      userEmail: user.email || "",
    };
    const [room] = await db
      .insert(projects)
      .values({
        organizationId: workspace.organizationId,
        workspaceId: tenant.workspaceId,
        name: `Upload ${stamp}`,
        clientName: "Client",
        slug: `upload-${stamp}`,
        status: "APPROVED",
      })
      .returning();

    await expect(
      completeHandoffDirectUpload({
        scope,
        projectId: room.id,
        pathname: `workspaces/${tenant.workspaceId}/rooms/other-project/handoff/x.zip`,
        blobUrl: "https://blob.example/x.zip",
        contentType: "application/zip",
        size: 10,
        fileName: "x.zip",
        uploadSessionId: `workspaces/${tenant.workspaceId}/rooms/other-project/handoff/x.zip`,
      }),
    ).rejects.toThrow(/not owned/i);

    await expect(
      completeHandoffDirectUpload({
        scope,
        projectId: room.id,
        pathname: `workspaces/${tenant.workspaceId}/rooms/${room.id}/handoff/big.zip`,
        blobUrl: "https://blob.example/big.zip",
        contentType: "application/zip",
        size: MAX_UPLOAD_BYTES + 1,
        fileName: "big.zip",
        uploadSessionId: `workspaces/${tenant.workspaceId}/rooms/${room.id}/handoff/big.zip`,
      }),
    ).rejects.toThrow(/25 MB/i);
  });
});
