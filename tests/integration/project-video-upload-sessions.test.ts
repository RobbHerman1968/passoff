import { createHash, randomBytes } from "node:crypto";

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { WorkspaceScope } from "@/lib/tenant/context";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("project video upload sessions (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("binds exact sessions, verifies stored bytes, and completes idempotently", async () => {
    const { db } = await import("@/db");
    const {
      clientProjects,
      organizations,
      projectDesignVersions,
      projectVideoUploadSessions,
      subscriptions,
      users,
      workspaces,
    } = await import("@/db/schema");
    const {
      completeProjectVideoUploadSession,
      getProjectVideoUploadStatus,
      prepareProjectVideoUpload,
    } = await import("@/lib/projects/video");
    const { getStorageAdapter } = await import("@/lib/rooms/storage");

    const stamp = randomBytes(5).toString("hex");
    const [user] = await db.insert(users).values({
      email: `video-session-${stamp}@example.com`,
      name: "Uploader",
    }).returning();
    const [organization] = await db.insert(organizations).values({
      name: `Video sessions ${stamp}`,
      slug: `video-sessions-${stamp}`,
    }).returning();
    try {
      const [workspaceA, workspaceB] = await db.insert(workspaces).values([
        { organizationId: organization.id, name: "A", slug: `video-a-${stamp}` },
        { organizationId: organization.id, name: "B", slug: `video-b-${stamp}` },
      ]).returning();
      await db.insert(subscriptions).values({
        organizationId: organization.id,
        provider: "test",
        plan: "agency",
        status: "active",
      });
      const [projectA, projectOther, projectB] = await db.insert(clientProjects).values([
        {
          organizationId: organization.id,
          workspaceId: workspaceA.id,
          name: "A",
          clientName: "Client",
          slug: `video-project-a-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspaceA.id,
          name: "Other",
          clientName: "Client",
          slug: `video-project-other-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspaceB.id,
          name: "B",
          clientName: "Client",
          slug: `video-project-b-${stamp}`,
        },
      ]).returning();
      const scopeA: WorkspaceScope = {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspaceA.id,
        workspaceName: workspaceA.name,
        userId: user.id,
        userName: user.name!,
        userEmail: user.email,
      };
      const scopeB = { ...scopeA, workspaceId: workspaceB.id, workspaceName: workspaceB.name };
      const bytes = Buffer.from(`verified-video-${stamp}`);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const metadata = {
        originalFilename: "same-name.mp4",
        mimeType: "video/mp4",
        byteSize: bytes.byteLength,
        durationMs: 12_000,
        width: 1920,
        height: 1080,
        checksum,
      };
      const first = await prepareProjectVideoUpload({
        scope: scopeA,
        projectId: projectA.id,
        designName: "Review",
        metadata,
      });
      const second = await prepareProjectVideoUpload({
        scope: scopeA,
        projectId: projectA.id,
        designName: "Review",
        metadata: { ...metadata, checksum: createHash("sha256").update(Buffer.from("second")).digest("hex") },
      });
      expect(first.id).not.toBe(second.id);
      expect(first.pathname).not.toBe(second.pathname);
      expect(await getProjectVideoUploadStatus(scopeA, projectA.id, first.id)).toEqual({
        uploadSessionId: first.id,
        status: "pending",
      });
      await expect(getProjectVideoUploadStatus(scopeA, projectOther.id, first.id)).rejects.toThrow(/not found/i);
      await expect(getProjectVideoUploadStatus(scopeB, projectA.id, first.id)).rejects.toThrow(/not found/i);
      expect(projectB.id).toBeTruthy();

      const store = getStorageAdapter();
      await store.put(first.pathname, bytes, metadata.mimeType);
      const completions = await Promise.all([
        completeProjectVideoUploadSession({
          scope: scopeA,
          projectId: projectA.id,
          uploadSessionId: first.id,
          pathname: first.pathname,
          declaredSha256: checksum,
        }),
        completeProjectVideoUploadSession({
          scope: scopeA,
          projectId: projectA.id,
          uploadSessionId: first.id,
          pathname: first.pathname,
          declaredSha256: checksum,
        }),
      ]);
      expect(completions.some((result) => result.status === "completed")).toBe(true);
      const completed = await getProjectVideoUploadStatus(scopeA, projectA.id, first.id);
      expect(completed).toMatchObject({
        uploadSessionId: first.id,
        status: "completed",
        video: { sha256: checksum, contentSha256: checksum },
      });
      if (completed.status !== "completed") throw new Error("Expected completed upload.");
      const versions = await db.select().from(projectDesignVersions).where(and(
        eq(projectDesignVersions.projectId, projectA.id),
        eq(projectDesignVersions.contentSha256, checksum),
      ));
      expect(versions).toHaveLength(1);
      expect(JSON.parse(versions[0].payloadJson).video.sha256).toBe(checksum);
      expect((await completeProjectVideoUploadSession({
        scope: scopeA,
        projectId: projectA.id,
        uploadSessionId: first.id,
        pathname: first.pathname,
        declaredSha256: checksum,
      })).status).toBe("completed");

      const falseChecksum = "a".repeat(64);
      const rejected = await prepareProjectVideoUpload({
        scope: scopeA,
        projectId: projectA.id,
        metadata: { ...metadata, checksum: falseChecksum },
      });
      await store.put(rejected.pathname, bytes, metadata.mimeType);
      await expect(completeProjectVideoUploadSession({
        scope: scopeA,
        projectId: projectA.id,
        uploadSessionId: rejected.id,
        pathname: rejected.pathname,
        declaredSha256: falseChecksum,
      })).rejects.toThrow(/checksum mismatch/i);
      expect(await getProjectVideoUploadStatus(scopeA, projectA.id, rejected.id)).toEqual({
        uploadSessionId: rejected.id,
        status: "failed",
        error: "Video checksum mismatch.",
      });
      expect((await db.select().from(projectVideoUploadSessions)
        .where(eq(projectVideoUploadSessions.id, rejected.id)))[0]).toMatchObject({
        status: "failed",
        errorCode: "checksum_mismatch",
      });
    } finally {
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }, 120_000);
});
