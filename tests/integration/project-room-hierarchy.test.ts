import { randomBytes, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("project and room hierarchy (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("backfills compatibility rooms, supports multiple rooms, and isolates project ownership", async () => {
    const { db } = await import("@/db");
    const {
      clientProjects,
      figmaImports,
      organizations,
      rooms,
      workspaces,
    } = await import("@/db/schema");

    const stamp = randomBytes(5).toString("hex");
    const [organization] = await db
      .insert(organizations)
      .values({ name: `Hierarchy ${stamp}`, slug: `hierarchy-${stamp}` })
      .returning();
    const [otherOrganization] = await db
      .insert(organizations)
      .values({ name: `Other ${stamp}`, slug: `hierarchy-other-${stamp}` })
      .returning();

    try {
      const [workspace] = await db
        .insert(workspaces)
        .values({ organizationId: organization.id, name: "Main", slug: "main" })
        .returning();
      const [otherWorkspace] = await db
        .insert(workspaces)
        .values({ organizationId: otherOrganization.id, name: "Other", slug: "other" })
        .returning();

      // Old callers may still omit the new parent id. The compatibility trigger
      // creates a one-to-one project with the same UUID and fills the relation.
      const [firstRoom] = await db
        .insert(rooms)
        .values({
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Website approval",
          clientName: "Acme",
          slug: `website-${stamp}`,
          status: "DRAFT",
        })
        .returning();
      expect(firstRoom.clientProjectId).toBe(firstRoom.id);

      const parent = (
        await db
          .select()
          .from(clientProjects)
          .where(eq(clientProjects.id, firstRoom.id))
          .limit(1)
      )[0];
      expect(parent).toMatchObject({
        organizationId: organization.id,
        workspaceId: workspace.id,
        name: "Website approval",
        clientName: "Acme",
        status: "ACTIVE",
      });

      const [secondRoom] = await db
        .insert(rooms)
        .values({
          id: randomUUID(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: parent.id,
          name: "Mobile approval",
          clientName: "Acme",
          slug: `mobile-${stamp}`,
          status: "DRAFT",
        })
        .returning();

      const siblingRooms = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.clientProjectId, parent.id));
      expect(siblingRooms.map((room) => room.id).sort()).toEqual(
        [firstRoom.id, secondRoom.id].sort(),
      );

      const [design] = await db
        .insert(figmaImports)
        .values({
          id: randomUUID(),
          organizationId: organization.id,
          workspaceId: workspace.id,
          projectId: parent.id,
          figmaFileKey: `file-${stamp}`,
          figmaFileName: "Website",
          figmaVersion: "1",
          figmaLastModified: new Date(),
        })
        .returning();
      expect(design.projectId).toBe(parent.id);

      await expect(
        db.insert(rooms).values({
          organizationId: otherOrganization.id,
          workspaceId: otherWorkspace.id,
          clientProjectId: parent.id,
          name: "Cross tenant",
          clientName: "Other",
          slug: `cross-${stamp}`,
        }),
      ).rejects.toThrow();
      const crossTenantRoom = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(
          and(
            eq(rooms.organizationId, otherOrganization.id),
            eq(rooms.slug, `cross-${stamp}`),
          ),
      );
      expect(crossTenantRoom).toHaveLength(0);

      // A room is disposable review state; removing it must not remove the
      // durable project or the project's shared design files.
      await db.delete(rooms).where(eq(rooms.id, secondRoom.id));
      const [parentAfterRoomDelete, designAfterRoomDelete] = await Promise.all([
        db.select({ id: clientProjects.id }).from(clientProjects).where(eq(clientProjects.id, parent.id)),
        db.select({ id: figmaImports.id }).from(figmaImports).where(eq(figmaImports.id, design.id)),
      ]);
      expect(parentAfterRoomDelete).toHaveLength(1);
      expect(designAfterRoomDelete).toHaveLength(1);

      await db.delete(clientProjects).where(eq(clientProjects.id, parent.id));
      const [roomsAfterDelete, designsAfterDelete] = await Promise.all([
        db.select({ id: rooms.id }).from(rooms).where(eq(rooms.clientProjectId, parent.id)),
        db
          .select({ id: figmaImports.id })
          .from(figmaImports)
          .where(
            and(
              eq(figmaImports.organizationId, organization.id),
              eq(figmaImports.projectId, parent.id),
            ),
          ),
      ]);
      expect(roomsAfterDelete).toHaveLength(0);
      expect(designsAfterDelete).toHaveLength(0);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(organizations).where(eq(organizations.id, otherOrganization.id));
    }
  }, 120_000);
});
