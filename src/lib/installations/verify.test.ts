import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import { workspaceMemberships, workspaces, projectEnvironments, reviews } from "@/db/schema";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createCredentialsUser } from "@/lib/auth/users";
import {
  clearInstallationRateLimit,
  seedInstallationRateLimit,
} from "@/lib/installations/rate-limit";
import { verifyWebsiteInstallation } from "@/lib/installations/verify";
import type { WorkspaceContext } from "@/lib/projects/context";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import { and } from "drizzle-orm";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function createWorkspaceContext(label: string): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Install",
    lastName: label,
    email: uniqueEmail(label),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user create failed");

  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: `${label} Studio`,
  });
  if (!workspace.ok) throw new Error("team create failed");

  const [membership] = await db
    .select({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, created.user.id),
        eq(workspaceMemberships.workspaceId, workspace.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);

  return {
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

async function seedWebsiteInstallation(options?: {
  websiteUrl?: string;
  enabled?: boolean;
}) {
  const context = await createWorkspaceContext("verify");
  const project = await createProject(context, "Verify Project");
  if (!project.ok) throw new Error("project create failed");

  const review = await createWebsiteReview(context, {
    projectId: project.project.id,
    name: "Homepage",
    websiteUrl: options?.websiteUrl ?? "https://example.com/start",
  });
  if (!review.ok) throw new Error("review create failed");

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      publicKey: projectEnvironments.publicKey,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
    .where(eq(reviews.id, review.review.id));

  if (options?.enabled === false) {
    await db
      .update(projectEnvironments)
      .set({ isEnabled: false })
      .where(eq(projectEnvironments.id, installation.id));
  }

  return {
    publicKey: installation.publicKey,
    origin: installation.allowedOrigins[0]!,
  };
}

describe("installation verification", () => {
  const createdKeys: Array<{ key: string; origin: string }> = [];

  afterEach(async () => {
    for (const item of createdKeys) {
      await clearInstallationRateLimit("installation_verify", [
        item.key,
        item.origin,
        "test-fp",
      ]);
    }
    createdKeys.length = 0;
  });

  it("verifies an allowed origin and updates verifiedAt then lastSeenAt", async () => {
    const seeded = await seedWebsiteInstallation();
    createdKeys.push({ key: seeded.publicKey, origin: seeded.origin });

    const first = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: seeded.origin,
        sdkVersion: "1.0.0",
      },
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["test-fp"],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.status).toBe("ready");
    expect(first.corsOrigin).toBe(seeded.origin);
    expect(Object.keys(first)).toEqual(
      expect.arrayContaining(["ok", "status", "matchedOrigin", "corsOrigin"]),
    );

    const [afterFirst] = await db
      .select()
      .from(projectEnvironments)
      .where(eq(projectEnvironments.publicKey, seeded.publicKey));
    expect(afterFirst.verifiedAt).toBeTruthy();
    expect(afterFirst.lastSeenAt).toBeTruthy();
    const firstVerified = afterFirst.verifiedAt!.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: seeded.origin,
        sdkVersion: "1.0.0",
        buildId: "build-9",
      },
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["test-fp"],
    });
    expect(second.ok).toBe(true);

    const [afterSecond] = await db
      .select()
      .from(projectEnvironments)
      .where(eq(projectEnvironments.publicKey, seeded.publicKey));
    expect(afterSecond.verifiedAt?.getTime()).toBe(firstVerified);
    expect(afterSecond.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
      afterFirst.lastSeenAt!.getTime(),
    );
  });

  it("rejects a disallowed origin without revealing details", async () => {
    const seeded = await seedWebsiteInstallation();
    createdKeys.push({ key: seeded.publicKey, origin: seeded.origin });

    const result = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: "https://evil.example",
        sdkVersion: "1.0.0",
      },
      headerOrigin: "https://evil.example",
      rateLimitSubjects: ["test-fp"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(403);
    expect(result.corsOrigin).toBeUndefined();
  });

  it("rejects unknown installations generically", async () => {
    const result = await verifyWebsiteInstallation({
      body: {
        installationKey: "pk_00000000000000000000000000000000",
        origin: "https://example.com",
        sdkVersion: "1.0.0",
      },
      headerOrigin: "https://example.com",
      rateLimitSubjects: ["test-fp"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });

  it("returns disabled without updating verification timestamps", async () => {
    const seeded = await seedWebsiteInstallation({ enabled: false });
    createdKeys.push({ key: seeded.publicKey, origin: seeded.origin });

    const result = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: seeded.origin,
        sdkVersion: "1.0.0",
      },
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["test-fp"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe("disabled");

    const [row] = await db
      .select()
      .from(projectEnvironments)
      .where(eq(projectEnvironments.publicKey, seeded.publicKey));
    expect(row.verifiedAt).toBeNull();
    expect(row.lastSeenAt).toBeNull();
  });

  it("applies durable rate limiting", async () => {
    const seeded = await seedWebsiteInstallation();
    createdKeys.push({ key: seeded.publicKey, origin: seeded.origin });
    const subjects = [seeded.publicKey, seeded.origin, "test-fp"];
    await seedInstallationRateLimit({
      scope: "installation_verify",
      subjects,
      attemptCount: 60,
    });

    const result = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: seeded.origin,
        sdkVersion: "1.0.0",
      },
      headerOrigin: seeded.origin,
      rateLimitSubjects: ["test-fp"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(429);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("requires exact origin comparison including port", async () => {
    const seeded = await seedWebsiteInstallation({
      websiteUrl: "http://localhost:3000/start",
    });
    createdKeys.push({ key: seeded.publicKey, origin: seeded.origin });

    const wrongPort = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: "http://localhost:3001",
        sdkVersion: "1.0.0",
      },
      headerOrigin: "http://localhost:3001",
      rateLimitSubjects: ["test-fp"],
    });
    expect(wrongPort.ok).toBe(false);

    const rightPort = await verifyWebsiteInstallation({
      body: {
        installationKey: seeded.publicKey,
        origin: "http://localhost:3000",
        sdkVersion: "1.0.0",
      },
      headerOrigin: "http://localhost:3000",
      rateLimitSubjects: ["test-fp"],
    });
    expect(rightPort.ok).toBe(true);
  });
});
