import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { FigmaImportResult } from "@/lib/figma/types";
import type { TenantContext } from "@/lib/tenant/context";
import type { WorkspaceScope } from "@/lib/tenant/scope";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

function imported(name: string, sourceVersion: string): FigmaImportResult {
  return {
    file: {
      key: "shared-file",
      name: "Website",
      version: sourceVersion,
      lastModified: new Date().toISOString(),
      thumbnailUrl: null,
      mainScreenId: "1:2",
    },
    screens: [{
      id: "1:2",
      name,
      type: "FRAME",
      imageUrl: null,
      width: 1440,
      height: 900,
      x: 0,
      y: 0,
      interactionCount: 0,
    }],
    interactions: [],
    warnings: [],
    importSource: "api",
  };
}

describe.skipIf(!hasDb)("project design versions (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("versions imports, isolates annotations, pins revisions, and preserves history", async () => {
    const { db } = await import("@/db");
    const {
      clientProjects,
      figmaImports,
      organizations,
      projectDesignVersions,
      revisionDesignVersions,
      revisions,
      rooms,
      users,
      workspaces,
    } = await import("@/db/schema");
    const {
      copyFigmaExplanations,
      createFigmaExplanation,
      listFigmaExplanations,
    } = await import("@/lib/figma/explanations");
    const {
      deleteProjectDesignVersion,
      deleteProjectDesignScreens,
      getProjectDesignVersion,
      listProjectDesignVersions,
      listProjectDesigns,
      saveFigmaImport,
    } = await import("@/lib/figma/persistence");
    const {
      getRoomBundle,
      pinDesignVersionToDraft,
      publishRevision,
    } = await import("@/lib/rooms/service");

    const stamp = randomBytes(5).toString("hex");
    const [user] = await db.insert(users).values({
      email: `design-versions-${stamp}@example.com`,
      name: "Designer",
    }).returning();
    const [organization] = await db.insert(organizations).values({
      name: `Design Versions ${stamp}`,
      slug: `design-versions-${stamp}`,
    }).returning();
    try {
      const [workspace] = await db.insert(workspaces).values({
        organizationId: organization.id,
        name: "Main",
        slug: "main",
      }).returning();
      const [project, otherProject] = await db.insert(clientProjects).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Website",
          clientName: "Client",
          slug: `website-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Other",
          clientName: "Other",
          slug: `other-${stamp}`,
        },
      ]).returning();
      const [roomOne, roomTwo, foreignRoom] = await db.insert(rooms).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Review one",
          clientName: "Client",
          slug: `review-one-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Review two",
          clientName: "Client",
          slug: `review-two-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: otherProject.id,
          name: "Foreign review",
          clientName: "Other",
          slug: `foreign-${stamp}`,
        },
      ]).returning();
      const revisionRows = await db.insert(revisions).values([
        { workspaceId: workspace.id, roomId: roomOne.id, number: 1, status: "DRAFT" },
        { workspaceId: workspace.id, roomId: roomTwo.id, number: 1, status: "DRAFT" },
        { workspaceId: workspace.id, roomId: foreignRoom.id, number: 1, status: "DRAFT" },
      ]).returning();

      const tenant: TenantContext = {
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        projectSlug: project.slug,
        userId: user.id,
        organizationName: organization.name,
        workspaceName: workspace.name,
        projectName: project.name,
        clientName: project.clientName,
        userName: user.name!,
        userEmail: user.email,
      };
      const scope: WorkspaceScope = {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        userId: user.id,
        userName: user.name!,
        userEmail: user.email,
      };

      const first = await saveFigmaImport(tenant, null, imported("Home", "1"));
      const unchanged = await saveFigmaImport(tenant, null, imported("Home", "source-label-changed"));
      expect(unchanged).toMatchObject({
        designId: first.designId,
        designVersionId: first.designVersionId,
        versionNumber: 1,
      });

      const second = await saveFigmaImport(tenant, null, imported("Home updated", "2"));
      expect(second).toMatchObject({ designId: first.designId, versionNumber: 2 });
      const concurrent = await Promise.all([
        saveFigmaImport(tenant, null, imported("Home concurrent", "3")),
        saveFigmaImport(tenant, null, imported("Home concurrent", "3")),
      ]);
      expect(new Set(concurrent.map((row) => row.versionNumber))).toEqual(new Set([3]));
      expect(new Set(concurrent.map((row) => row.designVersionId)).size).toBe(1);

      await pinDesignVersionToDraft({
        scope,
        roomId: roomOne.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
      });
      await pinDesignVersionToDraft({
        scope,
        roomId: roomTwo.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
        selectedScreenIds: ["1:2"],
      });
      expect(await db
        .select()
        .from(revisionDesignVersions)
        .where(eq(revisionDesignVersions.designVersionId, first.designVersionId))).toHaveLength(2);
      const roomTwoPin = (await db
        .select()
        .from(revisionDesignVersions)
        .where(eq(revisionDesignVersions.designVersionId, first.designVersionId)))
        .find((row) => JSON.parse(row.displayMetaJson).selectedScreenIds);
      expect(JSON.parse(roomTwoPin?.displayMetaJson ?? "{}").selectedScreenIds).toEqual(["1:2"]);
      await expect(pinDesignVersionToDraft({
        scope,
        roomId: roomTwo.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
        selectedScreenIds: ["missing-screen"],
      })).rejects.toThrow(/do not belong/i);
      await expect(pinDesignVersionToDraft({
        scope,
        roomId: foreignRoom.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
      })).rejects.toThrow(/not found in this room's project/i);

      await publishRevision(scope, roomOne.id);
      const published = await getRoomBundle(workspace.id, roomOne.id);
      expect(published.designMembership[0]).toMatchObject({
        designVersionId: first.designVersionId,
        versionNumber: 1,
      });
      expect(published.designMembership[0]?.screens[0]?.name).toBe("Home");

      const explanation = await createFigmaExplanation(tenant, {
        projectKey: project.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
        fileKey: "shared-file",
        fileName: "Website",
        screenId: "1:2",
        screenName: "Home",
        figmaNodeId: null,
        figmaNodeName: null,
        x: 10,
        y: 20,
        selectionWidth: null,
        selectionHeight: null,
        category: "intent",
        title: "Version one",
        body: "Only version one should show this.",
        status: "published",
      });
      expect(explanation.canEdit).toBe(false);
      expect(await listFigmaExplanations(tenant, "shared-file", "1:2", second.designVersionId)).toEqual([]);
      const copied = await copyFigmaExplanations(tenant, first.designVersionId, second.designVersionId);
      expect(copied).toEqual([expect.objectContaining({ title: "Version one", status: "draft" })]);

      const history = await listProjectDesignVersions(tenant, first.designId);
      expect(history).toEqual([
        expect.objectContaining({ versionNumber: 3, isCurrent: true, canDelete: false }),
        expect.objectContaining({ versionNumber: 2, isCurrent: false, isReferenced: false, canDelete: true }),
        expect.objectContaining({ versionNumber: 1, isReferenced: true, canDelete: false }),
      ]);
      await expect(deleteProjectDesignVersion(
        tenant,
        first.designId,
        concurrent[0].designVersionId,
      )).rejects.toThrow(/current design version/i);
      await expect(deleteProjectDesignVersion(
        tenant,
        first.designId,
        first.designVersionId,
      )).rejects.toThrow(/used by an approval room/i);
      await expect(deleteProjectDesignVersion(
        tenant,
        first.designId,
        second.designVersionId,
      )).resolves.toMatchObject({ deleted: true, id: second.designVersionId });
      expect(await getProjectDesignVersion(tenant, second.designVersionId)).toBeNull();

      await db.delete(rooms).where(eq(rooms.id, roomTwo.id));
      expect(await getProjectDesignVersion(tenant, first.designVersionId)).not.toBeNull();
      expect(await db.select().from(clientProjects).where(eq(clientProjects.id, project.id))).toHaveLength(1);

      await expect(db
        .update(projectDesignVersions)
        .set({ payloadJson: "{}" })
        .where(eq(projectDesignVersions.id, first.designVersionId))).rejects.toThrow();
      await expect(db
        .delete(projectDesignVersions)
        .where(eq(projectDesignVersions.id, first.designVersionId))).rejects.toThrow();

      expect(revisionRows).toHaveLength(3);
      expect((await getRoomBundle(workspace.id, roomOne.id)).designMembership[0]?.versionNumber).toBe(1);
      expect((await db
        .select()
        .from(projectDesignVersions)
        .where(and(
          eq(projectDesignVersions.designId, first.designId),
          eq(projectDesignVersions.versionNumber, 3),
        )))).toHaveLength(1);

      await db.delete(figmaImports).where(eq(figmaImports.projectId, project.id));
      expect(await listProjectDesigns(tenant)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          designId: first.designId,
          designVersionId: concurrent[0].designVersionId,
          versionNumber: 3,
          name: "Home concurrent",
        }),
      ]));

      const partialPayload = imported("Desktop", "1");
      partialPayload.file.key = `partial-${stamp}`;
      partialPayload.screens.push({
        ...partialPayload.screens[0],
        id: "2:3",
        name: "Mobile",
        width: 390,
        height: 844,
      });
      const partial = await saveFigmaImport(tenant, null, partialPayload);
      await db.delete(figmaImports).where(and(
        eq(figmaImports.projectId, project.id),
        eq(figmaImports.figmaFileKey, partialPayload.file.key),
      ));
      const deleted = await deleteProjectDesignScreens(
        tenant,
        partial.designId,
        partial.designVersionId,
        ["1:2"],
      );
      expect(deleted).toMatchObject({ deleted: true, versionNumber: 2 });
      const partialCards = (await listProjectDesigns(tenant))
        .filter((design) => design.designId === partial.designId);
      expect(partialCards).toEqual([
        expect.objectContaining({
          designVersionId: deleted.designVersionId,
          name: "Mobile",
          versionNumber: 2,
        }),
      ]);
    } finally {
      await db.delete(rooms).where(eq(rooms.organizationId, organization.id));
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }, 120_000);
});
