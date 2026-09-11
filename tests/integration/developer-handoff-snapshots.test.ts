import { randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/lib/tenant/context";
import type { WorkspaceScope } from "@/lib/tenant/scope";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("developer handoff snapshots (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("allocates versions under lock, freezes published guidance, isolates tenants, and revokes tokens", async () => {
    const { db } = await import("@/db");
    const {
      approvals,
      auditEvents,
      developerHandoffLinks,
      developerHandoffSnapshotScreens,
      developerHandoffSnapshots,
      figmaExplanations,
      figmaImportBreakpointGroups,
      figmaImportScreens,
      figmaImports,
      organizations,
      projectDesigns,
      projectDesignVersions,
      rooms,
      reviewers,
      revisions,
      shareLinks,
      users,
      workspaces,
    } = await import("@/db/schema");
    const {
      createDeveloperHandoffLink,
      getDeveloperHandoffSummary,
      publishDeveloperHandoffSnapshot,
      resolveDeveloperHandoffScreen,
      resolveDeveloperHandoffToken,
      revokeDeveloperHandoffLink,
    } = await import("@/lib/developer-handoff/service");
    const { generateShareToken, hashShareToken } = await import("@/lib/rooms/crypto");
    const { resolveShareToken } = await import("@/lib/rooms/service");
    const { deletePreviewPng, writePreviewPng } = await import("@/lib/figma/preview-storage");
    const { getStorageAdapter } = await import("@/lib/rooms/storage");

    const stamp = randomBytes(5).toString("hex");
    const [publisher] = await db
      .insert(users)
      .values({ email: `handoff-publisher-${stamp}@example.com`, name: "Publisher" })
      .returning();
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Handoff ${stamp}`, slug: `handoff-${stamp}` })
      .returning();
    let outsiderOrganizationId: string | null = null;
    let outsiderUserId: string | null = null;
    let previewCleanup: TenantContext | null = null;

    try {
      const [workspace] = await db
        .insert(workspaces)
        .values({ organizationId: organization.id, name: "Main", slug: "main" })
        .returning();
      const [project] = await db
        .insert(rooms)
        .values({
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Approved website",
          clientName: "Acme",
          slug: `approved-${stamp}`,
          status: "APPROVED",
        })
        .returning();
      const [otherProject] = await db
        .insert(rooms)
        .values({
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Other project",
          clientName: "Other",
          slug: `other-${stamp}`,
          status: "DRAFT",
        })
        .returning();
      const [outsider] = await db
        .insert(users)
        .values({ email: `handoff-outsider-${stamp}@example.com`, name: "Outsider" })
        .returning();
      outsiderUserId = outsider.id;
      const [outsiderOrganization] = await db
        .insert(organizations)
        .values({ name: `Outsider ${stamp}`, slug: `outsider-${stamp}` })
        .returning();
      outsiderOrganizationId = outsiderOrganization.id;
      const [outsiderWorkspace] = await db
        .insert(workspaces)
        .values({ organizationId: outsiderOrganization.id, name: "Other", slug: "other" })
        .returning();
      const outsiderScope: WorkspaceScope = {
        organizationId: outsiderOrganization.id,
        organizationName: outsiderOrganization.name,
        workspaceId: outsiderWorkspace.id,
        workspaceName: outsiderWorkspace.name,
        userId: outsider.id,
        userName: outsider.name || outsider.email,
        userEmail: outsider.email,
      };
      const [revision] = await db
        .insert(revisions)
        .values({
          workspaceId: workspace.id,
          roomId: project.id,
          number: 1,
          status: "APPROVED",
          contentDigest: `digest-${stamp}`,
        })
        .returning();
      const [reviewer] = await db
        .insert(reviewers)
        .values({
          workspaceId: workspace.id,
          roomId: project.id,
          email: `approver-${stamp}@example.com`,
          name: "Approved By Client",
        })
        .returning();
      const [approval] = await db
        .insert(approvals)
        .values({
          workspaceId: workspace.id,
          roomId: project.id,
          revisionId: revision.id,
          reviewerId: reviewer.id,
          acceptanceStatement: "Approved",
          contentDigest: `digest-${stamp}`,
          decision: "approved",
        })
        .returning();
      await db
        .update(rooms)
        .set({ approvedRevisionId: revision.id })
        .where(eq(rooms.id, project.id));

      const figmaImportId = randomUUID();
      const desktopGroupId = `${stamp}-desktop`;
      const tabletGroupId = `${stamp}-tablet`;
      await db.insert(figmaImports).values({
        id: figmaImportId,
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        importedByUserId: publisher.id,
        figmaFileKey: "file-key",
        figmaFileName: "Website",
        figmaVersion: "42",
        figmaLastModified: new Date("2026-09-07T12:00:00.000Z"),
        screenCount: 2,
      });
      await db.insert(figmaImportScreens).values([
        {
          id: randomUUID(),
          figmaImportId,
          figmaNodeId: "1:3",
          name: "Home tablet",
          type: "FRAME",
          imageUrl: null,
          sortOrder: 1,
          breakpointGroupId: tabletGroupId,
        },
        {
          id: randomUUID(),
          figmaImportId,
          figmaNodeId: "1:2",
          name: "Home desktop",
          type: "FRAME",
          imageUrl: "stored-private-preview",
          sortOrder: 0,
          breakpointGroupId: desktopGroupId,
        },
      ]);
      // Insert reverse of expected snapshot order to prove publication is deterministic.
      await db.insert(figmaImportBreakpointGroups).values([
        {
          id: tabletGroupId,
          figmaImportId,
          name: "Tablet",
          primaryScreenId: "1:3",
        },
        {
          id: desktopGroupId,
          figmaImportId,
          name: "Desktop",
          primaryScreenId: "1:2",
        },
      ]);
      const designId = randomUUID();
      const designVersionId = randomUUID();
      await db.insert(projectDesigns).values({
        id: designId,
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        sourceType: "figma",
        sourceKey: "file-key",
        name: "Website",
      });
      await db.insert(projectDesignVersions).values({
        id: designVersionId,
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        designId,
        versionNumber: 1,
        contentSha256: "b".repeat(64),
        payloadJson: JSON.stringify({
          schemaVersion: 1,
          file: { key: "file-key", name: "Website", sourceVersion: "42", sourceLastModified: null, mainScreenId: "1:2", thumbnailScreenId: null },
          screens: [
            { id: "1:2", name: "Home desktop", type: "FRAME", width: null, height: null, x: null, y: null, interactionCount: 0, sortOrder: 0, breakpointGroupId: desktopGroupId, preview: null },
            { id: "1:3", name: "Home tablet", type: "FRAME", width: null, height: null, x: null, y: null, interactionCount: 0, sortOrder: 1, breakpointGroupId: tabletGroupId, preview: null },
          ],
          interactions: [],
          breakpointGroups: [],
          inspectTrees: [],
          warnings: [],
        }),
      });
      await db.update(projectDesigns).set({ currentVersionId: designVersionId }).where(eq(projectDesigns.id, designId));
      const secondImportId = randomUUID();
      await db.insert(figmaImports).values({
        id: secondImportId,
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        importedByUserId: publisher.id,
        figmaFileKey: "second-file-key",
        figmaFileName: "Mobile app",
        figmaVersion: "7",
        figmaLastModified: new Date("2026-09-07T12:30:00.000Z"),
        screenCount: 1,
      });
      await db.insert(figmaImportScreens).values({
        id: randomUUID(),
        figmaImportId: secondImportId,
        figmaNodeId: "9:9",
        name: "Mobile home",
        type: "FRAME",
        imageUrl: null,
        sortOrder: 0,
      });
      const publishedExplanationId = randomUUID();
      const draftExplanationId = randomUUID();
      await db.insert(figmaExplanations).values([
        {
          id: publishedExplanationId,
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: project.id,
          designId,
          designVersionId,
          authorUserId: publisher.id,
          authorDisplayName: "Publisher",
          figmaFileKey: "file-key",
          figmaFileName: "Website",
          screenId: "1:2",
          screenName: "Home",
          xBasisPoints: 100,
          yBasisPoints: 200,
          selectionWidthBasisPoints: null,
          selectionHeightBasisPoints: null,
          category: "intent",
          title: "Published",
          body: "Freeze this guidance.",
          status: "published",
        },
        {
          id: draftExplanationId,
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: project.id,
          designId,
          designVersionId,
          authorUserId: publisher.id,
          authorDisplayName: "Publisher",
          figmaFileKey: "file-key",
          figmaFileName: "Website",
          screenId: "1:2",
          screenName: "Home",
          xBasisPoints: 300,
          yBasisPoints: 400,
          selectionWidthBasisPoints: null,
          selectionHeightBasisPoints: null,
          category: "developer_note",
          title: "Draft",
          body: "Do not disclose.",
          status: "draft",
        },
      ]);

      const scope: WorkspaceScope = {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        userId: publisher.id,
        userName: publisher.name || publisher.email,
        userEmail: publisher.email,
      };
      const previewBytes = Buffer.from("immutable developer preview fixture");
      previewCleanup = {
        ...scope,
        projectId: project.id,
        projectSlug: project.slug,
        projectName: project.name,
      };
      await writePreviewPng(previewCleanup, "file-key", "1:2", previewBytes);

      await db
        .update(rooms)
        .set({ approvedRevisionId: null })
        .where(eq(rooms.id, project.id));
      const optionalApprovalRelease = await publishDeveloperHandoffSnapshot(
        scope,
        project.id,
        "file-key",
      );
      expect(optionalApprovalRelease.snapshot.version).toBe(1);
      expect(optionalApprovalRelease.dto.approvedRevision).toBeNull();
      expect(optionalApprovalRelease.link.token).toMatch(/^dev_/);
      const originalResolved = await resolveDeveloperHandoffToken(
        optionalApprovalRelease.link.token,
      );
      expect(originalResolved.snapshot.payload.file.screens[0]).toMatchObject({
        name: "Home desktop",
        explanations: [
          expect.objectContaining({
            title: "Published",
            body: "Freeze this guidance.",
            authorDisplayName: "Publisher",
          }),
        ],
      });
      const [originalMedia] = await db
        .select()
        .from(developerHandoffSnapshotScreens)
        .where(eq(developerHandoffSnapshotScreens.snapshotId, optionalApprovalRelease.snapshot.id));
      expect(originalMedia).toBeTruthy();
      const validMedia = await resolveDeveloperHandoffScreen(
        optionalApprovalRelease.link.token,
        originalMedia.id,
      );
      expect(Buffer.from(await new Response(validMedia.object.stream).arrayBuffer())).toEqual(
        previewBytes,
      );
      await expect(resolveDeveloperHandoffToken("dev_invalid")).rejects.toMatchObject({
        status: 404,
      });

      await expect(db
        .update(figmaExplanations)
        .set({ title: "Edited after release", body: "New implementation guidance." })
        .where(eq(figmaExplanations.id, publishedExplanationId))).rejects.toThrow();
      await db
        .update(figmaImportScreens)
        .set({ name: "Replacement desktop" })
        .where(
          and(
            eq(figmaImportScreens.figmaImportId, figmaImportId),
            eq(figmaImportScreens.figmaNodeId, "1:2"),
          ),
        );
      await db
        .update(figmaImports)
        .set({ figmaVersion: "43", updatedAt: new Date() })
        .where(eq(figmaImports.id, figmaImportId));

      await db
        .update(rooms)
        .set({ approvedRevisionId: revision.id })
        .where(eq(rooms.id, project.id));
      const releases = await Promise.all([
        publishDeveloperHandoffSnapshot(scope, project.id, "file-key"),
        publishDeveloperHandoffSnapshot(scope, project.id, "file-key"),
      ]);
      expect(releases.map((release) => release.snapshot.version).sort()).toEqual([2, 3]);
      expect(releases[0].snapshot.contentSha256).not.toBe(
        optionalApprovalRelease.snapshot.contentSha256,
      );
      expect(releases[0].dto.file.figmaVersion).toBe("43");
      expect(releases[0].dto.file.screens[0]).toMatchObject({
        name: "Replacement desktop",
        explanations: [
          expect.objectContaining({
            title: "Published",
            body: "Freeze this guidance.",
          }),
        ],
      });
      await expect(db
        .delete(figmaExplanations)
        .where(eq(figmaExplanations.id, publishedExplanationId))).rejects.toThrow();
      expect(
        (await resolveDeveloperHandoffToken(optionalApprovalRelease.link.token))
          .snapshot.payload.file.screens[0],
      ).toMatchObject({
        name: "Home desktop",
        explanations: [
          expect.objectContaining({
            title: "Published",
            body: "Freeze this guidance.",
          }),
        ],
      });
      const secondFileRelease = await publishDeveloperHandoffSnapshot(
        scope,
        project.id,
        "second-file-key",
      );
      expect(secondFileRelease.snapshot.version).toBe(1);
      expect(secondFileRelease.dto.file.key).toBe("second-file-key");
      await expect(
        resolveDeveloperHandoffScreen(secondFileRelease.link.token, originalMedia.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        resolveDeveloperHandoffScreen(optionalApprovalRelease.link.token, randomUUID()),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        resolveDeveloperHandoffScreen("dev_invalid", originalMedia.id),
      ).rejects.toMatchObject({ status: 404 });
      expect(releases[0].dto.approvedRevision).toMatchObject({
        id: revision.id,
        approvalId: approval.id,
        approverDisplayName: "Approved By Client",
      });
      expect(releases[0].dto.file.screens[0]).not.toHaveProperty("inspectTree");
      expect(releases[0].dto.file.screens[0].explanations).toEqual([
        expect.objectContaining({
          title: "Published",
          authorDisplayName: "Publisher",
        }),
      ]);
      expect(releases[0].dto.file.breakpointGroups).toEqual([
        {
          id: desktopGroupId,
          name: "Desktop",
          primaryScreenId: "1:2",
          memberScreenIds: ["1:2"],
        },
        {
          id: tabletGroupId,
          name: "Tablet",
          primaryScreenId: "1:3",
          memberScreenIds: ["1:3"],
        },
      ]);
      expect(releases[0].dto.file.screens.map((screen) => ({
        id: screen.id,
        breakpointGroupId: screen.breakpointGroupId,
      }))).toEqual([
        { id: "1:2", breakpointGroupId: desktopGroupId },
        { id: "1:3", breakpointGroupId: tabletGroupId },
      ]);

      await expect(
        db
          .update(developerHandoffSnapshots)
          .set({ publishedByDisplayName: "Rewritten" })
          .where(eq(developerHandoffSnapshots.id, releases[0].snapshot.id)),
      ).rejects.toThrow();
      const stillFrozen = (
        await db
          .select({ publishedByDisplayName: developerHandoffSnapshots.publishedByDisplayName })
          .from(developerHandoffSnapshots)
          .where(eq(developerHandoffSnapshots.id, releases[0].snapshot.id))
          .limit(1)
      )[0];
      expect(stillFrozen.publishedByDisplayName).toBe("Publisher");

      const link = await createDeveloperHandoffLink(scope, project.id, releases[0].snapshot.id);
      expect(await resolveDeveloperHandoffToken(link.token, true)).toMatchObject({
        snapshot: { id: releases[0].snapshot.id },
      });
      const storedLink = (
        await db
          .select()
          .from(developerHandoffLinks)
          .where(eq(developerHandoffLinks.id, link.id))
          .limit(1)
      )[0];
      expect(storedLink.viewCount).toBe(1);
      expect(storedLink.tokenHash).not.toBe(link.token);

      await expect(
        createDeveloperHandoffLink(scope, otherProject.id, releases[0].snapshot.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        createDeveloperHandoffLink(outsiderScope, project.id, releases[0].snapshot.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        revokeDeveloperHandoffLink(scope, otherProject.id, link.id),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        revokeDeveloperHandoffLink(outsiderScope, project.id, link.id),
      ).rejects.toMatchObject({ status: 404 });
      expect(await resolveDeveloperHandoffToken(link.token)).toMatchObject({
        snapshot: { id: releases[0].snapshot.id },
      });

      const expired = await createDeveloperHandoffLink(
        scope,
        project.id,
        releases[0].snapshot.id,
      );
      await db
        .update(developerHandoffLinks)
        .set({ expiresAt: new Date(Date.now() - 1_000) })
        .where(eq(developerHandoffLinks.id, expired.id));
      await expect(resolveDeveloperHandoffToken(expired.token, true)).rejects.toMatchObject({
        status: 404,
      });
      const expiredStored = (
        await db
          .select({ viewCount: developerHandoffLinks.viewCount })
          .from(developerHandoffLinks)
          .where(eq(developerHandoffLinks.id, expired.id))
          .limit(1)
      )[0];
      expect(expiredStored.viewCount).toBe(0);

      const clientToken = generateShareToken();
      await db
        .update(rooms)
        .set({ currentPublishedRevisionId: revision.id })
        .where(eq(rooms.id, project.id));
      await db.insert(shareLinks).values({
        workspaceId: workspace.id,
        roomId: project.id,
        tokenHash: hashShareToken(clientToken),
        scope: "view_only",
        status: "ACTIVE",
      });
      expect(await resolveShareToken(clientToken)).toMatchObject({
        project: { id: project.id },
      });
      await expect(resolveDeveloperHandoffToken(generateShareToken())).rejects.toMatchObject({
        status: 404,
      });
      await expect(resolveDeveloperHandoffToken(clientToken)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        resolveShareToken(optionalApprovalRelease.link.token),
      ).rejects.toThrow(/invalid|revoked/i);

      await revokeDeveloperHandoffLink(scope, project.id, link.id);
      await expect(resolveDeveloperHandoffToken(link.token)).rejects.toMatchObject({ status: 404 });

      const summary = await getDeveloperHandoffSummary(scope, project.id, "file-key");
      expect(summary.file).toMatchObject({
        key: "file-key",
        screenCount: 2,
        interactionCount: 0,
        publishedExplanationCount: 1,
        draftExplanationCount: 1,
      });
      expect(summary.currentApprovedRevision).toMatchObject({
        id: revision.id,
        number: 1,
      });
      expect(summary.snapshots.map((snapshot) => snapshot.version)).toEqual([3, 2, 1]);
      expect(summary.snapshots.every((snapshot) => snapshot.figmaFileKey === "file-key")).toBe(true);
      expect(summary.links).toHaveLength(5);

      const actions = (
        await db
          .select({ action: auditEvents.action })
          .from(auditEvents)
          .where(eq(auditEvents.roomId, project.id))
      ).map((event) => event.action);
      expect(actions.filter((action) => action === "developer_handoff.published")).toHaveLength(4);
      expect(actions.filter((action) => action === "developer_handoff.link_created")).toHaveLength(6);
      expect(actions).not.toContain("developer_handoff.snapshot_published");

      await db.delete(figmaImports).where(eq(figmaImports.id, figmaImportId));
      const detachedSnapshots = await db
        .select({
          id: developerHandoffSnapshots.id,
          sourceImportId: developerHandoffSnapshots.sourceImportId,
        })
        .from(developerHandoffSnapshots)
        .where(
          and(
            eq(developerHandoffSnapshots.projectId, project.id),
            eq(developerHandoffSnapshots.figmaFileKey, "file-key"),
          ),
        );
      expect(detachedSnapshots).toHaveLength(3);
      expect(detachedSnapshots.every((snapshot) => snapshot.sourceImportId === null)).toBe(true);
      const detachedResolved = await resolveDeveloperHandoffToken(
        optionalApprovalRelease.link.token,
      );
      expect(detachedResolved.snapshot.payload.file.figmaVersion).toBe("42");
      expect(detachedResolved.snapshot.payload.file.screens[0]).toMatchObject({
        name: "Home desktop",
      });
      const mediaAfterSourceDelete = await resolveDeveloperHandoffScreen(
        optionalApprovalRelease.link.token,
        originalMedia.id,
      );
      expect(
        Buffer.from(await new Response(mediaAfterSourceDelete.object.stream).arrayBuffer()),
      ).toEqual(previewBytes);
      await deletePreviewPng(previewCleanup, "file-key", "1:2");

      await db.delete(users).where(eq(users.id, publisher.id));
      const copiedAttribution = (
        await resolveDeveloperHandoffToken(optionalApprovalRelease.link.token)
      ).snapshot.payload;
      expect(copiedAttribution.publishedByDisplayName).toBe("Publisher");
      expect(copiedAttribution.file.screens[0].explanations[0].authorDisplayName).toBe(
        "Publisher",
      );

      await expect(
        getDeveloperHandoffSummary(scope, otherProject.id, "file-key"),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        getDeveloperHandoffSummary(
          outsiderScope,
          project.id,
          "file-key",
        ),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      const snapshotObjects = await db
        .select({ objectKey: developerHandoffSnapshotScreens.objectKey })
        .from(developerHandoffSnapshotScreens)
        .innerJoin(
          developerHandoffSnapshots,
          eq(developerHandoffSnapshots.id, developerHandoffSnapshotScreens.snapshotId),
        )
        .where(eq(developerHandoffSnapshots.organizationId, organization.id));
      await Promise.allSettled(
        snapshotObjects.map((object) => getStorageAdapter().delete(object.objectKey)),
      );
      if (previewCleanup) {
        await deletePreviewPng(previewCleanup, "file-key", "1:2");
      }
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(users).where(eq(users.id, publisher.id));
      if (outsiderOrganizationId) {
        await db.delete(organizations).where(eq(organizations.id, outsiderOrganizationId));
      }
      if (outsiderUserId) {
        await db.delete(users).where(eq(users.id, outsiderUserId));
      }
    }
  }, 120_000);
});
