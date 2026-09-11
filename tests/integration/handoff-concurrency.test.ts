/**
 * Handoff release concurrency + visibility (DB).
 * Requires DATABASE_URL. Uses row locks — races must not expose unrereleased items.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

async function seedApprovedRoom(stamp: string) {
  const { createPasswordUser } = await import("@/lib/auth/password");
  const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
  const { db } = await import("@/db");
  const { revisions, rooms, workspaces } = await import("@/db/schema");

  const user = await createPasswordUser({
    email: `handoff-conc-${stamp}@example.com`,
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
    .insert(rooms)
    .values({
      organizationId: workspace.organizationId,
      workspaceId: tenant.workspaceId,
      name: `Handoff ${stamp}`,
      clientName: "Client",
      slug: `handoff-conc-${stamp}`,
      status: "APPROVED",
    })
    .returning();

  await db.insert(revisions).values({
    workspaceId: tenant.workspaceId,
    roomId: room.id,
    number: 1,
    status: "APPROVED",
    contentDigest: "abc",
    publishedAt: new Date(),
  });

  return { scope, room, workspace, tenant };
}

describe.skipIf(!hasDb)("handoff release concurrency", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("ordinary release visibility, add/delete after release clears release", async () => {
    const stamp = randomBytes(4).toString("hex");
    const { scope, room } = await seedApprovedRoom(stamp);
    const {
      addHandoffItem,
      deleteHandoffItem,
      listReleasedHandoffItems,
      releaseHandoff,
    } = await import("@/lib/rooms/service");

    expect(await listReleasedHandoffItems(room.id)).toEqual([]);

    const first = await addHandoffItem({
      scope,
      roomId: room.id,
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
      roomId: room.id,
      label: "Extra ZIP",
      category: "file",
    });
    expect(second.releaseCleared).toBe(true);
    expect(await listReleasedHandoffItems(room.id)).toEqual([]);

    await releaseHandoff(scope, room.id);
    const again = await listReleasedHandoffItems(room.id);
    expect(again.map((i) => i.label).sort()).toEqual(["Extra ZIP", "Spec PDF"]);

    const deleted = await deleteHandoffItem(scope, room.id, second.item.id);
    expect(deleted.releaseCleared).toBe(true);
    expect(await listReleasedHandoffItems(room.id)).toEqual([]);
  });

  it("concurrent release and add cannot leave a newly added item publicly visible accidentally", async () => {
    const stamp = randomBytes(4).toString("hex");
    const { scope, room } = await seedApprovedRoom(`race-add-${stamp}`);
    const {
      addHandoffItem,
      listReleasedHandoffItems,
      releaseHandoff,
    } = await import("@/lib/rooms/service");
    const { db } = await import("@/db");
    const { handoffItems, rooms } = await import("@/db/schema");

    await addHandoffItem({
      scope,
      roomId: room.id,
      label: "Base item",
      category: "file",
    });

    const rounds = 12;
    for (let i = 0; i < rounds; i++) {
      await db
        .update(rooms)
        .set({ handoffReleasedAt: null, updatedAt: new Date() })
        .where(eq(rooms.id, room.id));

      const label = `Raced ${i}`;
      await Promise.all([
        releaseHandoff(scope, room.id),
        addHandoffItem({ scope, roomId: room.id, label, category: "file" }),
      ]);

      const visible = await listReleasedHandoffItems(room.id);
      const allItems = await db
        .select()
        .from(handoffItems)
        .where(eq(handoffItems.roomId, room.id));
      const project = (
        await db.select().from(rooms).where(eq(rooms.id, room.id)).limit(1)
      )[0]!;

      if (project.handoffReleasedAt) {
        // Released state must match the full item set (no post-release orphan visibility).
        expect(visible.map((row) => row.id).sort()).toEqual(allItems.map((row) => row.id).sort());
      } else {
        expect(visible).toEqual([]);
      }
    }
  });

  it("concurrent release and delete produces a consistent release state", async () => {
    const stamp = randomBytes(4).toString("hex");
    const { scope, room } = await seedApprovedRoom(`race-del-${stamp}`);
    const {
      addHandoffItem,
      deleteHandoffItem,
      listReleasedHandoffItems,
      releaseHandoff,
    } = await import("@/lib/rooms/service");
    const { db } = await import("@/db");
    const { handoffItems, rooms } = await import("@/db/schema");

    const keep = await addHandoffItem({
      scope,
      roomId: room.id,
      label: "Keep",
      category: "file",
    });
    const drop = await addHandoffItem({
      scope,
      roomId: room.id,
      label: "Drop",
      category: "file",
    });

    await Promise.all([
      releaseHandoff(scope, room.id),
      deleteHandoffItem(scope, room.id, drop.item.id),
    ]);

    const project = (
      await db.select().from(rooms).where(eq(rooms.id, room.id)).limit(1)
    )[0]!;
    const remaining = await db
      .select()
      .from(handoffItems)
      .where(eq(handoffItems.roomId, room.id));
    const visible = await listReleasedHandoffItems(room.id);

    expect(remaining.some((row) => row.id === drop.item.id)).toBe(false);
    expect(remaining.some((row) => row.id === keep.item.id)).toBe(true);

    if (project.handoffReleasedAt) {
      expect(visible.map((row) => row.id).sort()).toEqual(
        remaining.map((row) => row.id).sort(),
      );
      expect(visible.some((row) => row.id === drop.item.id)).toBe(false);
    } else {
      expect(visible).toEqual([]);
    }
  });

  it("tenant isolation remains enforced for handoff mutations", async () => {
    const stamp = randomBytes(4).toString("hex");
    const a = await seedApprovedRoom(`iso-a-${stamp}`);
    const b = await seedApprovedRoom(`iso-b-${stamp}`);
    const { addHandoffItem, releaseHandoff, listReleasedHandoffItems } =
      await import("@/lib/rooms/service");

    await addHandoffItem({
      scope: a.scope,
      roomId: a.room.id,
      label: "A only",
      category: "file",
    });
    await releaseHandoff(a.scope, a.room.id);

    await expect(
      addHandoffItem({
        scope: b.scope,
        roomId: a.room.id,
        label: "Cross tenant",
        category: "file",
      }),
    ).rejects.toThrow(/not found/i);

    await expect(releaseHandoff(b.scope, a.room.id)).rejects.toThrow(/not found/i);
    expect(await listReleasedHandoffItems(a.room.id)).toHaveLength(1);
    expect(await listReleasedHandoffItems(b.room.id)).toEqual([]);
  });
});
