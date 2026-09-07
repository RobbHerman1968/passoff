import "server-only";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { figmaImportBreakpointGroups, figmaImportInteractions, figmaImports, figmaImportScreens, figmaImportScreenTrees, users } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant/context";
import {
  clearFilePreviews,
  clearProjectPreviews,
  deletePreviewPng,
  isDataImageUrl,
  isStoredPreviewUrl,
  storePreviewFromUrl,
} from "./preview-storage";
import { commonDesignName, deriveBreakpointLabel } from "./breakpoints";
import type { InspectNode } from "./inspect";
import type { FigmaImportResult, FigmaImportSource, FigmaSavedImportSummary, ProjectDesignBreakpoint, ProjectDesignSummary } from "./types";

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
  return db.transaction(async (tx) => {
    const saved = await tx.insert(figmaImports).values({
      id: randomUUID(),
      organizationId: tenant.organizationId,
      workspaceId: tenant.workspaceId,
      projectId: tenant.projectId,
      figmaConnectionId: connectionId,
      importedByUserId: tenant.userId,
      figmaFileKey: materialized.file.key,
      figmaFileName: materialized.file.name,
      figmaVersion: materialized.file.version,
      importSource,
      figmaLastModified: new Date(materialized.file.lastModified),
      thumbnailUrl: materialized.file.thumbnailUrl,
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
          ? { importSource, thumbnailUrl: materialized.file.thumbnailUrl }
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

    return importId;
  });
}

export async function listFigmaImports(tenant: TenantContext): Promise<FigmaSavedImportSummary[]> {
  const rows = await db.select({ record: figmaImports, importedByName: users.name, importedByEmail: users.email }).from(figmaImports).leftJoin(users, eq(figmaImports.importedByUserId, users.id)).where(and(eq(figmaImports.organizationId, tenant.organizationId), eq(figmaImports.projectId, tenant.projectId))).orderBy(desc(figmaImports.updatedAt));
  return Promise.all(rows.map(async ({ record, importedByName, importedByEmail }) => {
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
  await db.delete(figmaImports).where(and(
    eq(figmaImports.organizationId, tenant.organizationId),
    eq(figmaImports.projectId, tenant.projectId),
  ));
  await clearProjectPreviews(tenant);
}

export async function listProjectDesigns(tenant: TenantContext): Promise<ProjectDesignSummary[]> {
  const rows = await db
    .select({
      screen: figmaImportScreens,
      fileKey: figmaImports.figmaFileKey,
      fileName: figmaImports.figmaFileName,
      mainScreenId: figmaImports.mainScreenId,
      importId: figmaImports.id,
    })
    .from(figmaImportScreens)
    .innerJoin(figmaImports, eq(figmaImportScreens.figmaImportId, figmaImports.id))
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
    mainScreenId: string | null;
    sortOrder: number;
    breakpointGroupId: string | null;
  };

  const screens: ScreenRow[] = await Promise.all(rows.map(async ({ screen, fileKey, fileName, mainScreenId }) => {
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
  const [screens, interactions, groups] = await Promise.all([
    db.select().from(figmaImportScreens).where(eq(figmaImportScreens.figmaImportId, record.id)).orderBy(asc(figmaImportScreens.sortOrder)),
    db.select().from(figmaImportInteractions).where(eq(figmaImportInteractions.figmaImportId, record.id)).orderBy(asc(figmaImportInteractions.sortOrder)),
    db.select().from(figmaImportBreakpointGroups).where(eq(figmaImportBreakpointGroups.figmaImportId, record.id)),
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
