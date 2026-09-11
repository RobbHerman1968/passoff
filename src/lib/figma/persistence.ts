import "server-only";

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";

import { db } from "@/db";
import {
  figmaImportBreakpointGroups,
  figmaImportInteractions,
  figmaImports,
  figmaImportScreens,
  figmaImportScreenTrees,
  projectDesigns,
  projectDesignVersions,
  revisionDesignVersions,
  users,
} from "@/db/schema";
import {
  PROJECT_DESIGN_VERSION_SCHEMA,
  projectDesignContentSha256,
  parseProjectDesignVersion,
  serializeProjectDesignVersion,
  type ProjectDesignVersionPayload,
} from "@/lib/projects/design-version";
import type { TenantContext } from "@/lib/tenant/context";
import {
  clearDesignVersionPreviews,
  clearFilePreviews,
  clearProjectPreviews,
  deletePreviewPng,
  isDataImageUrl,
  isStoredPreviewUrl,
  previewPublicUrl,
  readDesignVersionPreviewPng,
  designVersionPreviewPublicUrl,
  readPreviewPng,
  storePreviewFromUrl,
  writeDesignVersionPreviewPng,
} from "./preview-storage";
import { commonDesignName, deriveBreakpointLabel } from "./breakpoints";
import type { InspectNode } from "./inspect";
import type { FigmaImportResult, FigmaImportSource, FigmaSavedImportSummary, ProjectDesignBreakpoint, ProjectDesignSummary } from "./types";

export async function getProjectDesignVersion(
  tenant: TenantContext,
  designVersionId: string,
) {
  const row = (await db
    .select({
      design: projectDesigns,
      version: projectDesignVersions,
    })
    .from(projectDesignVersions)
    .innerJoin(projectDesigns, eq(projectDesigns.id, projectDesignVersions.designId))
    .where(and(
      eq(projectDesignVersions.id, designVersionId),
      eq(projectDesignVersions.organizationId, tenant.organizationId),
      eq(projectDesignVersions.workspaceId, tenant.workspaceId),
      eq(projectDesignVersions.projectId, tenant.projectId),
    ))
    .limit(1))[0];
  if (!row) return null;
  const payload = parseProjectDesignVersion(row.version.payloadJson);
  const groupById = new Map(payload.breakpointGroups.map((group) => [group.id, group]));
  const result: FigmaImportResult = {
    designId: row.design.id,
    designVersionId: row.version.id,
    versionNumber: row.version.versionNumber,
    file: {
      key: payload.file.key,
      name: payload.file.name,
      version: payload.file.sourceVersion ?? `version-${row.version.versionNumber}`,
      lastModified: payload.file.sourceLastModified ?? row.version.createdAt.toISOString(),
      thumbnailUrl: payload.file.thumbnailScreenId
        ? designVersionPreviewPublicUrl(row.version.id, payload.file.thumbnailScreenId, row.design.projectId)
        : null,
      mainScreenId: payload.file.mainScreenId,
    },
    screens: payload.screens.map((screen) => {
      const group = screen.breakpointGroupId ? groupById.get(screen.breakpointGroupId) : null;
      return {
        id: screen.id,
        name: screen.name,
        type: screen.type,
        imageUrl: screen.preview
          ? designVersionPreviewPublicUrl(row.version.id, screen.id, row.design.projectId)
          : null,
        width: screen.width,
        height: screen.height,
        x: screen.x,
        y: screen.y,
        interactionCount: screen.interactionCount,
        isMain: screen.id === payload.file.mainScreenId,
        breakpointGroupId: screen.breakpointGroupId,
        breakpointGroupName: group?.name ?? null,
        isGroupPrimary: group?.primaryScreenId === screen.id,
        breakpointLabel: deriveBreakpointLabel(screen.width, screen.name),
      };
    }),
    interactions: payload.interactions.map((interaction) => ({
      sourceNodeId: interaction.sourceNodeId,
      sourceNodeName: interaction.sourceNodeName,
      sourceScreenId: interaction.sourceScreenId,
      destinationNodeId: interaction.destinationNodeId,
      destinationScreenId: interaction.destinationScreenId,
      trigger: interaction.trigger,
      actions: Array.isArray(interaction.actions)
        ? interaction.actions.filter((action): action is string => typeof action === "string")
        : [],
      sourceBounds: interaction.sourceBounds.x === null
        || interaction.sourceBounds.y === null
        || interaction.sourceBounds.width === null
        || interaction.sourceBounds.height === null
        ? null
        : {
            x: interaction.sourceBounds.x,
            y: interaction.sourceBounds.y,
            width: interaction.sourceBounds.width,
            height: interaction.sourceBounds.height,
          },
    })),
    warnings: payload.warnings,
    importSource: row.design.sourceType === "figma" ? "api" : "upload",
  };
  return { ...row, payload, result };
}

export async function getCurrentProjectDesignVersion(
  tenant: TenantContext,
  designId: string,
) {
  const design = (await db
    .select({ currentVersionId: projectDesigns.currentVersionId })
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.id, designId),
      eq(projectDesigns.organizationId, tenant.organizationId),
      eq(projectDesigns.workspaceId, tenant.workspaceId),
      eq(projectDesigns.projectId, tenant.projectId),
    ))
    .limit(1))[0];
  if (!design?.currentVersionId) return null;
  return getProjectDesignVersion(tenant, design.currentVersionId);
}

export type ProjectDesignVersionSummary = {
  id: string;
  versionNumber: number;
  sourceVersion: string | null;
  sourceLastModified: string | null;
  createdAt: string;
  screenCount: number;
  previewBytes: number;
  isCurrent: boolean;
  isReferenced: boolean;
  canDelete: boolean;
};

export async function listProjectDesignVersions(
  tenant: TenantContext,
  designId: string,
): Promise<ProjectDesignVersionSummary[]> {
  const design = (await db
    .select({ id: projectDesigns.id, currentVersionId: projectDesigns.currentVersionId })
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.id, designId),
      eq(projectDesigns.organizationId, tenant.organizationId),
      eq(projectDesigns.workspaceId, tenant.workspaceId),
      eq(projectDesigns.projectId, tenant.projectId),
    ))
    .limit(1))[0];
  if (!design) throw new Error("Design file not found.");

  const versions = await db
    .select()
    .from(projectDesignVersions)
    .where(eq(projectDesignVersions.designId, design.id))
    .orderBy(desc(projectDesignVersions.versionNumber));
  const references = versions.length
    ? await db
        .select({ designVersionId: revisionDesignVersions.designVersionId })
        .from(revisionDesignVersions)
        .where(inArray(revisionDesignVersions.designVersionId, versions.map((version) => version.id)))
    : [];
  const referencedIds = new Set(references.map((reference) => reference.designVersionId));

  return versions.map((version) => {
    const payload = parseProjectDesignVersion(version.payloadJson);
    const isCurrent = version.id === design.currentVersionId;
    const isReferenced = referencedIds.has(version.id);
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      sourceVersion: version.sourceVersion,
      sourceLastModified: version.sourceLastModified?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      screenCount: payload.screens.length,
      previewBytes: payload.screens.reduce((total, screen) => total + (screen.preview?.bytes ?? 0), 0),
      isCurrent,
      isReferenced,
      canDelete: !isCurrent && !isReferenced,
    };
  });
}

export async function deleteProjectDesignVersion(
  tenant: TenantContext,
  designId: string,
  designVersionId: string,
) {
  const deleted = await db.transaction(async (tx) => {
    const design = (await tx
      .select()
      .from(projectDesigns)
      .where(and(
        eq(projectDesigns.id, designId),
        eq(projectDesigns.organizationId, tenant.organizationId),
        eq(projectDesigns.workspaceId, tenant.workspaceId),
        eq(projectDesigns.projectId, tenant.projectId),
      ))
      .for("update")
      .limit(1))[0];
    if (!design) throw new Error("Design file not found.");
    if (design.currentVersionId === designVersionId) {
      throw new Error("The current design version cannot be deleted.");
    }

    const version = (await tx
      .select()
      .from(projectDesignVersions)
      .where(and(
        eq(projectDesignVersions.id, designVersionId),
        eq(projectDesignVersions.designId, design.id),
      ))
      .limit(1))[0];
    if (!version) throw new Error("Design version not found.");
    const referenced = (await tx
      .select({ id: revisionDesignVersions.id })
      .from(revisionDesignVersions)
      .where(eq(revisionDesignVersions.designVersionId, version.id))
      .limit(1))[0];
    if (referenced) {
      throw new Error("This version is used by an approval room and cannot be deleted.");
    }

    await tx
      .delete(projectDesignVersions)
      .where(eq(projectDesignVersions.id, version.id));
    return {
      id: version.id,
      nodeIds: parseProjectDesignVersion(version.payloadJson).screens
        .filter((screen) => Boolean(screen.preview))
        .map((screen) => screen.id),
    };
  });

  await clearDesignVersionPreviews(tenant, designId, deleted.id, deleted.nodeIds);
  return { deleted: true, id: deleted.id };
}

export async function getProjectDesignIdBySourceKey(
  tenant: TenantContext,
  sourceKey: string,
) {
  return (await db
    .select({ id: projectDesigns.id })
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.organizationId, tenant.organizationId),
      eq(projectDesigns.workspaceId, tenant.workspaceId),
      eq(projectDesigns.projectId, tenant.projectId),
      eq(projectDesigns.sourceKey, sourceKey),
    ))
    .limit(1))[0]?.id ?? null;
}

async function materializeImportPreviews(tenant: TenantContext, result: FigmaImportResult, mode: "replace" | "append") {
  // Image uploads may already write durable preview files before save. Skip clearing when
  // those stored URLs are what we're persisting, otherwise replace would delete them first.
  const hasPrewrittenPreviews = result.screens.some((screen) => isStoredPreviewUrl(screen.imageUrl));
  if (mode === "replace" && !hasPrewrittenPreviews) await clearFilePreviews(tenant, result.file.key);

  const screens = await Promise.all(result.screens.map(async (screen) => ({
    ...screen,
    imageUrl: screen.imageUrl ? await storePreviewFromUrl(tenant, result.file.key, screen.id, screen.imageUrl) : null,
  })));

  let thumbnailUrl = result.file.thumbnailUrl;
  if (isDataImageUrl(thumbnailUrl)) {
    thumbnailUrl = screens[0]?.imageUrl ?? await storePreviewFromUrl(tenant, result.file.key, "__thumbnail__", thumbnailUrl);
  } else if (!thumbnailUrl && screens[0]?.imageUrl) {
    thumbnailUrl = screens[0].imageUrl;
  }

  return {
    ...result,
    file: { ...result.file, thumbnailUrl: thumbnailUrl ?? null },
    screens,
  };
}

async function migrateStoredPreviewUrl(
  tenant: TenantContext,
  fileKey: string,
  nodeId: string,
  imageUrl: string | null,
  update: (nextUrl: string) => Promise<void>,
) {
  if (isStoredPreviewUrl(imageUrl)) {
    const nextUrl = previewPublicUrl(fileKey, nodeId, tenant.projectId);
    if (nextUrl !== imageUrl) await update(nextUrl);
    return nextUrl;
  }
  if (!isDataImageUrl(imageUrl)) return imageUrl;
  const nextUrl = await storePreviewFromUrl(tenant, fileKey, nodeId, imageUrl);
  if (nextUrl && nextUrl !== imageUrl) await update(nextUrl);
  return nextUrl;
}

function integer(value: number | null) {
  return value === null ? null : Math.round(value);
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function resolveImportSource(value: string | null | undefined, version: string): FigmaImportSource {
  if (value === "created" || value === "upload" || value === "plugin" || value === "api") return value;
  if (version.startsWith("created-")) return "created";
  if (version.startsWith("upload-")) return "upload";
  // Plugin imports historically used synthetic versions like `plugin-<timestamp>`.
  if (version.startsWith("plugin-")) return "plugin";
  return "api";
}

export async function saveFigmaImport(
  tenant: TenantContext,
  connectionId: string | null,
  result: FigmaImportResult,
  options?: {
    mode?: "replace" | "append";
    source?: FigmaImportSource;
    inspectTrees?: Record<string, InspectNode>;
  },
) {
  const mode = options?.mode === "append" ? "append" : "replace";
  const importSource = options?.source ?? result.importSource ?? "api";
  const inspectTrees = options?.inspectTrees ?? {};
  const materialized = await materializeImportPreviews(tenant, result, mode);
  const now = new Date();
  const designProjectId = tenant.projectId;
  const sourceType = importSource === "upload" || importSource === "created" ? "image" : "figma";
  let identity = (await db
    .select()
    .from(projectDesigns)
    .where(and(
      eq(projectDesigns.projectId, designProjectId),
      eq(projectDesigns.sourceKey, materialized.file.key),
    ))
    .limit(1))[0];
  if (!identity) {
    identity = (await db.insert(projectDesigns).values({
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      projectId: designProjectId,
      sourceType,
      sourceKey: materialized.file.key,
      name: materialized.file.name,
    }).onConflictDoNothing().returning())[0];
    if (!identity) {
      identity = (await db
        .select()
        .from(projectDesigns)
        .where(and(
          eq(projectDesigns.projectId, designProjectId),
          eq(projectDesigns.sourceKey, materialized.file.key),
        ))
        .limit(1))[0];
    }
  }
  if (!identity) throw new Error("Unable to create the project design identity.");
  await db.update(projectDesigns).set({
    name: materialized.file.name,
    archivedAt: null,
    updatedAt: now,
  }).where(eq(projectDesigns.id, identity.id));

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${designProjectId}:${materialized.file.key}`}, 0))`);
    const design = (await tx
      .select()
      .from(projectDesigns)
      .where(and(
        eq(projectDesigns.id, identity.id),
        eq(projectDesigns.organizationId, tenant.organizationId),
        eq(projectDesigns.workspaceId, tenant.workspaceId),
        eq(projectDesigns.projectId, designProjectId),
      ))
      .for("update")
      .limit(1))[0];
    if (!design) throw new Error("Project design identity is outside the active tenant.");

    const saved = await tx.insert(figmaImports).values({
      id: randomUUID(),
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      projectId: designProjectId,
      figmaConnectionId: connectionId,
      importedByUserId: tenant.userId,
      figmaFileKey: materialized.file.key,
      figmaFileName: materialized.file.name,
      figmaVersion: materialized.file.version,
      importSource,
      figmaLastModified: new Date(materialized.file.lastModified),
      thumbnailUrl: materialized.file.thumbnailUrl,
      mainScreenId: materialized.file.mainScreenId ?? materialized.screens[0]?.id ?? null,
      warningsJson: JSON.stringify(materialized.warnings),
      screenCount: materialized.screens.length,
      previewCount: materialized.screens.filter((screen) => Boolean(screen.imageUrl)).length,
      interactionCount: materialized.interactions.length,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [figmaImports.projectId, figmaImports.figmaFileKey],
      set: {
        figmaConnectionId: connectionId,
        importedByUserId: tenant.userId,
        figmaFileName: materialized.file.name,
        figmaVersion: materialized.file.version,
        figmaLastModified: new Date(materialized.file.lastModified),
        warningsJson: JSON.stringify(materialized.warnings),
        screenCount: materialized.screens.length,
        previewCount: materialized.screens.filter((screen) => Boolean(screen.imageUrl)).length,
        interactionCount: materialized.interactions.length,
        updatedAt: now,
        // Preserve the original source when appending screens (e.g. images into a Figma file).
        ...(mode === "replace"
          ? {
              importSource,
              thumbnailUrl: materialized.file.thumbnailUrl,
              mainScreenId: materialized.file.mainScreenId ?? materialized.screens[0]?.id ?? null,
            }
          : {}),
      },
    }).returning({ id: figmaImports.id });
    const importId = saved[0].id;

    let screenSortStart = 0;
    let interactionSortStart = 0;
    if (mode === "replace") {
      await tx.delete(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, importId));
      await tx.delete(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, importId));
      await tx.delete(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.figmaImportId, importId));
      await tx.delete(figmaImportScreenTrees).where(eq(figmaImportScreenTrees.figmaImportId, importId));
    } else {
      const existingScreens = await tx.select({ sortOrder: figmaImportScreens.sortOrder }).from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, importId)).orderBy(desc(figmaImportScreens.sortOrder)).limit(1);
      const existingInteractions = await tx.select({ sortOrder: figmaImportInteractions.sortOrder }).from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, importId)).orderBy(desc(figmaImportInteractions.sortOrder)).limit(1);
      screenSortStart = (existingScreens[0]?.sortOrder ?? -1) + 1;
      interactionSortStart = (existingInteractions[0]?.sortOrder ?? -1) + 1;
    }

    if (materialized.screens.length) {
      await tx.insert(figmaImportScreens).values(materialized.screens.map((screen, sortOrder) => ({
        id: randomUUID(),
        figmaImportId: importId,
        figmaNodeId: screen.id,
        name: screen.name,
        type: screen.type,
        imageUrl: screen.imageUrl,
        width: integer(screen.width),
        height: integer(screen.height),
        x: integer(screen.x),
        y: integer(screen.y),
        interactionCount: screen.interactionCount,
        sortOrder: screenSortStart + sortOrder,
      })));
    }
    if (materialized.interactions.length) {
      for (let start = 0; start < materialized.interactions.length; start += 250) {
        await tx.insert(figmaImportInteractions).values(materialized.interactions.slice(start, start + 250).map((interaction, offset) => ({
          id: randomUUID(),
          figmaImportId: importId,
          sourceNodeId: interaction.sourceNodeId,
          sourceNodeName: interaction.sourceNodeName,
          sourceScreenId: interaction.sourceScreenId,
          destinationNodeId: interaction.destinationNodeId,
          destinationScreenId: interaction.destinationScreenId,
          trigger: interaction.trigger,
          actionsJson: JSON.stringify(interaction.actions),
          sourceX: integer(interaction.sourceBounds?.x ?? null),
          sourceY: integer(interaction.sourceBounds?.y ?? null),
          sourceWidth: integer(interaction.sourceBounds?.width ?? null),
          sourceHeight: integer(interaction.sourceBounds?.height ?? null),
          sortOrder: interactionSortStart + start + offset,
        })));
      }
    }

    const treeEntries = Object.entries(inspectTrees);
    if (treeEntries.length) {
      for (const [figmaNodeId, tree] of treeEntries) {
        await tx.insert(figmaImportScreenTrees).values({
          id: randomUUID(),
          figmaImportId: importId,
          figmaNodeId,
          treeJson: JSON.stringify(tree),
          source: "import",
          createdAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [figmaImportScreenTrees.figmaImportId, figmaImportScreenTrees.figmaNodeId],
          set: {
            treeJson: JSON.stringify(tree),
            source: "import",
            updatedAt: now,
          },
        });
      }
    }

    if (mode === "append") {
      const screens = await tx.select({ id: figmaImportScreens.id, imageUrl: figmaImportScreens.imageUrl }).from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, importId));
      const interactions = await tx.select({ id: figmaImportInteractions.id }).from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, importId));
      await tx.update(figmaImports).set({
        screenCount: screens.length,
        previewCount: screens.filter((screen) => Boolean(screen.imageUrl)).length,
        interactionCount: interactions.length,
        updatedAt: now,
        ...(materialized.file.thumbnailUrl && !isDataImageUrl(materialized.file.thumbnailUrl) ? { thumbnailUrl: materialized.file.thumbnailUrl } : {}),
      }).where(eq(figmaImports.id, importId));
    }

    const [importRecord, persistedScreens, persistedInteractions, persistedGroups, persistedTrees] = await Promise.all([
      tx.select().from(figmaImports).where(eq(figmaImports.id, importId)).limit(1).then((rows) => rows[0]),
      tx.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, importId)).orderBy(asc(figmaImportScreens.sortOrder)),
      tx.select().from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, importId)).orderBy(asc(figmaImportInteractions.sortOrder)),
      tx.select().from(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.figmaImportId, importId)).orderBy(asc(figmaImportBreakpointGroups.id)),
      tx.select().from(figmaImportScreenTrees).where(eq(figmaImportScreenTrees.figmaImportId, importId)).orderBy(asc(figmaImportScreenTrees.figmaNodeId)),
    ]);
    if (!importRecord) throw new Error("Saved Figma import could not be reloaded.");

    const previewBytes = new Map<string, Buffer>();
    const normalizedScreens = await Promise.all(persistedScreens.map(async (screen) => {
      const bytes = screen.imageUrl
        ? await readPreviewPng(tenant, importRecord.figmaFileKey, screen.figmaNodeId)
        : null;
      if (bytes) previewBytes.set(screen.figmaNodeId, bytes);
      return {
        id: screen.figmaNodeId,
        name: screen.name,
        type: screen.type,
        width: screen.width,
        height: screen.height,
        x: screen.x,
        y: screen.y,
        interactionCount: screen.interactionCount,
        sortOrder: screen.sortOrder,
        breakpointGroupId: screen.breakpointGroupId,
        preview: bytes ? {
          nodeId: screen.figmaNodeId,
          contentType: "image/png" as const,
          bytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        } : null,
      };
    }));
    let payload: ProjectDesignVersionPayload = {
      schemaVersion: PROJECT_DESIGN_VERSION_SCHEMA,
      sourceType: "figma",
      file: {
        key: importRecord.figmaFileKey,
        name: importRecord.figmaFileName,
        sourceVersion: importRecord.figmaVersion,
        sourceLastModified: importRecord.figmaLastModified.toISOString(),
        mainScreenId: importRecord.mainScreenId,
        thumbnailScreenId: importRecord.mainScreenId ?? normalizedScreens[0]?.id ?? null,
      },
      screens: normalizedScreens,
      interactions: persistedInteractions.map((interaction) => ({
        sourceNodeId: interaction.sourceNodeId,
        sourceNodeName: interaction.sourceNodeName,
        sourceScreenId: interaction.sourceScreenId,
        destinationNodeId: interaction.destinationNodeId,
        destinationScreenId: interaction.destinationScreenId,
        trigger: interaction.trigger,
        actions: JSON.parse(interaction.actionsJson) as unknown,
        sourceBounds: {
          x: interaction.sourceX,
          y: interaction.sourceY,
          width: interaction.sourceWidth,
          height: interaction.sourceHeight,
        },
        sortOrder: interaction.sortOrder,
      })),
      breakpointGroups: persistedGroups.map((group) => ({
        id: group.id,
        name: group.name,
        primaryScreenId: group.primaryScreenId,
        memberScreenIds: persistedScreens
          .filter((screen) => screen.breakpointGroupId === group.id)
          .map((screen) => screen.figmaNodeId),
      })),
      inspectTrees: persistedTrees.map((tree) => ({
        screenId: tree.figmaNodeId,
        source: tree.source,
        tree: JSON.parse(tree.treeJson) as unknown,
      })),
      warnings: parseStringArray(importRecord.warningsJson),
    };
    const currentVersion = design.currentVersionId
      ? (await tx.select().from(projectDesignVersions).where(eq(projectDesignVersions.id, design.currentVersionId)).limit(1))[0]
      : null;
    if (payload.screens.length === 0 && materialized.screens.length > 0) {
      const submittedScreens = await Promise.all(materialized.screens.map(async (screen, sortOrder) => {
        const bytes = screen.imageUrl
          ? await readPreviewPng(tenant, materialized.file.key, screen.id)
          : null;
        if (bytes) previewBytes.set(screen.id, bytes);
        return {
          id: screen.id,
          name: screen.name,
          type: screen.type,
          width: integer(screen.width),
          height: integer(screen.height),
          x: integer(screen.x),
          y: integer(screen.y),
          interactionCount: screen.interactionCount,
          sortOrder,
          breakpointGroupId: screen.breakpointGroupId ?? null,
          preview: bytes ? {
            nodeId: screen.id,
            contentType: "image/png" as const,
            bytes: bytes.byteLength,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          } : null,
        };
      }));
      payload = {
        ...payload,
        file: {
          ...payload.file,
          mainScreenId: materialized.file.mainScreenId ?? submittedScreens[0]?.id ?? null,
          thumbnailScreenId: materialized.file.mainScreenId ?? submittedScreens[0]?.id ?? null,
        },
        screens: submittedScreens,
        interactions: materialized.interactions.map((interaction, sortOrder) => ({
          ...interaction,
          sourceBounds: {
            x: interaction.sourceBounds?.x ?? null,
            y: interaction.sourceBounds?.y ?? null,
            width: interaction.sourceBounds?.width ?? null,
            height: interaction.sourceBounds?.height ?? null,
          },
          sortOrder,
        })),
        inspectTrees: Object.entries(inspectTrees)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([screenId, tree]) => ({
            screenId,
            source: "import",
            tree: JSON.parse(JSON.stringify(tree)) as unknown,
          })),
      };
    }
    if (mode === "append" && currentVersion) {
      const previous = parseProjectDesignVersion(currentVersion.payloadJson);
      const submittedIds = new Set(payload.screens.map((screen) => screen.id));
      const inspectIds = new Set(payload.inspectTrees.map((tree) => tree.screenId));
      for (const screen of previous.screens) {
        if (!screen.preview || submittedIds.has(screen.id)) continue;
        const bytes = await readDesignVersionPreviewPng(
          tenant,
          design.id,
          currentVersion.id,
          screen.id,
        );
        if (bytes) previewBytes.set(screen.id, bytes);
      }
      payload = {
        ...payload,
        screens: [
          ...previous.screens.filter((screen) => !submittedIds.has(screen.id)),
          ...payload.screens,
        ].map((screen, sortOrder) => ({ ...screen, sortOrder })),
        interactions: [...previous.interactions, ...payload.interactions]
          .map((interaction, sortOrder) => ({ ...interaction, sortOrder })),
        breakpointGroups: payload.breakpointGroups.length
          ? payload.breakpointGroups
          : previous.breakpointGroups,
        inspectTrees: [
          ...previous.inspectTrees.filter((tree) => !inspectIds.has(tree.screenId)),
          ...payload.inspectTrees,
        ],
      };
    }
    // Plugin REST trees contain optional object properties. JSON normalization
    // removes absent properties before strict canonical serialization.
    payload = JSON.parse(JSON.stringify(payload)) as ProjectDesignVersionPayload;
    const contentSha256 = projectDesignContentSha256(payload);
    if (currentVersion?.contentSha256 === contentSha256) {
      return {
        importId,
        designId: design.id,
        designVersionId: currentVersion.id,
        versionNumber: currentVersion.versionNumber,
      };
    }

    const latest = (await tx
      .select({ versionNumber: projectDesignVersions.versionNumber })
      .from(projectDesignVersions)
      .where(eq(projectDesignVersions.designId, design.id))
      .orderBy(desc(projectDesignVersions.versionNumber))
      .limit(1))[0];
    const designVersionId = randomUUID();
    for (const [nodeId, bytes] of previewBytes) {
      await writeDesignVersionPreviewPng(tenant, design.id, designVersionId, nodeId, bytes);
    }
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    await tx.insert(projectDesignVersions).values({
      id: designVersionId,
      organizationId: design.organizationId,
      workspaceId: design.workspaceId,
      projectId: design.projectId,
      designId: design.id,
      versionNumber,
      sourceVersion: importRecord.figmaVersion,
      sourceLastModified: importRecord.figmaLastModified,
      contentSha256,
      payloadJson: serializeProjectDesignVersion(payload),
      createdByUserId: tenant.userId,
    });
    await tx.update(projectDesigns).set({
      currentVersionId: designVersionId,
      name: importRecord.figmaFileName,
      updatedAt: now,
    }).where(eq(projectDesigns.id, design.id));

    return { importId, designId: design.id, designVersionId, versionNumber };
  });
}

export async function listFigmaImports(tenant: TenantContext): Promise<FigmaSavedImportSummary[]> {
  const rows = await db
    .select({
      record: figmaImports,
      designId: projectDesigns.id,
      designVersionId: projectDesignVersions.id,
      versionNumber: projectDesignVersions.versionNumber,
      importedByName: users.name,
      importedByEmail: users.email,
    })
    .from(figmaImports)
    .innerJoin(projectDesigns, and(
      eq(projectDesigns.projectId, figmaImports.projectId),
      eq(projectDesigns.sourceKey, figmaImports.figmaFileKey),
    ))
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
    .leftJoin(users, eq(figmaImports.importedByUserId, users.id))
    .where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId)))
    .orderBy(desc(figmaImports.updatedAt));
  return Promise.all(rows.map(async ({ record, designId, designVersionId, versionNumber, importedByName, importedByEmail }) => {
    const thumbnailUrl = await migrateStoredPreviewUrl(
      tenant,
      record.figmaFileKey,
      record.mainScreenId || "__thumbnail__",
      record.thumbnailUrl,
      async (nextUrl) => {
        await db.update(figmaImports).set({ thumbnailUrl: nextUrl, updatedAt: new Date() }).where(eq(figmaImports.id, record.id));
      },
    );
    return {
      id: record.id,
      designId,
      designVersionId,
      versionNumber,
      fileKey: record.figmaFileKey,
      fileName: record.figmaFileName,
      version: record.figmaVersion,
      lastModified: record.figmaLastModified.toISOString(),
      thumbnailUrl,
      screenCount: record.screenCount,
      previewCount: record.previewCount,
      interactionCount: record.interactionCount,
      importedAt: record.updatedAt.toISOString(),
      importedBy: importedByName || importedByEmail || "Former member",
      importSource: resolveImportSource(record.importSource, record.figmaVersion),
    };
  }));
}

/** Removes every imported Figma file (and related screens/groups/previews) for the project. */
export async function deleteAllFigmaImports(tenant: TenantContext) {
  const projectId = tenant.projectId;
  await db.transaction(async (tx) => {
    const designs = await tx
      .select({ id: projectDesigns.id })
      .from(projectDesigns)
      .where(and(
        eq(projectDesigns.organizationId, tenant.organizationId),
        eq(projectDesigns.workspaceId, tenant.workspaceId),
        eq(projectDesigns.projectId, projectId),
      ));
    for (const design of designs) {
      const referenced = (await tx
        .select({ id: revisionDesignVersions.id })
        .from(revisionDesignVersions)
        .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
        .where(eq(projectDesignVersions.designId, design.id))
        .limit(1))[0];
      if (referenced) {
        await tx.update(projectDesigns).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(projectDesigns.id, design.id));
      } else {
        await tx.delete(projectDesigns).where(eq(projectDesigns.id, design.id));
      }
    }
    await tx.delete(figmaImports).where(and(
      eq(figmaImports.organizationId, tenant.organizationId),
      eq(figmaImports.projectId, projectId),
    ));
  });
  await clearProjectPreviews(tenant);
}

/**
 * Removes screens from the current canonical design by creating a new immutable
 * version. Older versions remain available to room revisions that reference them.
 */
export async function deleteProjectDesignScreens(
  tenant: TenantContext,
  designId: string,
  expectedVersionId: string,
  screenIds: string[],
) {
  const uniqueScreenIds = [...new Set(screenIds.filter(Boolean))];
  if (!uniqueScreenIds.length) throw new Error("Select at least one design to delete.");

  const projectId = tenant.projectId;
  const deletedFileKeys = new Set<string>();

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${designId}, 0))`);
    const row = (await tx
      .select({ design: projectDesigns, version: projectDesignVersions })
      .from(projectDesigns)
      .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
      .where(and(
        eq(projectDesigns.id, designId),
        eq(projectDesigns.organizationId, tenant.organizationId),
        eq(projectDesigns.workspaceId, tenant.workspaceId),
        eq(projectDesigns.projectId, projectId),
        sql`${projectDesigns.archivedAt} is null`,
      ))
      .for("update")
      .limit(1))[0];
    if (!row) throw new Error("Project design not found.");
    if (row.version.id !== expectedVersionId) {
      throw new Error("This design changed after the page loaded. Refresh and try again.");
    }

    const payload = parseProjectDesignVersion(row.version.payloadJson);
    const existingIds = new Set(payload.screens.map((screen) => screen.id));
    if (uniqueScreenIds.some((screenId) => !existingIds.has(screenId))) {
      throw new Error("One or more selected designs were not found.");
    }
    const removedIds = new Set(uniqueScreenIds);
    const remainingScreens = payload.screens.filter((screen) => !removedIds.has(screen.id));
    deletedFileKeys.add(payload.file.key);

    if (!remainingScreens.length) {
      const referenced = (await tx
        .select({ id: revisionDesignVersions.id })
        .from(revisionDesignVersions)
        .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, revisionDesignVersions.designVersionId))
        .where(eq(projectDesignVersions.designId, row.design.id))
        .limit(1))[0];
      if (referenced) {
        await tx.update(projectDesigns).set({
          archivedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(projectDesigns.id, row.design.id));
      } else {
        await tx.delete(projectDesigns).where(eq(projectDesigns.id, row.design.id));
      }
      await tx.delete(figmaImports).where(and(
        eq(figmaImports.organizationId, tenant.organizationId),
        eq(figmaImports.projectId, projectId),
        eq(figmaImports.figmaFileKey, payload.file.key),
      ));
      return { deleted: true, designVersionId: null, versionNumber: null };
    }

    const nextScreenIds = new Set(remainingScreens.map((screen) => screen.id));
    const breakpointGroups = payload.breakpointGroups.flatMap((group) => {
      const memberScreenIds = group.memberScreenIds.filter((id) => nextScreenIds.has(id));
      if (memberScreenIds.length < 2) return [];
      return [{
        ...group,
        memberScreenIds,
        primaryScreenId: memberScreenIds.includes(group.primaryScreenId)
          ? group.primaryScreenId
          : memberScreenIds[0],
      }];
    });
    const activeGroupIds = new Set(breakpointGroups.map((group) => group.id));
    const interactions = payload.interactions
      .filter((interaction) => (
        !removedIds.has(interaction.sourceScreenId)
        && (!interaction.destinationScreenId || !removedIds.has(interaction.destinationScreenId))
      ))
      .map((interaction, sortOrder) => ({ ...interaction, sortOrder }));
    const interactionCounts = new Map<string, number>();
    for (const interaction of interactions) {
      interactionCounts.set(
        interaction.sourceScreenId,
        (interactionCounts.get(interaction.sourceScreenId) ?? 0) + 1,
      );
    }
    const screens = remainingScreens.map((screen, sortOrder) => ({
      ...screen,
      sortOrder,
      interactionCount: interactionCounts.get(screen.id) ?? 0,
      breakpointGroupId: screen.breakpointGroupId && activeGroupIds.has(screen.breakpointGroupId)
        ? screen.breakpointGroupId
        : null,
    }));
    const mainScreenId = payload.file.mainScreenId && nextScreenIds.has(payload.file.mainScreenId)
      ? payload.file.mainScreenId
      : screens[0].id;
    const thumbnailScreenId = payload.file.thumbnailScreenId && nextScreenIds.has(payload.file.thumbnailScreenId)
      ? payload.file.thumbnailScreenId
      : mainScreenId;
    const nextPayload: ProjectDesignVersionPayload = {
      ...payload,
      file: { ...payload.file, mainScreenId, thumbnailScreenId },
      screens,
      interactions,
      breakpointGroups,
      inspectTrees: payload.inspectTrees.filter((tree) => nextScreenIds.has(tree.screenId)),
    };
    const designVersionId = randomUUID();
    for (const screen of screens) {
      if (!screen.preview) continue;
      const bytes = await readDesignVersionPreviewPng(
        tenant,
        row.design.id,
        row.version.id,
        screen.id,
      );
      if (bytes) {
        await writeDesignVersionPreviewPng(
          tenant,
          row.design.id,
          designVersionId,
          screen.id,
          bytes,
        );
      }
    }

    const latest = (await tx
      .select({ versionNumber: projectDesignVersions.versionNumber })
      .from(projectDesignVersions)
      .where(eq(projectDesignVersions.designId, row.design.id))
      .orderBy(desc(projectDesignVersions.versionNumber))
      .limit(1))[0];
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const now = new Date();
    await tx.insert(projectDesignVersions).values({
      id: designVersionId,
      organizationId: row.design.organizationId,
      workspaceId: row.design.workspaceId,
      projectId: row.design.projectId,
      designId: row.design.id,
      versionNumber,
      sourceVersion: row.version.sourceVersion,
      sourceLastModified: row.version.sourceLastModified,
      contentSha256: projectDesignContentSha256(nextPayload),
      payloadJson: serializeProjectDesignVersion(nextPayload),
      createdByUserId: tenant.userId,
      createdAt: now,
    });
    await tx.update(projectDesigns).set({
      currentVersionId: designVersionId,
      updatedAt: now,
    }).where(eq(projectDesigns.id, row.design.id));

    const importRecord = (await tx.select().from(figmaImports).where(and(
      eq(figmaImports.organizationId, tenant.organizationId),
      eq(figmaImports.projectId, projectId),
      eq(figmaImports.figmaFileKey, payload.file.key),
    )).limit(1))[0];
    if (importRecord) {
      await tx.delete(figmaImportScreens).where(and(
        eq(figmaImportScreens.figmaImportId, importRecord.id),
        inArray(figmaImportScreens.figmaNodeId, uniqueScreenIds),
      ));
      await tx.delete(figmaImportInteractions).where(and(
        eq(figmaImportInteractions.figmaImportId, importRecord.id),
        or(
          inArray(figmaImportInteractions.sourceScreenId, uniqueScreenIds),
          inArray(figmaImportInteractions.destinationScreenId, uniqueScreenIds),
        ),
      ));
      await tx.delete(figmaImportBreakpointGroups).where(eq(
        figmaImportBreakpointGroups.figmaImportId,
        importRecord.id,
      ));
      for (const screen of screens) {
        await tx.update(figmaImportScreens).set({
          breakpointGroupId: screen.breakpointGroupId,
          interactionCount: screen.interactionCount,
          sortOrder: screen.sortOrder,
        }).where(and(
          eq(figmaImportScreens.figmaImportId, importRecord.id),
          eq(figmaImportScreens.figmaNodeId, screen.id),
        ));
      }
      if (breakpointGroups.length) {
        await tx.insert(figmaImportBreakpointGroups).values(breakpointGroups.map((group) => ({
          id: group.id,
          figmaImportId: importRecord.id,
          name: group.name,
          primaryScreenId: group.primaryScreenId,
          createdAt: now,
          updatedAt: now,
        })));
      }
      const thumbnail = (await tx.select({ imageUrl: figmaImportScreens.imageUrl })
        .from(figmaImportScreens)
        .where(and(
          eq(figmaImportScreens.figmaImportId, importRecord.id),
          eq(figmaImportScreens.figmaNodeId, thumbnailScreenId),
        ))
        .limit(1))[0];
      await tx.update(figmaImports).set({
        mainScreenId,
        thumbnailUrl: thumbnail?.imageUrl ?? null,
        screenCount: screens.length,
        previewCount: screens.filter((screen) => Boolean(screen.preview)).length,
        interactionCount: interactions.length,
        updatedAt: now,
      }).where(eq(figmaImports.id, importRecord.id));
    }

    return { deleted: true, designVersionId, versionNumber };
  });

  for (const fileKey of deletedFileKeys) {
    for (const screenId of uniqueScreenIds) {
      await deletePreviewPng(tenant, fileKey, screenId);
    }
  }
  return result;
}

async function listCanonicalProjectDesigns(tenant: TenantContext): Promise<ProjectDesignSummary[]> {
  const rows = await db
    .select({
      design: projectDesigns,
      version: projectDesignVersions,
    })
    .from(projectDesigns)
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
    .where(and(
      eq(projectDesigns.organizationId, tenant.organizationId),
      eq(projectDesigns.workspaceId, tenant.workspaceId),
      eq(projectDesigns.projectId, tenant.projectId),
      sql`${projectDesigns.archivedAt} is null`,
    ))
    .orderBy(asc(projectDesigns.name));

  const cards: ProjectDesignSummary[] = [];
  for (const { design, version } of rows) {
    const payload = parseProjectDesignVersion(version.payloadJson);
    const usedScreens = new Set<string>();
    for (const group of payload.breakpointGroups) {
      const members = group.memberScreenIds
        .map((id) => payload.screens.find((screen) => screen.id === id))
        .filter((screen): screen is ProjectDesignVersionPayload["screens"][number] => Boolean(screen));
      if (members.length < 2) continue;
      members.forEach((screen) => usedScreens.add(screen.id));
      const cover = members.find((screen) => screen.id === group.primaryScreenId) ?? members[0];
      cards.push({
        key: group.id,
        designId: design.id,
        designVersionId: version.id,
        versionNumber: version.versionNumber,
        name: group.name,
        fileKey: payload.file.key,
        fileName: payload.file.name,
        imageUrl: cover.preview
          ? designVersionPreviewPublicUrl(version.id, cover.id, design.projectId)
          : null,
        width: cover.width,
        height: cover.height,
        isMain: members.some((screen) => screen.id === payload.file.mainScreenId),
        isCombined: true,
        groupId: group.id,
        breakpoints: members.map((screen) => ({
          id: screen.id,
          name: screen.name,
          imageUrl: screen.preview
            ? designVersionPreviewPublicUrl(version.id, screen.id, design.projectId)
            : null,
          width: screen.width,
          height: screen.height,
          breakpointLabel: deriveBreakpointLabel(screen.width, screen.name),
          isPrimary: screen.id === cover.id,
        })),
        sortOrder: Math.min(...members.map((screen) => screen.sortOrder)),
      });
    }
    for (const screen of payload.screens.filter((item) => !usedScreens.has(item.id))) {
      cards.push({
        key: `${design.id}:${screen.id}`,
        designId: design.id,
        designVersionId: version.id,
        versionNumber: version.versionNumber,
        name: screen.name,
        fileKey: payload.file.key,
        fileName: payload.file.name,
        imageUrl: screen.preview
          ? designVersionPreviewPublicUrl(version.id, screen.id, design.projectId)
          : null,
        width: screen.width,
        height: screen.height,
        isMain: screen.id === payload.file.mainScreenId,
        isCombined: false,
        groupId: null,
        breakpoints: [{
          id: screen.id,
          name: screen.name,
          imageUrl: screen.preview
            ? designVersionPreviewPublicUrl(version.id, screen.id, design.projectId)
            : null,
          width: screen.width,
          height: screen.height,
          breakpointLabel: deriveBreakpointLabel(screen.width, screen.name),
          isPrimary: true,
        }],
        sortOrder: screen.sortOrder,
      });
    }
    if (payload.screens.length === 0) {
      cards.push({
        key: design.id,
        designId: design.id,
        designVersionId: version.id,
        versionNumber: version.versionNumber,
        name: design.name,
        fileKey: payload.file.key,
        fileName: payload.file.name,
        imageUrl: null,
        width: null,
        height: null,
        isMain: true,
        isCombined: false,
        groupId: null,
        breakpoints: [],
        sortOrder: 0,
      });
    }
  }
  return cards.sort((left, right) => {
    if (left.isMain !== right.isMain) return left.isMain ? -1 : 1;
    return left.fileName.localeCompare(right.fileName) || left.sortOrder - right.sortOrder;
  });
}

export async function listProjectDesigns(tenant: TenantContext): Promise<ProjectDesignSummary[]> {
  const canonical = await listCanonicalProjectDesigns(tenant);
  if (canonical.length) return canonical;
  const rows = await db
    .select({
      screen: figmaImportScreens,
      fileKey: figmaImports.figmaFileKey,
      fileName: figmaImports.figmaFileName,
      mainScreenId: figmaImports.mainScreenId,
      importId: figmaImports.id,
      designId: projectDesigns.id,
      designVersionId: projectDesignVersions.id,
      versionNumber: projectDesignVersions.versionNumber,
    })
    .from(figmaImportScreens)
    .innerJoin(figmaImports, eq(figmaImportScreens.figmaImportId, figmaImports.id))
    .innerJoin(projectDesigns, and(
      eq(projectDesigns.projectId, figmaImports.projectId),
      eq(projectDesigns.sourceKey, figmaImports.figmaFileKey),
    ))
    .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
    .where(and(
      eq(figmaImports.organizationId, tenant.organizationId),
      eq(figmaImports.projectId, tenant.projectId),
    ))
    .orderBy(asc(figmaImports.figmaFileName), asc(figmaImportScreens.sortOrder));

  const importIds = [...new Set(rows.map((row) => row.importId))];
  const groups = importIds.length
    ? await db.select().from(figmaImportBreakpointGroups).where(inArray(figmaImportBreakpointGroups.figmaImportId, importIds))
    : [];
  const groupById = new Map(groups.map((group) => [group.id, group]));

  type ScreenRow = {
    id: string;
    name: string;
    imageUrl: string | null;
    width: number | null;
    height: number | null;
    fileKey: string;
    fileName: string;
    designId: string;
    designVersionId: string;
    versionNumber: number;
    mainScreenId: string | null;
    sortOrder: number;
    breakpointGroupId: string | null;
  };

  const screens: ScreenRow[] = await Promise.all(rows.map(async ({
    screen,
    fileKey,
    fileName,
    designId,
    designVersionId,
    versionNumber,
    mainScreenId,
  }) => {
    const imageUrl = await migrateStoredPreviewUrl(
      tenant,
      fileKey,
      screen.figmaNodeId,
      screen.imageUrl,
      async (nextUrl) => {
        await db.update(figmaImportScreens).set({ imageUrl: nextUrl }).where(eq(figmaImportScreens.id, screen.id));
      },
    );
    return {
      id: screen.figmaNodeId,
      name: screen.name,
      imageUrl,
      width: screen.width,
      height: screen.height,
      fileKey,
      fileName,
      designId,
      designVersionId,
      versionNumber,
      mainScreenId,
      sortOrder: screen.sortOrder,
      breakpointGroupId: screen.breakpointGroupId,
    };
  }));

  const firstIdByFile = new Map<string, string>();
  for (const screen of screens) {
    if (!firstIdByFile.has(screen.fileKey)) firstIdByFile.set(screen.fileKey, screen.id);
  }

  const byGroup = new Map<string, ScreenRow[]>();
  const singles: ScreenRow[] = [];
  for (const screen of screens) {
    if (screen.breakpointGroupId) {
      const current = byGroup.get(screen.breakpointGroupId) ?? [];
      current.push(screen);
      byGroup.set(screen.breakpointGroupId, current);
    } else {
      singles.push(screen);
    }
  }

  function toBreakpoint(screen: ScreenRow, isPrimary: boolean): ProjectDesignBreakpoint {
    return {
      id: screen.id,
      name: screen.name,
      imageUrl: screen.imageUrl,
      width: screen.width,
      height: screen.height,
      breakpointLabel: deriveBreakpointLabel(screen.width, screen.name),
      isPrimary,
    };
  }

  function isScreenMain(screen: ScreenRow) {
    return screen.mainScreenId
      ? screen.id === screen.mainScreenId
      : firstIdByFile.get(screen.fileKey) === screen.id;
  }

  const cards: ProjectDesignSummary[] = [];

  for (const [groupId, members] of byGroup) {
    if (members.length < 2) {
      singles.push(...members);
      continue;
    }
    const group = groupById.get(groupId);
    const ordered = [...members].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const cover = ordered.find((screen) => group?.primaryScreenId === screen.id)
      ?? ordered.find((screen) => isScreenMain(screen))
      ?? ordered[0];
    const breakpoints = ordered.map((screen) => toBreakpoint(screen, screen.id === cover.id));
    cards.push({
      key: groupId,
      designId: cover.designId,
      designVersionId: cover.designVersionId,
      versionNumber: cover.versionNumber,
      name: group?.name || commonDesignName(ordered.map((screen) => screen.name)),
      fileKey: cover.fileKey,
      fileName: cover.fileName,
      imageUrl: cover.imageUrl,
      width: cover.width,
      height: cover.height,
      isMain: ordered.some((screen) => isScreenMain(screen)),
      isCombined: true,
      groupId,
      breakpoints,
      sortOrder: Math.min(...ordered.map((screen) => screen.sortOrder)),
    });
  }

  for (const screen of singles) {
    cards.push({
      key: `${screen.fileKey}:${screen.id}`,
      designId: screen.designId,
      designVersionId: screen.designVersionId,
      versionNumber: screen.versionNumber,
      name: screen.name,
      fileKey: screen.fileKey,
      fileName: screen.fileName,
      imageUrl: screen.imageUrl,
      width: screen.width,
      height: screen.height,
      isMain: isScreenMain(screen),
      isCombined: false,
      groupId: null,
      breakpoints: [toBreakpoint(screen, true)],
      sortOrder: screen.sortOrder,
    });
  }

  return cards.sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    const byFile = a.fileName.localeCompare(b.fileName);
    if (byFile !== 0) return byFile;
    return a.name.localeCompare(b.name);
  });
}

export async function getFigmaImport(tenant: TenantContext, fileKey: string): Promise<FigmaImportResult | null> {
  const record = (await db.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
  if (!record) return null;
  const [screens, interactions, groups, identity] = await Promise.all([
    db.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, record.id)).orderBy(asc(figmaImportScreens.sortOrder)),
    db.select().from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, record.id)).orderBy(asc(figmaImportInteractions.sortOrder)),
    db.select().from(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.figmaImportId, record.id)),
    db
      .select({
        designId: projectDesigns.id,
        designVersionId: projectDesignVersions.id,
        versionNumber: projectDesignVersions.versionNumber,
      })
      .from(projectDesigns)
      .innerJoin(projectDesignVersions, eq(projectDesignVersions.id, projectDesigns.currentVersionId))
      .where(and(
        eq(projectDesigns.projectId, tenant.projectId),
        eq(projectDesigns.sourceKey, fileKey),
      ))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const migratedScreens = await Promise.all(screens.map(async (screen) => {
    const imageUrl = await migrateStoredPreviewUrl(
      tenant,
      fileKey,
      screen.figmaNodeId,
      screen.imageUrl,
      async (nextUrl) => {
        await db.update(figmaImportScreens).set({ imageUrl: nextUrl }).where(eq(figmaImportScreens.id, screen.id));
      },
    );
    return { ...screen, imageUrl };
  }));

  const thumbnailUrl = await migrateStoredPreviewUrl(
    tenant,
    fileKey,
    record.mainScreenId || migratedScreens[0]?.figmaNodeId || "__thumbnail__",
    record.thumbnailUrl,
    async (nextUrl) => {
      await db.update(figmaImports).set({ thumbnailUrl: nextUrl, updatedAt: new Date() }).where(eq(figmaImports.id, record.id));
    },
  );

  return {
    designId: identity?.designId,
    designVersionId: identity?.designVersionId,
    versionNumber: identity?.versionNumber,
    file: {
      key: record.figmaFileKey,
      name: record.figmaFileName,
      version: record.figmaVersion,
      lastModified: record.figmaLastModified.toISOString(),
      thumbnailUrl: thumbnailUrl ?? migratedScreens[0]?.imageUrl ?? null,
      mainScreenId: record.mainScreenId,
    },
    screens: migratedScreens.map((screen) => {
      const group = screen.breakpointGroupId ? groupById.get(screen.breakpointGroupId) : null;
      return {
        id: screen.figmaNodeId,
        name: screen.name,
        type: screen.type,
        imageUrl: screen.imageUrl,
        width: screen.width,
        height: screen.height,
        x: screen.x,
        y: screen.y,
        interactionCount: screen.interactionCount,
        isMain: record.mainScreenId ? screen.figmaNodeId === record.mainScreenId : migratedScreens[0]?.figmaNodeId === screen.figmaNodeId,
        breakpointGroupId: screen.breakpointGroupId,
        breakpointGroupName: group?.name ?? null,
        isGroupPrimary: group ? group.primaryScreenId === screen.figmaNodeId : false,
        breakpointLabel: deriveBreakpointLabel(screen.width, screen.name),
      };
    }),
    interactions: interactions.map((interaction) => ({
      sourceNodeId: interaction.sourceNodeId,
      sourceNodeName: interaction.sourceNodeName,
      sourceScreenId: interaction.sourceScreenId,
      destinationNodeId: interaction.destinationNodeId,
      destinationScreenId: interaction.destinationScreenId,
      trigger: interaction.trigger,
      actions: parseStringArray(interaction.actionsJson),
      sourceBounds: interaction.sourceX === null || interaction.sourceY === null || interaction.sourceWidth === null || interaction.sourceHeight === null ? null : { x: interaction.sourceX, y: interaction.sourceY, width: interaction.sourceWidth, height: interaction.sourceHeight },
    })),
    warnings: parseStringArray(record.warningsJson),
    importSource: resolveImportSource(record.importSource, record.figmaVersion),
  };
}

export async function deleteFigmaImportScreen(tenant: TenantContext, fileKey: string, screenId: string) {
  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const existing = (await tx.select().from(figmaImportScreens).where(and(eq(figmaImportScreens.figmaImportId, record.id), eq(figmaImportScreens.figmaNodeId, screenId))).limit(1))[0];
    if (!existing) throw new Error("Design not found.");

    await tx.delete(figmaImportScreens).where(eq(figmaImportScreens.id, existing.id));
    await tx.delete(figmaImportInteractions).where(and(
      eq(figmaImportInteractions.figmaImportId, record.id),
      or(eq(figmaImportInteractions.sourceScreenId, screenId), eq(figmaImportInteractions.destinationScreenId, screenId)),
    ));

    if (existing.breakpointGroupId) {
      const siblings = await tx.select().from(figmaImportScreens).where(and(
        eq(figmaImportScreens.figmaImportId, record.id),
        eq(figmaImportScreens.breakpointGroupId, existing.breakpointGroupId),
      )).orderBy(asc(figmaImportScreens.sortOrder));
      if (siblings.length < 2) {
        for (const sibling of siblings) {
          await tx.update(figmaImportScreens).set({ breakpointGroupId: null }).where(eq(figmaImportScreens.id, sibling.id));
        }
        await tx.delete(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.id, existing.breakpointGroupId));
      } else {
        const group = (await tx.select().from(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.id, existing.breakpointGroupId)).limit(1))[0];
        if (group && group.primaryScreenId === screenId) {
          await tx.update(figmaImportBreakpointGroups).set({
            primaryScreenId: siblings[0].figmaNodeId,
            updatedAt: new Date(),
          }).where(eq(figmaImportBreakpointGroups.id, group.id));
        }
      }
    }

    const remaining = await tx.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, record.id)).orderBy(asc(figmaImportScreens.sortOrder));
    const interactions = await tx.select({ id: figmaImportInteractions.id }).from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, record.id));
    const nextMainId = record.mainScreenId === screenId ? (remaining[0]?.figmaNodeId ?? null) : record.mainScreenId;
    const nextMain = remaining.find((screen) => screen.figmaNodeId === nextMainId) ?? remaining[0] ?? null;

    await tx.update(figmaImports).set({
      mainScreenId: nextMain?.figmaNodeId ?? null,
      thumbnailUrl: nextMain?.imageUrl ?? null,
      screenCount: remaining.length,
      previewCount: remaining.filter((screen) => Boolean(screen.imageUrl)).length,
      interactionCount: interactions.length,
      updatedAt: new Date(),
    }).where(eq(figmaImports.id, record.id));

    await deletePreviewPng(tenant, fileKey, screenId);
  });
  return getFigmaImport(tenant, fileKey);
}

export async function deleteFigmaImportBreakpointGroup(tenant: TenantContext, fileKey: string, groupId: string) {
  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const members = await tx.select().from(figmaImportScreens).where(and(
      eq(figmaImportScreens.figmaImportId, record.id),
      eq(figmaImportScreens.breakpointGroupId, groupId),
    ));
    if (!members.length) throw new Error("Breakpoint set not found.");

    const memberIds = members.map((screen) => screen.figmaNodeId);
    for (const screen of members) {
      await tx.delete(figmaImportScreens).where(eq(figmaImportScreens.id, screen.id));
      await deletePreviewPng(tenant, fileKey, screen.figmaNodeId);
    }

    for (const screenId of memberIds) {
      await tx.delete(figmaImportInteractions).where(and(
        eq(figmaImportInteractions.figmaImportId, record.id),
        or(eq(figmaImportInteractions.sourceScreenId, screenId), eq(figmaImportInteractions.destinationScreenId, screenId)),
      ));
    }

    await tx.delete(figmaImportBreakpointGroups).where(and(
      eq(figmaImportBreakpointGroups.id, groupId),
      eq(figmaImportBreakpointGroups.figmaImportId, record.id),
    ));

    const remaining = await tx.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, record.id)).orderBy(asc(figmaImportScreens.sortOrder));
    const interactions = await tx.select({ id: figmaImportInteractions.id }).from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, record.id));
    const nextMainId = record.mainScreenId && memberIds.includes(record.mainScreenId)
      ? (remaining[0]?.figmaNodeId ?? null)
      : record.mainScreenId;
    const nextMain = remaining.find((screen) => screen.figmaNodeId === nextMainId) ?? remaining[0] ?? null;

    await tx.update(figmaImports).set({
      mainScreenId: nextMain?.figmaNodeId ?? null,
      thumbnailUrl: nextMain?.imageUrl ?? null,
      screenCount: remaining.length,
      previewCount: remaining.filter((screen) => Boolean(screen.imageUrl)).length,
      interactionCount: interactions.length,
      updatedAt: new Date(),
    }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function renameFigmaImport(tenant: TenantContext, fileKey: string, name: string) {
  const trimmed = name.trim().slice(0, 200);
  if (!trimmed) throw new Error("A project name is required.");

  const updated = await db.update(figmaImports).set({
    figmaFileName: trimmed,
    updatedAt: new Date(),
  }).where(and(
    eq(figmaImports.organizationId, tenant.organizationId),
    eq(figmaImports.projectId, tenant.projectId),
    eq(figmaImports.figmaFileKey, fileKey),
  )).returning({
    id: figmaImports.id,
    fileKey: figmaImports.figmaFileKey,
    fileName: figmaImports.figmaFileName,
  });

  if (!updated.length) throw new Error("Project file not found.");
  return updated[0];
}

export async function setFigmaImportMainScreen(tenant: TenantContext, fileKey: string, screenId: string) {
  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const screen = (await tx.select().from(figmaImportScreens).where(and(eq(figmaImportScreens.figmaImportId, record.id), eq(figmaImportScreens.figmaNodeId, screenId))).limit(1))[0];
    if (!screen) throw new Error("Design not found.");

    await tx.update(figmaImports).set({
      mainScreenId: screen.figmaNodeId,
      thumbnailUrl: screen.imageUrl,
      updatedAt: new Date(),
    }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function combineFigmaImportScreens(
  tenant: TenantContext,
  fileKey: string,
  screenIds: string[],
  options?: { name?: string; primaryScreenId?: string },
) {
  const uniqueIds = [...new Set(screenIds.filter(Boolean))];
  if (uniqueIds.length < 2) throw new Error("Select at least two designs to combine as breakpoints.");

  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const screens = await tx.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, record.id));
    const selected = screens.filter((screen) => uniqueIds.includes(screen.figmaNodeId));
    if (selected.length !== uniqueIds.length) throw new Error("One or more selected designs were not found.");

    const primaryScreenId = options?.primaryScreenId && uniqueIds.includes(options.primaryScreenId)
      ? options.primaryScreenId
      : [...selected].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.figmaNodeId;
    if (!primaryScreenId) throw new Error("A primary breakpoint is required.");

    const name = (options?.name || commonDesignName(selected.map((screen) => screen.name))).trim().slice(0, 120) || "Design";
    const relatedGroups = [...new Set(selected.map((screen) => screen.breakpointGroupId).filter(Boolean))] as string[];
    const existingGroup = relatedGroups[0] || null;
    const groupId = existingGroup || randomUUID().replaceAll("-", "");
    const now = new Date();

    for (const screen of selected) {
      await tx.update(figmaImportScreens).set({ breakpointGroupId: groupId }).where(eq(figmaImportScreens.id, screen.id));
    }

    if (relatedGroups.length) {
      const related = screens.filter((screen) => screen.breakpointGroupId && relatedGroups.includes(screen.breakpointGroupId));
      for (const screen of related) {
        await tx.update(figmaImportScreens).set({ breakpointGroupId: groupId }).where(eq(figmaImportScreens.id, screen.id));
      }
      for (const oldId of relatedGroups) {
        if (oldId !== groupId) await tx.delete(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.id, oldId));
      }
    }

    await tx.insert(figmaImportBreakpointGroups).values({
      id: groupId,
      figmaImportId: record.id,
      name,
      primaryScreenId,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: figmaImportBreakpointGroups.id,
      set: { name, primaryScreenId, updatedAt: now },
    });

    await tx.update(figmaImports).set({ updatedAt: now }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function renameFigmaImportBreakpointGroup(tenant: TenantContext, fileKey: string, groupId: string, name: string) {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) throw new Error("A design name is required.");

  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const updated = await tx.update(figmaImportBreakpointGroups).set({ name: trimmed, updatedAt: new Date() }).where(and(
      eq(figmaImportBreakpointGroups.id, groupId),
      eq(figmaImportBreakpointGroups.figmaImportId, record.id),
    )).returning({ id: figmaImportBreakpointGroups.id });
    if (!updated.length) throw new Error("Breakpoint set not found.");

    await tx.update(figmaImports).set({ updatedAt: new Date() }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function setFigmaImportGroupPrimary(tenant: TenantContext, fileKey: string, groupId: string, screenId: string) {
  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const screen = (await tx.select().from(figmaImportScreens).where(and(
      eq(figmaImportScreens.figmaImportId, record.id),
      eq(figmaImportScreens.figmaNodeId, screenId),
      eq(figmaImportScreens.breakpointGroupId, groupId),
    )).limit(1))[0];
    if (!screen) throw new Error("Design not found in that breakpoint set.");

    const updated = await tx.update(figmaImportBreakpointGroups).set({
      primaryScreenId: screenId,
      updatedAt: new Date(),
    }).where(and(
      eq(figmaImportBreakpointGroups.id, groupId),
      eq(figmaImportBreakpointGroups.figmaImportId, record.id),
    )).returning({ id: figmaImportBreakpointGroups.id });
    if (!updated.length) throw new Error("Breakpoint set not found.");

    await tx.update(figmaImports).set({ updatedAt: new Date() }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function uncombineFigmaImportScreen(tenant: TenantContext, fileKey: string, screenId: string) {
  await db.transaction(async (tx) => {
    const record = (await tx.select().from(figmaImports).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId), eq(figmaImports.figmaFileKey, fileKey))).limit(1))[0];
    if (!record) throw new Error("Project file not found.");

    const screen = (await tx.select().from(figmaImportScreens).where(and(eq(figmaImportScreens.figmaImportId, record.id), eq(figmaImportScreens.figmaNodeId, screenId))).limit(1))[0];
    if (!screen) throw new Error("Design not found.");
    if (!screen.breakpointGroupId) return;

    const groupId = screen.breakpointGroupId;
    await tx.update(figmaImportScreens).set({ breakpointGroupId: null }).where(eq(figmaImportScreens.id, screen.id));

    const siblings = await tx.select().from(figmaImportScreens).where(and(
      eq(figmaImportScreens.figmaImportId, record.id),
      eq(figmaImportScreens.breakpointGroupId, groupId),
    )).orderBy(asc(figmaImportScreens.sortOrder));

    if (siblings.length < 2) {
      for (const sibling of siblings) {
        await tx.update(figmaImportScreens).set({ breakpointGroupId: null }).where(eq(figmaImportScreens.id, sibling.id));
      }
      await tx.delete(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.id, groupId));
    } else {
      const group = (await tx.select().from(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.id, groupId)).limit(1))[0];
      if (group && group.primaryScreenId === screenId) {
        await tx.update(figmaImportBreakpointGroups).set({
          primaryScreenId: siblings[0].figmaNodeId,
          updatedAt: new Date(),
        }).where(eq(figmaImportBreakpointGroups.id, groupId));
      }
    }

    await tx.update(figmaImports).set({ updatedAt: new Date() }).where(eq(figmaImports.id, record.id));
  });
  return getFigmaImport(tenant, fileKey);
}

export async function getInspectTree(
  tenant: TenantContext,
  fileKey: string,
  screenId: string,
): Promise<InspectNode | null> {
  const record = (await db.select().from(figmaImports).where(and(
    eq(figmaImports.organizationId, tenant.organizationId),
    eq(figmaImports.projectId, tenant.projectId),
    eq(figmaImports.figmaFileKey, fileKey),
  )).limit(1))[0];
  if (!record) return null;
  const row = (await db.select().from(figmaImportScreenTrees).where(and(
    eq(figmaImportScreenTrees.figmaImportId, record.id),
    eq(figmaImportScreenTrees.figmaNodeId, screenId),
  )).limit(1))[0];
  if (!row) return null;
  try {
    return JSON.parse(row.treeJson) as InspectNode;
  } catch {
    return null;
  }
}

export async function upsertInspectTree(
  tenant: TenantContext,
  fileKey: string,
  screenId: string,
  tree: InspectNode,
  source: "import" | "lazy" = "lazy",
) {
  const record = (await db.select().from(figmaImports).where(and(
    eq(figmaImports.organizationId, tenant.organizationId),
    eq(figmaImports.projectId, tenant.projectId),
    eq(figmaImports.figmaFileKey, fileKey),
  )).limit(1))[0];
  if (!record) throw new Error("Project file not found.");
  const now = new Date();
  await db.insert(figmaImportScreenTrees).values({
    id: randomUUID(),
    figmaImportId: record.id,
    figmaNodeId: screenId,
    treeJson: JSON.stringify(tree),
    source,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [figmaImportScreenTrees.figmaImportId, figmaImportScreenTrees.figmaNodeId],
    set: { treeJson: JSON.stringify(tree), source, updatedAt: now },
  });
  return tree;
}

export async function getImportConnectionId(tenant: TenantContext, fileKey: string) {
  const record = (await db.select({
    connectionId: figmaImports.figmaConnectionId,
  }).from(figmaImports).where(and(
    eq(figmaImports.organizationId, tenant.organizationId),
    eq(figmaImports.projectId, tenant.projectId),
    eq(figmaImports.figmaFileKey, fileKey),
  )).limit(1))[0];
  return record?.connectionId ?? null;
}
