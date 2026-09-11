/**
 * Integration tests for tenant isolation.
 * Requires DATABASE_URL. Skips when unset.
 *
 * Avoids importing route/auth modules (they pull Next.js server APIs unsuitable for Vitest).
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tenant isolation (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("two users receive distinct workspaces and cannot read each other's rooms", async () => {
    const { createPasswordUser } = await import("@/lib/auth/password");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const { db } = await import("@/db");
    const { organizations, rooms, users, workspaces } = await import("@/db/schema");

    // Fail loudly when first-release migrations have not been applied —
    // a logged skip must not count as successful tenant-isolation coverage.
    try {
      await db.select({ id: workspaces.id, notificationEmail: workspaces.notificationEmail }).from(workspaces).limit(1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/notification_email|does not exist/i.test(message)) {
        throw new Error(
          "tenant isolation requires drizzle-postgres/0007_first_release_hardening.sql — apply migrations before counting this coverage.",
        );
      }
      throw error;
    }

    const stamp = randomBytes(4).toString("hex");
    const userA = await createPasswordUser({
      email: `a-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "User A",
    });
    const userB = await createPasswordUser({
      email: `b-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "User B",
    });

    const tenantA = await createPrivateTenantForUser(userA.id);
    const tenantB = await createPrivateTenantForUser(userB.id);
    expect(tenantA.workspaceId).not.toBe(tenantB.workspaceId);

    const workspaceA = (
      await db.select().from(workspaces).where(eq(workspaces.id, tenantA.workspaceId)).limit(1)
    )[0]!;

    const [roomA] = await db
      .insert(rooms)
      .values({
        organizationId: workspaceA.organizationId,
        workspaceId: tenantA.workspaceId,
        name: `Room A ${stamp}`,
        clientName: "Client A",
        slug: `room-a-${stamp}`,
        status: "DRAFT",
      })
      .returning();

    const listB = await db
      .select()
      .from(rooms)
      .where(eq(rooms.workspaceId, tenantB.workspaceId));
    expect(listB.some((r) => r.id === roomA.id)).toBe(false);

    const crossRead = (
      await db
        .select()
        .from(rooms)
        .where(and(eq(rooms.id, roomA.id), eq(rooms.workspaceId, tenantB.workspaceId)))
        .limit(1)
    )[0];
    expect(crossRead).toBeUndefined();

    // Cleanup (cascade org deletes workspaces/projects)
    await db.delete(users).where(eq(users.id, userA.id));
    await db.delete(users).where(eq(users.id, userB.id));
    await db.delete(organizations).where(eq(organizations.id, workspaceA.organizationId));
    const workspaceB = (
      await db.select().from(workspaces).where(eq(workspaces.id, tenantB.workspaceId)).limit(1)
    )[0];
    if (workspaceB) {
      await db.delete(organizations).where(eq(organizations.id, workspaceB.organizationId));
    }
  });
});
