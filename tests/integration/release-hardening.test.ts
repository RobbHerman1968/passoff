/**
 * Migration readiness + reviewer email non-uniqueness smoke (DB).
 * Primary coverage lives in handoff-concurrency / public-reviewer-identity / handoff-uploads.
 */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("release hardening (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("tenant isolation still requires first-release schema", async () => {
    const { db } = await import("@/db");
    const { workspaces } = await import("@/db/schema");
    const rows = await db
      .select({ id: workspaces.id, notificationEmail: workspaces.notificationEmail })
      .from(workspaces)
      .limit(1);
    expect(Array.isArray(rows)).toBe(true);
  });

  it("allows multiple reviewers with the same display email (session identity)", async () => {
    const { createPasswordUser } = await import("@/lib/auth/password");
    const { createPrivateTenantForUser } = await import("@/lib/auth/tenant-membership");
    const { db } = await import("@/db");
    const { rooms, workspaces } = await import("@/db/schema");
    const { createReviewer } = await import("@/lib/rooms/service");

    const stamp = randomBytes(4).toString("hex");
    const user = await createPasswordUser({
      email: `dup-email-${stamp}@example.com`,
      password: "TestPassword123!",
      name: "Dup Email",
    });
    const tenant = await createPrivateTenantForUser(user.id);
    const workspace = (
      await db.select().from(workspaces).where(eq(workspaces.id, tenant.workspaceId)).limit(1)
    )[0]!;
    const [room] = await db
      .insert(rooms)
      .values({
        organizationId: workspace.organizationId,
        workspaceId: tenant.workspaceId,
        name: `Dup ${stamp}`,
        clientName: "Client",
        slug: `dup-${stamp}`,
        status: "SENT",
      })
      .returning();

    const email = `shared-${stamp}@example.com`;
    const a = await createReviewer({
      workspaceId: tenant.workspaceId,
      roomId: room.id,
      name: "A",
      email,
    });
    const b = await createReviewer({
      workspaceId: tenant.workspaceId,
      roomId: room.id,
      name: "B",
      email,
    });
    expect(a.id).not.toBe(b.id);
    expect(a.email).toBe(b.email);
  });
});
