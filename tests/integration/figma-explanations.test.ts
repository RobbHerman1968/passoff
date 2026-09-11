import { randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { TenantContext } from "@/lib/tenant/context";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Figma explanations (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("isolates tenants, protects authorship, filters drafts, and leaves comments unchanged", async () => {
    const { db } = await import("@/db");
    const {
      figmaComments,
      figmaImports,
      figmaImportScreens,
      organizationMemberships,
      organizations,
      projectDesigns,
      projectDesignVersions,
      rooms,
      users,
      workspaceMemberships,
      workspaces,
    } = await import("@/db/schema");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const {
      createFigmaExplanation,
      deleteFigmaExplanation,
      listFigmaExplanations,
      updateFigmaExplanation,
    } = await import("@/lib/figma/explanations");

    const stamp = randomBytes(5).toString("hex");
    const [author, member, outsider] = await db.insert(users).values([
      { email: `explanation-author-${stamp}@example.com`, name: "Explanation Author" },
      { email: `explanation-member-${stamp}@example.com`, name: "Workspace Member" },
      { email: `explanation-outsider-${stamp}@example.com`, name: "Other Tenant" },
    ]).returning();

    let authorOrganizationId: string | null = null;
    let outsiderOrganizationId: string | null = null;
    try {
      const authorScope = await createPrivateTenantForUser(author.id);
      const outsiderScope = await createPrivateTenantForUser(outsider.id);
      const authorWorkspace = (await db.select().from(workspaces).where(eq(workspaces.id, authorScope.workspaceId)).limit(1))[0]!;
      const outsiderWorkspace = (await db.select().from(workspaces).where(eq(workspaces.id, outsiderScope.workspaceId)).limit(1))[0]!;
      authorOrganizationId = authorWorkspace.organizationId;
      outsiderOrganizationId = outsiderWorkspace.organizationId;

      await db.insert(organizationMemberships).values({
        organizationId: authorWorkspace.organizationId,
        userId: member.id,
        role: "member",
        status: "active",
      });
      await db.insert(workspaceMemberships).values({
        workspaceId: authorWorkspace.id,
        userId: member.id,
        role: "member",
      });

      const [project, outsiderProject] = await Promise.all([
        db.insert(rooms).values({
          organizationId: authorWorkspace.organizationId,
          workspaceId: authorWorkspace.id,
          name: `Explanations ${stamp}`,
          clientName: "Client",
          slug: `explanations-${stamp}`,
          status: "DRAFT",
        }).returning().then((rows) => rows[0]!),
        db.insert(rooms).values({
          organizationId: outsiderWorkspace.organizationId,
          workspaceId: outsiderWorkspace.id,
          name: `Other explanations ${stamp}`,
          clientName: "Other client",
          slug: `other-explanations-${stamp}`,
          status: "DRAFT",
        }).returning().then((rows) => rows[0]!),
      ]);

      const tenant = (
        user: typeof author,
        organizationId: string,
        workspaceId: string,
        projectId: string,
        projectSlug: string,
      ): TenantContext => ({
        organizationId,
        workspaceId,
        projectId,
        projectSlug,
        userId: user.id,
        organizationName: "Test organization",
        workspaceName: "Main workspace",
        projectName: "Test project",
        userName: user.name || user.email,
        userEmail: user.email,
      });
      const authorTenant = tenant(author, authorWorkspace.organizationId, authorWorkspace.id, project.id, project.slug);
      const memberTenant = tenant(member, authorWorkspace.organizationId, authorWorkspace.id, project.id, project.slug);
      const outsiderTenant = tenant(outsider, outsiderWorkspace.organizationId, outsiderWorkspace.id, outsiderProject.id, outsiderProject.slug);

      const figmaImportId = randomUUID();
      await db.insert(figmaImports).values({
        id: figmaImportId,
        organizationId: authorTenant.organizationId,
        workspaceId: authorTenant.workspaceId,
        projectId: authorTenant.projectId,
        importedByUserId: author.id,
        figmaFileKey: "file-key",
        figmaFileName: "Canonical website file",
        figmaVersion: "1",
        importSource: "api",
        figmaLastModified: new Date(),
        warningsJson: "[]",
        screenCount: 1,
        previewCount: 1,
        interactionCount: 0,
      });
      await db.insert(figmaImportScreens).values({
        id: randomUUID(),
        figmaImportId,
        figmaNodeId: "1:2",
        name: "Canonical home screen",
        type: "FRAME",
        interactionCount: 0,
        sortOrder: 0,
      });
      const designId = randomUUID();
      const designVersionId = randomUUID();
      await db.insert(projectDesigns).values({
        id: designId,
        organizationId: authorTenant.organizationId,
        workspaceId: authorTenant.workspaceId,
        projectId: authorTenant.projectId,
        sourceType: "figma",
        sourceKey: "file-key",
        name: "Canonical website file",
      });
      await db.insert(projectDesignVersions).values({
        id: designVersionId,
        organizationId: authorTenant.organizationId,
        workspaceId: authorTenant.workspaceId,
        projectId: authorTenant.projectId,
        designId,
        versionNumber: 1,
        contentSha256: "a".repeat(64),
        payloadJson: JSON.stringify({
          schemaVersion: 1,
          file: { key: "file-key", name: "Canonical website file", sourceVersion: "1", sourceLastModified: null, mainScreenId: "1:2", thumbnailScreenId: null },
          screens: [{ id: "1:2", name: "Canonical home screen", type: "FRAME", width: null, height: null, x: null, y: null, interactionCount: 0, sortOrder: 0, breakpointGroupId: null, preview: null }],
          interactions: [],
          breakpointGroups: [],
          inspectTrees: [],
          warnings: [],
        }),
      });
      await db.update(projectDesigns).set({ currentVersionId: designVersionId }).where(eq(projectDesigns.id, designId));

      const commentId = randomUUID();
      await db.insert(figmaComments).values({
        id: commentId,
        organizationId: authorTenant.organizationId,
        workspaceId: authorTenant.workspaceId,
        projectId: authorTenant.projectId,
        designVersionId,
        authorUserId: author.id,
        figmaFileKey: "file-key",
        figmaFileName: "Website",
        screenId: "1:2",
        screenName: "Home",
        xBasisPoints: 1000,
        yBasisPoints: 2000,
        body: "Please change this.",
        status: "open",
      });

      const input = {
        projectKey: project.id,
        designId,
        designVersionId,
        fileKey: "file-key",
        fileName: "Website",
        screenId: "1:2",
        screenName: "Home",
        figmaNodeId: null,
        figmaNodeName: null,
        x: 10,
        y: 20,
        selectionWidth: null,
        selectionHeight: null,
        category: "intent" as const,
        title: "Design intent",
        body: "This is durable implementation guidance.",
      };
      const draft = await createFigmaExplanation(authorTenant, { ...input, status: "draft" });
      const published = await createFigmaExplanation(authorTenant, { ...input, title: "Published intent", status: "published" });
      expect(published).toMatchObject({ screenName: "Canonical home screen" });

      await expect(createFigmaExplanation(authorTenant, {
        ...input,
        screenId: "missing-screen",
        status: "published",
      })).rejects.toMatchObject({ status: 404 });

      expect(await listFigmaExplanations(authorTenant, "file-key", "1:2", designVersionId)).toHaveLength(2);
      expect(await listFigmaExplanations(memberTenant, "file-key", "1:2", designVersionId)).toEqual([
        expect.objectContaining({ id: published.id, status: "published", canEdit: false }),
      ]);
      expect(await listFigmaExplanations(outsiderTenant, "file-key", "1:2", designVersionId)).toEqual([]);

      expect(await updateFigmaExplanation(memberTenant, {
        projectKey: project.id,
        id: published.id,
        title: "Silently replaced",
      })).toBeNull();
      expect(await deleteFigmaExplanation(memberTenant, draft.id)).toBe(false);

      const updated = await updateFigmaExplanation(authorTenant, {
        projectKey: project.id,
        id: draft.id,
        status: "published",
        x: 30,
        y: 40,
      });
      expect(updated).toMatchObject({ status: "published", x: 30, y: 40, canEdit: false });
      expect(await deleteFigmaExplanation(authorTenant, draft.id)).toBe(false);

      const returnedToDraft = await updateFigmaExplanation(authorTenant, {
        projectKey: project.id,
        id: published.id,
        status: "draft",
      });
      expect(returnedToDraft).toMatchObject({ status: "draft", canEdit: true, canMoveToDraft: false });
      expect(await listFigmaExplanations(memberTenant, "file-key", "1:2", designVersionId)).toEqual([
        expect.objectContaining({ id: draft.id, status: "published" }),
      ]);
      expect(await updateFigmaExplanation(authorTenant, {
        projectKey: project.id,
        id: published.id,
        title: "Published intent revised as a draft",
      })).toMatchObject({ status: "draft", canEdit: true });
      expect(await updateFigmaExplanation(authorTenant, {
        projectKey: project.id,
        id: published.id,
        status: "published",
      })).toMatchObject({ status: "published", canMoveToDraft: true });

      const comment = (await db.select().from(figmaComments).where(and(
        eq(figmaComments.id, commentId),
        eq(figmaComments.projectId, project.id),
      )).limit(1))[0];
      expect(comment).toMatchObject({ body: "Please change this.", status: "open" });

      await db.delete(users).where(eq(users.id, author.id));
      const afterAuthorRemoval = await listFigmaExplanations(memberTenant, "file-key", "1:2", designVersionId);
      expect(afterAuthorRemoval).toHaveLength(2);
      expect(afterAuthorRemoval).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: published.id, authorName: "Explanation Author", authorUserId: null, canEdit: false }),
        expect.objectContaining({ id: draft.id, authorName: "Explanation Author", authorUserId: null, canEdit: false }),
      ]));
    } finally {
      if (authorOrganizationId) await db.delete(organizations).where(eq(organizations.id, authorOrganizationId));
      if (outsiderOrganizationId) await db.delete(organizations).where(eq(organizations.id, outsiderOrganizationId));
      await db.delete(users).where(eq(users.id, author.id));
      await db.delete(users).where(eq(users.id, member.id));
      await db.delete(users).where(eq(users.id, outsider.id));
    }
  });
});
