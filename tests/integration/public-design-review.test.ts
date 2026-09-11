import { randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { ProjectDesignVersionPayload } from "@/lib/projects/design-version";
import type { WorkspaceScope } from "@/lib/tenant/scope";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

function payload(fileKey: string, screenName: string): ProjectDesignVersionPayload {
  return {
    schemaVersion: 1,
    file: {
      key: fileKey,
      name: "Checkout",
      sourceVersion: "1",
      sourceLastModified: null,
      mainScreenId: "screen:checkout",
      thumbnailScreenId: "screen:checkout",
    },
    screens: [{
      id: "screen:checkout",
      name: screenName,
      type: "FRAME",
      width: 1440,
      height: 900,
      x: 0,
      y: 0,
      interactionCount: 0,
      sortOrder: 0,
      breakpointGroupId: null,
      preview: null,
    }],
    interactions: [],
    breakpointGroups: [],
    inspectTrees: [],
    warnings: [],
  };
}

async function getPublic(token: string) {
  const { GET } = await import("@/app/api/public/[token]/route");
  const response = await GET(
    new Request(`http://localhost/api/public/${encodeURIComponent(token)}`),
    { params: Promise.resolve({ token }) },
  );
  return {
    response,
    json: await response.json() as Record<string, unknown>,
  };
}

describe.skipIf(!hasDb)("public design-screen review (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("validates targets, exposes frozen feedback, and preserves receipt evidence", async () => {
    const { db } = await import("@/db");
    const {
      assets,
      clientProjects,
      figmaExplanations,
      organizations,
      projectDesigns,
      projectDesignVersions,
      revisionAssets,
      revisionDesignVersions,
      revisions,
      roomComments,
      rooms,
      users,
      workspaces,
    } = await import("@/db/schema");
    const {
      createOrRotateShareLink,
      createPublicComment,
      createReviewer,
      listApprovalReceiptsForRoom,
      publishRevision,
      submitPublicDecision,
    } = await import("@/lib/rooms/service");
    const {
      projectDesignContentSha256,
      serializeProjectDesignVersion,
    } = await import("@/lib/projects/design-version");

    const stamp = randomBytes(5).toString("hex");
    const [user] = await db.insert(users).values({
      email: `public-design-${stamp}@example.com`,
      name: "Designer",
    }).returning();
    const [organization] = await db.insert(organizations).values({
      name: `Public design ${stamp}`,
      slug: `public-design-${stamp}`,
    }).returning();

    try {
      const [workspace, otherWorkspace] = await db.insert(workspaces).values([
        { organizationId: organization.id, name: "Main", slug: `main-${stamp}` },
        { organizationId: organization.id, name: "Other", slug: `other-${stamp}` },
      ]).returning();
      const [project, otherProject, otherWorkspaceProject] = await db.insert(clientProjects).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Checkout",
          clientName: "Acme",
          slug: `checkout-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Other project",
          clientName: "Elsewhere",
          slug: `other-project-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: otherWorkspace.id,
          name: "Other workspace project",
          clientName: "Elsewhere",
          slug: `other-workspace-project-${stamp}`,
        },
      ]).returning();
      const [room, designOnlyRoom, otherProjectRoom, otherWorkspaceRoom] = await db.insert(rooms).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Checkout review",
          clientName: "Acme",
          slug: `checkout-review-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Design only",
          clientName: "Acme",
          slug: `design-only-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: otherProject.id,
          name: "Other project room",
          clientName: "Elsewhere",
          slug: `other-project-room-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: otherWorkspace.id,
          clientProjectId: otherWorkspaceProject.id,
          name: "Other workspace room",
          clientName: "Elsewhere",
          slug: `other-workspace-room-${stamp}`,
        },
      ]).returning();
      const [revision, designOnlyRevision, laterRevision, otherProjectRevision, otherWorkspaceRevision] =
        await db.insert(revisions).values([
          { workspaceId: workspace.id, roomId: room.id, number: 1, status: "DRAFT" },
          { workspaceId: workspace.id, roomId: designOnlyRoom.id, number: 1, status: "DRAFT" },
          { workspaceId: workspace.id, roomId: room.id, number: 2, status: "DRAFT" },
          { workspaceId: workspace.id, roomId: otherProjectRoom.id, number: 1, status: "DRAFT" },
          { workspaceId: otherWorkspace.id, roomId: otherWorkspaceRoom.id, number: 1, status: "DRAFT" },
        ]).returning();

      const firstPayload = payload(`checkout-${stamp}`, "Checkout desktop");
      const [design] = await db.insert(projectDesigns).values({
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        sourceType: "figma",
        sourceKey: firstPayload.file.key,
        name: "Checkout flow",
      }).returning();
      const [versionOne] = await db.insert(projectDesignVersions).values({
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        designId: design.id,
        versionNumber: 1,
        contentSha256: projectDesignContentSha256(firstPayload),
        payloadJson: serializeProjectDesignVersion(firstPayload),
        createdByUserId: user.id,
      }).returning();
      await db.update(projectDesigns).set({ currentVersionId: versionOne.id }).where(eq(projectDesigns.id, design.id));
      const unpinnedPayload = payload(`checkout-${stamp}`, "Checkout unpinned");
      const [unpinnedVersion] = await db.insert(projectDesignVersions).values({
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        designId: design.id,
        versionNumber: 2,
        contentSha256: projectDesignContentSha256(unpinnedPayload),
        payloadJson: serializeProjectDesignVersion(unpinnedPayload),
        createdByUserId: user.id,
      }).returning();
      await db.update(projectDesigns).set({ currentVersionId: unpinnedVersion.id }).where(eq(projectDesigns.id, design.id));

      const [asset] = await db.insert(assets).values({
        workspaceId: workspace.id,
        roomId: room.id,
        kind: "image",
        label: "Existing hero",
        mime: "image/png",
        checksum: "asset-sha",
      }).returning();
      const [assetPin] = await db.insert(revisionAssets).values({
        revisionId: revision.id,
        assetId: asset.id,
        sortOrder: 0,
      }).returning();
      const [designPin, designOnlyPin, laterPin] = await db.insert(revisionDesignVersions).values([
        { roomRevisionId: revision.id, designVersionId: versionOne.id, sortOrder: 1 },
        { roomRevisionId: designOnlyRevision.id, designVersionId: versionOne.id, sortOrder: 0 },
        { roomRevisionId: laterRevision.id, designVersionId: versionOne.id, sortOrder: 0 },
      ]).returning();

      const scope: WorkspaceScope = {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        userId: user.id,
        userName: user.name!,
        userEmail: user.email,
      };
      await publishRevision(scope, room.id);
      await publishRevision(scope, designOnlyRoom.id);

      const [reviewer] = await Promise.all([
        createReviewer({
          workspaceId: workspace.id,
          roomId: room.id,
          name: "Reviewer",
          email: `reviewer-${stamp}@example.com`,
        }),
      ]);

      const assetComment = await createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: { type: "asset", revisionAssetId: assetPin.id },
        reviewerId: reviewer.id,
        xPercent: 0.25,
        yPercent: 0.75,
        body: "Keep existing asset comments working.",
      });
      expect(assetComment).toMatchObject({
        revisionAssetId: assetPin.id,
        revisionDesignVersionId: null,
        designScreenId: null,
      });

      const designComment = await createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: {
          type: "design_screen",
          revisionDesignVersionId: designPin.id,
          screenId: "screen:checkout",
        },
        reviewerId: reviewer.id,
        xPercent: 0.375,
        yPercent: 0.625,
        body: "Align the checkout heading.",
      });
      expect(designComment).toMatchObject({
        revisionAssetId: null,
        revisionDesignVersionId: designPin.id,
        designScreenId: "screen:checkout",
        xPercent: "0.37500",
        yPercent: "0.62500",
      });

      const baseComment = {
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        reviewerId: reviewer.id,
        xPercent: 0.5,
        yPercent: 0.5,
        body: "Invalid target",
      };
      await expect(createPublicComment({
        ...baseComment,
        target: { type: "design_screen", revisionDesignVersionId: randomUUID(), screenId: "screen:checkout" },
      })).rejects.toThrow(/not pinned/i);
      await expect(createPublicComment({
        ...baseComment,
        target: { type: "design_screen", revisionDesignVersionId: laterPin.id, screenId: "screen:checkout" },
      })).rejects.toThrow(/not pinned/i);
      await expect(createPublicComment({
        ...baseComment,
        target: { type: "design_screen", revisionDesignVersionId: designPin.id, screenId: "missing" },
      })).rejects.toThrow(/does not exist/i);
      await expect(createPublicComment({
        ...baseComment,
        roomId: otherProjectRoom.id,
        revisionId: otherProjectRevision.id,
        target: { type: "design_screen", revisionDesignVersionId: designPin.id, screenId: "screen:checkout" },
      })).rejects.toThrow(/current published revision/i);
      await expect(createPublicComment({
        ...baseComment,
        workspaceId: otherWorkspace.id,
        roomId: otherWorkspaceRoom.id,
        revisionId: otherWorkspaceRevision.id,
        target: { type: "design_screen", revisionDesignVersionId: designPin.id, screenId: "screen:checkout" },
      })).rejects.toThrow(/current published revision/i);

      const noteRows = [
        {
          id: randomUUID(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: project.id,
          designId: design.id,
          designVersionId: versionOne.id,
          authorUserId: user.id,
          authorDisplayName: "Pinned Designer",
          figmaFileKey: firstPayload.file.key,
          figmaFileName: firstPayload.file.name,
          screenId: "screen:checkout",
          screenName: "Checkout desktop",
          figmaNodeId: "node:1",
          figmaNodeName: "Payment form",
          xBasisPoints: 5000,
          yBasisPoints: 4000,
          selectionWidthBasisPoints: 2000,
          selectionHeightBasisPoints: 1000,
          category: "intent",
          title: "Published rectangle",
          body: "This region is intentionally compact.",
          status: "published",
        },
        {
          id: randomUUID(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: project.id,
          designId: design.id,
          designVersionId: versionOne.id,
          authorUserId: user.id,
          authorDisplayName: "Pinned Designer",
          figmaFileKey: firstPayload.file.key,
          figmaFileName: firstPayload.file.name,
          screenId: "screen:checkout",
          screenName: "Checkout desktop",
          figmaNodeId: null,
          figmaNodeName: null,
          xBasisPoints: 2000,
          yBasisPoints: 2000,
          selectionWidthBasisPoints: null,
          selectionHeightBasisPoints: null,
          category: "intent",
          title: "Draft secret",
          body: "Must not be public.",
          status: "draft",
        },
        {
          id: randomUUID(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: project.id,
          designId: design.id,
          designVersionId: unpinnedVersion.id,
          authorUserId: user.id,
          authorDisplayName: "Later Designer",
          figmaFileKey: unpinnedPayload.file.key,
          figmaFileName: unpinnedPayload.file.name,
          screenId: "screen:checkout",
          screenName: "Checkout unpinned",
          figmaNodeId: null,
          figmaNodeName: null,
          xBasisPoints: 3000,
          yBasisPoints: 3000,
          selectionWidthBasisPoints: null,
          selectionHeightBasisPoints: null,
          category: "intent",
          title: "Other version note",
          body: "Must not leak into the pinned version.",
          status: "published",
        },
      ];
      await db.insert(figmaExplanations).values(noteRows);

      const share = await createOrRotateShareLink(scope, room.id);
      const publicResult = await getPublic(share.token);
      expect(publicResult.response.status).toBe(200);
      expect(publicResult.json.project).toEqual({
        id: project.id,
        name: "Checkout",
        clientName: "Acme",
      });
      expect(publicResult.json.room).toEqual(expect.objectContaining({
        id: room.id,
        name: "Checkout review",
        status: "SENT",
      }));
      const targets = publicResult.json.targets as Array<Record<string, unknown>>;
      expect(targets).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "asset", revisionAssetId: assetPin.id }),
        expect.objectContaining({
          type: "design_screen",
          revisionDesignVersionId: designPin.id,
          screenId: "screen:checkout",
          screenName: "Checkout desktop",
        }),
      ]));
      expect(publicResult.json.comments).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: assetComment.id, revisionAssetId: assetPin.id }),
        expect.objectContaining({
          id: designComment.id,
          revisionDesignVersionId: designPin.id,
          screenId: "screen:checkout",
          xPercent: 0.375,
          yPercent: 0.625,
        }),
      ]));
      expect(publicResult.json.designerNotes).toEqual([
        expect.objectContaining({
          title: "Published rectangle",
          revisionDesignVersionId: designPin.id,
          selectionWidth: 20,
          selectionHeight: 10,
          x: 50,
          y: 40,
        }),
      ]);

      const designOnlyShare = await createOrRotateShareLink(scope, designOnlyRoom.id);
      const designOnly = await getPublic(designOnlyShare.token);
      expect(designOnly.response.status).toBe(200);
      expect(designOnly.json.assets).toEqual([]);
      expect(designOnly.json.targets).toEqual([
        expect.objectContaining({
          type: "design_screen",
          revisionDesignVersionId: designOnlyPin.id,
          screenId: "screen:checkout",
        }),
      ]);
      expect(designOnly.json.comments).toEqual([]);

      await db.update(rooms).set({ status: "APPROVED" }).where(eq(rooms.id, designOnlyRoom.id));
      await expect(createPublicComment({
        workspaceId: workspace.id,
        roomId: designOnlyRoom.id,
        revisionId: designOnlyRevision.id,
        target: { type: "design_screen", revisionDesignVersionId: designOnlyPin.id, screenId: "screen:checkout" },
        reviewerId: reviewer.id,
        xPercent: 0.5,
        yPercent: 0.5,
        body: "Locked",
      })).rejects.toThrow(/locked/i);
      await db.update(rooms).set({ status: "ARCHIVED" }).where(eq(rooms.id, designOnlyRoom.id));
      await expect(createPublicComment({
        workspaceId: workspace.id,
        roomId: designOnlyRoom.id,
        revisionId: designOnlyRevision.id,
        target: { type: "design_screen", revisionDesignVersionId: designOnlyPin.id, screenId: "screen:checkout" },
        reviewerId: reviewer.id,
        xPercent: 0.5,
        yPercent: 0.5,
        body: "Still locked",
      })).rejects.toThrow(/locked/i);

      await submitPublicDecision({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        reviewerId: reviewer.id,
        decision: "approve",
        acceptanceStatement: "I approve this pinned design version.",
      });
      const laterPayload = payload(`checkout-${stamp}`, "Checkout imported later");
      const [laterImportedVersion] = await db.insert(projectDesignVersions).values({
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        designId: design.id,
        versionNumber: 3,
        contentSha256: projectDesignContentSha256(laterPayload),
        payloadJson: serializeProjectDesignVersion(laterPayload),
        createdByUserId: user.id,
      }).returning();
      await db.update(projectDesigns).set({ currentVersionId: laterImportedVersion.id }).where(eq(projectDesigns.id, design.id));

      const [receipt] = await listApprovalReceiptsForRoom(room.id, { decision: "approved" });
      expect(receipt).toMatchObject({
        projectName: "Checkout",
        clientName: "Acme",
        designCount: 1,
        reviewedItemCount: 2,
        designVersions: [{
          designId: design.id,
          designVersionId: versionOne.id,
          designName: "Checkout flow",
          versionNumber: 1,
          contentSha256: versionOne.contentSha256,
          screenNames: ["Checkout desktop"],
        }],
      });
      expect(receipt.designVersions[0]?.designVersionId).not.toBe(laterImportedVersion.id);

      const storedComments = await db.select().from(roomComments).where(eq(roomComments.revisionId, revision.id));
      expect(storedComments).toHaveLength(2);
    } finally {
      await db.execute(sql`
        delete from revision_assets
        where asset_id in (
          select a.id
          from assets a
          join workspaces w on w.id = a.workspace_id
          where w.organization_id = ${organization.id}
        )
      `);
      await db.execute(sql`
        delete from approvals
        where workspace_id in (
          select id from workspaces where organization_id = ${organization.id}
        )
      `);
      await db.delete(rooms).where(eq(rooms.organizationId, organization.id));
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }, 120_000);
});
