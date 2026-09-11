import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clientProjects, rooms } from "@/db/schema";
import { assertCanMutate } from "@/lib/rooms/entitlements";
import { slugifyProjectName, type WorkspaceScope } from "@/lib/tenant/scope";

async function allocateProjectSlug(workspaceId: string, name: string) {
  const base = slugifyProjectName(name) || "project";
  for (let suffix = 0; suffix < 1000; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = (
      await db
        .select({ id: clientProjects.id })
        .from(clientProjects)
        .where(and(eq(clientProjects.workspaceId, workspaceId), eq(clientProjects.slug, candidate)))
        .limit(1)
    )[0];
    if (!existing) return candidate;
  }
  throw new Error("Unable to allocate a unique project URL.");
}

export async function createClientProject(
  scope: WorkspaceScope,
  input: { name: string; clientName: string },
) {
  const name = input.name.trim().slice(0, 120);
  const clientName = input.clientName.trim().slice(0, 120);
  if (!name) throw new Error("A project name is required.");
  if (!clientName) throw new Error("A client name is required.");
  await assertCanMutate(scope.organizationId);
  const slug = await allocateProjectSlug(scope.workspaceId, name);
  const [project] = await db
    .insert(clientProjects)
    .values({
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      name,
      clientName,
      slug,
      status: "ACTIVE",
    })
    .returning();
  return project;
}

export async function updateClientProject(
  scope: WorkspaceScope,
  projectId: string,
  input: { name: string; clientName: string },
) {
  const name = input.name.trim().slice(0, 120);
  const clientName = input.clientName.trim().slice(0, 120);
  if (!name) throw new Error("A project name is required.");
  if (!clientName) throw new Error("A company name is required.");
  await assertCanMutate(scope.organizationId);

  return db.transaction(async (tx) => {
    const [project] = await tx
      .update(clientProjects)
      .set({ name, clientName, updatedAt: new Date() })
      .where(
        and(
          eq(clientProjects.id, projectId),
          eq(clientProjects.organizationId, scope.organizationId),
          eq(clientProjects.workspaceId, scope.workspaceId),
        ),
      )
      .returning();
    if (!project) throw new Error("Project not found.");

    await tx
      .update(rooms)
      .set({ clientName, updatedAt: new Date() })
      .where(
        and(
          eq(rooms.clientProjectId, project.id),
          eq(rooms.workspaceId, scope.workspaceId),
        ),
      );

    return project;
  });
}

export async function listClientProjects(workspaceId: string) {
  return db
    .select({
      id: clientProjects.id,
      name: clientProjects.name,
      clientName: clientProjects.clientName,
      slug: clientProjects.slug,
      status: clientProjects.status,
      createdAt: clientProjects.createdAt,
      updatedAt: clientProjects.updatedAt,
      roomCount: sql<number>`count(${rooms.id})::int`,
    })
    .from(clientProjects)
    .leftJoin(rooms, eq(rooms.clientProjectId, clientProjects.id))
    .where(eq(clientProjects.workspaceId, workspaceId))
    .groupBy(clientProjects.id)
    .orderBy(desc(clientProjects.updatedAt));
}

export async function getClientProjectBundle(workspaceId: string, projectId: string) {
  const project = (
    await db
      .select()
      .from(clientProjects)
      .where(and(eq(clientProjects.id, projectId), eq(clientProjects.workspaceId, workspaceId)))
      .limit(1)
  )[0];
  if (!project) throw new Error("Project not found.");
  const projectRooms = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.clientProjectId, project.id), eq(rooms.workspaceId, workspaceId)))
    .orderBy(asc(rooms.createdAt));
  const result = await db.execute(sql`
    WITH project_rooms AS (
      SELECT id, status
      FROM rooms
      WHERE project_id = ${project.id}
        AND workspace_id = ${workspaceId}
    ),
    active_designs AS (
      SELECT id, current_version_id
      FROM project_designs
      WHERE project_id = ${project.id}
        AND archived_at IS NULL
    ),
    current_screens AS (
      SELECT coalesce(sum(jsonb_array_length(v.payload_json::jsonb -> 'screens')), 0)::int AS count
      FROM active_designs d
      JOIN project_design_versions v ON v.id = d.current_version_id
    ),
    design_storage AS (
      SELECT coalesce(sum(stored.bytes), 0)::bigint AS bytes
      FROM (
        SELECT concat(v.id::text, ':', screen.value->>'id') AS object_key,
               coalesce((screen.value -> 'preview' ->> 'bytes')::bigint, 0) AS bytes
        FROM project_design_versions v
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(v.payload_json::jsonb -> 'screens', '[]'::jsonb)) AS screen(value)
        WHERE v.project_id = ${project.id}
        UNION
        SELECT v.payload_json::jsonb->'video'->>'objectKey' AS object_key,
               max((v.payload_json::jsonb->'video'->>'byteSize')::bigint) AS bytes
        FROM project_design_versions v
        WHERE v.project_id = ${project.id}
          AND v.payload_json::jsonb->>'sourceType' = 'video'
        GROUP BY v.payload_json::jsonb->'video'->>'objectKey'
      ) stored
    ),
    room_storage AS (
      SELECT coalesce(sum(a.bytes), 0)::bigint AS bytes
      FROM assets a
      JOIN project_rooms r ON r.id = a.project_id
      WHERE a.upload_status = 'ready'
    ),
    handoff_storage AS (
      SELECT coalesce(sum(s.bytes), 0)::bigint AS bytes
      FROM developer_handoff_snapshot_screens s
      JOIN developer_handoff_snapshots h ON h.id = s.snapshot_id
      WHERE h.project_id = ${project.id}
    )
    SELECT
      (SELECT count(*)::int FROM active_designs) AS design_file_count,
      (SELECT count(*)::int FROM project_design_versions WHERE project_id = ${project.id}) AS design_version_count,
      (SELECT count FROM current_screens) AS screen_count,
      (SELECT count(*)::int FROM project_rooms) AS room_count,
      (SELECT count(*)::int
       FROM revisions rev
       JOIN project_rooms room ON room.id = rev.project_id
       WHERE rev.published_at IS NOT NULL) AS published_revision_count,
      (SELECT count(*)::int FROM project_rooms WHERE status = 'APPROVED') AS approved_room_count,
      ((SELECT bytes FROM design_storage) + (SELECT bytes FROM handoff_storage))::bigint AS design_storage_bytes,
      (SELECT bytes FROM room_storage)::bigint AS attachment_storage_bytes
  `);
  const row = ((result as unknown as { rows?: Array<Record<string, unknown>> }).rows ?? [])[0] ?? {};
  const number = (value: unknown) => Number(value ?? 0);
  return {
    project,
    rooms: projectRooms,
    stats: {
      designFileCount: number(row.design_file_count),
      designVersionCount: number(row.design_version_count),
      screenCount: number(row.screen_count),
      roomCount: number(row.room_count),
      publishedRevisionCount: number(row.published_revision_count),
      approvedRoomCount: number(row.approved_room_count),
      designStorageBytes: number(row.design_storage_bytes),
      attachmentStorageBytes: number(row.attachment_storage_bytes),
      storageBytes: number(row.design_storage_bytes) + number(row.attachment_storage_bytes),
    },
  };
}

