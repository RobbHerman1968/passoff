import { createHash, randomBytes } from "node:crypto";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { WorkspaceScope } from "@/lib/tenant/scope";

import { ensureTestMigrations } from "../helpers/ensure-migrations";

config({ path: ".env" });

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("versioned video review (DB)", () => {
  beforeAll(async () => {
    await ensureTestMigrations();
  }, 120_000);

  it("versions, pins, comments, explains, approves, and safely deletes videos", async () => {
    const { db } = await import("@/db");
    const {
      blobDeletionJobs,
      clientProjects,
      designVersionExplanations,
      organizations,
      projectDesignVersions,
      revisionDesignVersions,
      revisions,
      rooms,
      subscriptions,
      users,
      workspaces,
    } = await import("@/db/schema");
    const {
      buildProjectVideoObjectPath,
      completeProjectVideoUpload,
      createVideoExplanation,
      deleteVideoVersion,
      listProjectVideos,
      updateVideoExplanation,
    } = await import("@/lib/projects/video");
    const { getStorageAdapter } = await import("@/lib/rooms/storage");
    const {
      createPublicComment,
      createReviewer,
      getRoomBundle,
      listApprovalReceiptsForRoom,
      listPublishedDesignerNotes,
      pinDesignVersionToDraft,
      publishRevision,
      submitPublicDecision,
    } = await import("@/lib/rooms/service");

    const stamp = randomBytes(5).toString("hex");
    const [user] = await db.insert(users).values({
      email: `video-${stamp}@example.com`,
      name: "Video Designer",
    }).returning();
    const [otherUser] = await db.insert(users).values({
      email: `video-other-${stamp}@example.com`,
      name: "Other Designer",
    }).returning();
    const [organization] = await db.insert(organizations).values({
      name: `Video ${stamp}`,
      slug: `video-${stamp}`,
    }).returning();
    try {
      const [workspace] = await db.insert(workspaces).values({
        organizationId: organization.id,
        name: "Main",
        slug: `main-${stamp}`,
      }).returning();
      await db.insert(subscriptions).values({
        organizationId: organization.id,
        provider: "test",
        plan: "agency",
        status: "active",
      });
      const [project, otherProject] = await db.insert(clientProjects).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Launch film",
          clientName: "Acme",
          slug: `launch-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          name: "Other",
          clientName: "Other",
          slug: `other-${stamp}`,
        },
      ]).returning();
      const [room, siblingRoom, foreignRoom] = await db.insert(rooms).values([
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Sibling review",
          clientName: "Acme",
          slug: `sibling-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: project.id,
          name: "Film review",
          clientName: "Acme",
          slug: `film-${stamp}`,
        },
        {
          organizationId: organization.id,
          workspaceId: workspace.id,
          clientProjectId: otherProject.id,
          name: "Foreign",
          clientName: "Other",
          slug: `foreign-${stamp}`,
        },
      ]).returning();
      const [revision, siblingRevision, foreignRevision] = await db.insert(revisions).values([
        { workspaceId: workspace.id, roomId: room.id, number: 1, status: "DRAFT" },
        { workspaceId: workspace.id, roomId: siblingRoom.id, number: 1, status: "DRAFT" },
        { workspaceId: workspace.id, roomId: foreignRoom.id, number: 1, status: "DRAFT" },
      ]).returning();
      const scope: WorkspaceScope = {
        organizationId: organization.id,
        organizationName: organization.name,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        userId: user.id,
        userName: user.name!,
        userEmail: user.email,
      };
      const otherScope: WorkspaceScope = {
        ...scope,
        userId: otherUser.id,
        userName: otherUser.name!,
        userEmail: otherUser.email,
      };
      const store = getStorageAdapter();
      const upload = async (
        bytes: Buffer,
        input: { projectId?: string; designId?: string | null; name?: string; mime?: "video/mp4" | "video/webm" } = {},
      ) => {
        const ownerProjectId = input.projectId ?? project.id;
        const filename = input.mime === "video/webm" ? "review.webm" : "review.mp4";
        const pathname = buildProjectVideoObjectPath({
          workspaceId: workspace.id,
          projectId: ownerProjectId,
          filename,
        });
        await store.put(pathname, bytes, input.mime ?? "video/mp4");
        return completeProjectVideoUpload({
          scope,
          projectId: ownerProjectId,
          designId: input.designId,
          designName: input.name,
          pathname,
          blobUrl: store.provider === "local" ? pathname : null,
          metadata: {
            originalFilename: filename,
            mimeType: input.mime ?? "video/mp4",
            byteSize: bytes.byteLength,
            durationMs: 10_000,
            width: 1920,
            height: 1080,
            checksum: createHash("sha256").update(bytes).digest("hex"),
          },
        });
      };

      const first = await upload(Buffer.from("mp4-one"), { name: "Launch video" });
      expect(first).toMatchObject({ versionNumber: 1, mimeType: "video/mp4", idempotent: false });
      const invalidPath = buildProjectVideoObjectPath({
        workspaceId: workspace.id,
        projectId: project.id,
        filename: "invalid.mp4",
      });
      await expect(completeProjectVideoUpload({
        scope,
        projectId: project.id,
        pathname: invalidPath,
        blobUrl: store.provider === "local" ? invalidPath : null,
        metadata: {
          originalFilename: "invalid.mp4",
          mimeType: "video/mp4",
          byteSize: 1,
          durationMs: 1000,
          checksum: "a".repeat(64),
        },
      })).rejects.toThrow(/not found/i);
      const mismatchPath = buildProjectVideoObjectPath({
        workspaceId: workspace.id,
        projectId: project.id,
        filename: "mismatch.mp4",
      });
      await store.put(mismatchPath, Buffer.from("wrong-size"), "video/webm");
      await expect(completeProjectVideoUpload({
        scope,
        projectId: project.id,
        pathname: mismatchPath,
        blobUrl: store.provider === "local" ? mismatchPath : null,
        metadata: {
          originalFilename: "mismatch.mp4",
          mimeType: "video/mp4",
          byteSize: 1,
          durationMs: 1000,
          checksum: "a".repeat(64),
        },
      })).rejects.toThrow(/size mismatch/i);
      const mimeMismatchPath = buildProjectVideoObjectPath({
        workspaceId: workspace.id,
        projectId: project.id,
        filename: "mime-mismatch.mp4",
      });
      await store.put(mimeMismatchPath, Buffer.from("x"), "video/webm");
      await expect(completeProjectVideoUpload({
        scope,
        projectId: project.id,
        pathname: mimeMismatchPath,
        blobUrl: store.provider === "local" ? mimeMismatchPath : null,
        metadata: {
          originalFilename: "mime-mismatch.mp4",
          mimeType: "video/mp4",
          byteSize: 1,
          durationMs: 1000,
          checksum: "a".repeat(64),
        },
      })).rejects.toThrow(/content type mismatch/i);
      await expect(upload(Buffer.from("cross-project"), {
        projectId: otherProject.id,
        designId: first.designId,
      })).rejects.toThrow(/not found in this project/i);
      const duplicate = await upload(Buffer.from("mp4-one"), { designId: first.designId });
      expect(duplicate).toMatchObject({
        designVersionId: first.designVersionId,
        versionNumber: 1,
        idempotent: true,
      });
      const second = await upload(Buffer.from("webm-two"), {
        designId: first.designId,
        mime: "video/webm",
      });
      expect(second).toMatchObject({ versionNumber: 2, mimeType: "video/webm" });
      expect(await listProjectVideos(scope, project.id)).toEqual([
        expect.objectContaining({ designId: first.designId, designVersionId: second.designVersionId }),
      ]);
      const concurrent = await Promise.all([
        upload(Buffer.from("concurrent-three"), { designId: first.designId }),
        upload(Buffer.from("concurrent-three"), { designId: first.designId }),
      ]);
      expect(new Set(concurrent.map((item) => item.designVersionId)).size).toBe(1);
      expect(new Set(concurrent.map((item) => item.versionNumber))).toEqual(new Set([3]));

      const pin = await pinDesignVersionToDraft({
        scope,
        roomId: room.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
      });
      const siblingPin = await pinDesignVersionToDraft({
        scope,
        roomId: siblingRoom.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
      });
      await expect(pinDesignVersionToDraft({
        scope,
        roomId: foreignRoom.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
      })).rejects.toThrow(/not found in this room's project/i);
      expect(foreignRevision.id).toBeTruthy();

      await publishRevision(scope, room.id);
      const published = await getRoomBundle(workspace.id, room.id);
      expect(published.designMembership[0]).toMatchObject({
        sourceType: "video",
        designVersionId: first.designVersionId,
        versionNumber: 1,
      });

      const reviewer = await createReviewer({
        workspaceId: workspace.id,
        roomId: room.id,
        name: "Client",
        email: `client-${stamp}@example.com`,
      });
      const comment = await createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: {
          type: "video",
          revisionDesignVersionId: pin.id,
          videoTimeMs: 5000,
        },
        reviewerId: reviewer.id,
        body: "Client feedback at five seconds.",
      });
      expect(comment).toMatchObject({ videoTimeMs: 5000, xPercent: null, yPercent: null });
      await expect(createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: { type: "video", revisionDesignVersionId: pin.id, videoTimeMs: -1 },
        reviewerId: reviewer.id,
        body: "Invalid",
      })).rejects.toThrow(/outside/i);
      await expect(createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: { type: "video", revisionDesignVersionId: siblingPin.id, videoTimeMs: 1000 },
        reviewerId: reviewer.id,
        body: "Wrong revision",
      })).rejects.toThrow(/not pinned/i);
      expect(siblingRevision.id).toBeTruthy();
      await expect(createPublicComment({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        target: { type: "video", revisionDesignVersionId: pin.id, videoTimeMs: 10_001 },
        reviewerId: reviewer.id,
        body: "Invalid",
      })).rejects.toThrow(/outside/i);

      const draftNote = await createVideoExplanation({
        scope,
        projectId: project.id,
        designId: first.designId,
        designVersionId: first.designVersionId,
        videoTimeMs: 3000,
        category: "intent",
        title: "Hold the frame",
        body: "The pause is intentional.",
      });
      expect(draftNote.canEdit).toBe(true);
      const editedDraft = await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        videoTimeMs: 4500,
        category: "motion",
        title: "Updated hold",
        body: "The revised pause remains intentional.",
      });
      expect(editedDraft).toMatchObject({
        videoTimeMs: 4500,
        category: "motion",
        title: "Updated hold",
        body: "The revised pause remains intentional.",
        canEdit: true,
      });
      await expect(updateVideoExplanation({
        scope: otherScope,
        projectId: project.id,
        explanationId: draftNote.id,
        title: "Unauthorized edit",
      })).rejects.toThrow(/only the author/i);
      await expect(updateVideoExplanation({
        scope: otherScope,
        projectId: project.id,
        explanationId: draftNote.id,
        publish: true,
      })).rejects.toThrow(/only the author/i);
      await expect(updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        videoTimeMs: 10_001,
      })).rejects.toThrow(/outside/i);
      expect(await listPublishedDesignerNotes(published.project, published.designMembership)).toEqual([]);
      const publishedNote = await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        publish: true,
      });
      expect(publishedNote.status).toBe("published");
      expect(publishedNote.canEdit).toBe(false);
      await expect(updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        body: "Published content cannot change.",
      })).rejects.toThrow(/immutable/i);
      expect(await listPublishedDesignerNotes(published.project, published.designMembership)).toEqual([
        expect.objectContaining({
          targetType: "video",
          videoTimeMs: 4500,
          revisionDesignVersionId: pin.id,
        }),
      ]);
      const returnedVideoNote = await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        status: "draft",
      });
      expect(returnedVideoNote).toMatchObject({ status: "draft", canEdit: true, canMoveToDraft: false });
      expect(await listPublishedDesignerNotes(published.project, published.designMembership)).toEqual([]);
      await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        body: "The revised pause is ready to publish again.",
      });
      expect(await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: draftNote.id,
        status: "published",
      })).toMatchObject({ status: "published", canMoveToDraft: true });
      const unpinnedNote = await createVideoExplanation({
        scope,
        projectId: project.id,
        designId: first.designId,
        designVersionId: second.designVersionId,
        videoTimeMs: 1000,
        category: "intent",
        title: "Unpinned version",
        body: "This published note belongs to a different immutable version.",
      });
      await updateVideoExplanation({
        scope,
        projectId: project.id,
        explanationId: unpinnedNote.id,
        publish: true,
      });
      expect(await listPublishedDesignerNotes(published.project, published.designMembership)).toHaveLength(1);
      expect(await db.select().from(designVersionExplanations)
        .where(eq(designVersionExplanations.designVersionId, second.designVersionId))).toHaveLength(1);

      await submitPublicDecision({
        workspaceId: workspace.id,
        roomId: room.id,
        revisionId: revision.id,
        reviewerId: reviewer.id,
        decision: "approve",
        acceptanceStatement: "I approve this exact video.",
      });
      const [receipt] = await listApprovalReceiptsForRoom(room.id, { decision: "approved" });
      expect(receipt).toMatchObject({
        reviewedItemCount: 1,
        designVersions: [{
          designVersionId: first.designVersionId,
          designName: "Launch video",
          versionNumber: 1,
          contentSha256: first.contentSha256,
          sourceType: "video",
          video: {
            durationMs: 10_000,
            mimeType: "video/mp4",
            originalFilename: "review.mp4",
            byteSize: 7,
          },
          screenNames: [],
        }],
      });

      await expect(deleteVideoVersion(
        scope,
        project.id,
        first.designId,
        first.designVersionId,
      )).rejects.toThrow(/approval room/i);
      await expect(deleteVideoVersion(
        scope,
        project.id,
        first.designId,
        concurrent[0].designVersionId,
      )).rejects.toThrow(/current/i);

      await deleteVideoVersion(scope, project.id, first.designId, second.designVersionId);
      const videoJobs = await db.select().from(blobDeletionJobs)
        .where(eq(blobDeletionJobs.objectKey, second.objectKey));
      expect(videoJobs).toHaveLength(1);
      expect(videoJobs[0].reason).toBe("deleted_video_version");

      const posterVideoBytes = Buffer.from(`poster-video-${stamp}`);
      const posterBytes = Buffer.from(`poster-${stamp}`);
      const posterVideoSha = createHash("sha256").update(posterVideoBytes).digest("hex");
      const posterVideoPath = buildProjectVideoObjectPath({
        workspaceId: workspace.id,
        projectId: project.id,
        filename: "poster-review.mp4",
      });
      const posterPath = `${posterVideoPath}.poster.webp`;
      await store.put(posterVideoPath, posterVideoBytes, "video/mp4");
      await store.put(posterPath, posterBytes, "image/webp");
      const [posterVersion] = await db.insert(projectDesignVersions).values({
        organizationId: organization.id,
        workspaceId: workspace.id,
        projectId: project.id,
        designId: first.designId,
        versionNumber: 4,
        contentSha256: posterVideoSha,
        payloadJson: JSON.stringify({
          schemaVersion: 2,
          sourceType: "video",
          video: {
            originalFilename: "poster-review.mp4",
            mimeType: "video/mp4",
            byteSize: posterVideoBytes.byteLength,
            durationMs: 1000,
            width: 640,
            height: 360,
            objectKey: posterVideoPath,
            storageProvider: store.provider,
            blobUrl: null,
            sha256: posterVideoSha,
            poster: {
              objectKey: posterPath,
              storageProvider: store.provider,
              blobUrl: null,
              mimeType: "image/webp",
              byteSize: posterBytes.byteLength,
              width: 640,
              height: 360,
            },
            uploadedAt: new Date().toISOString(),
          },
        }),
        createdByUserId: user.id,
      }).returning();
      await deleteVideoVersion(scope, project.id, first.designId, posterVersion.id);
      expect(await db.select().from(blobDeletionJobs)
        .where(eq(blobDeletionJobs.objectKey, posterVideoPath))).toHaveLength(1);
      expect(await db.select().from(blobDeletionJobs)
        .where(eq(blobDeletionJobs.objectKey, posterPath))).toHaveLength(1);
      await db.delete(rooms).where(eq(rooms.id, room.id));
      expect(await db.select().from(projectDesignVersions)
        .where(eq(projectDesignVersions.id, first.designVersionId))).toHaveLength(1);
      expect(await db.select().from(revisionDesignVersions)
        .where(eq(revisionDesignVersions.designVersionId, first.designVersionId))).toHaveLength(1);
      expect(await db.select().from(revisions).where(eq(revisions.id, revision.id))).toHaveLength(0);
    } finally {
      await db.delete(rooms).where(eq(rooms.organizationId, organization.id));
      await db.delete(organizations).where(eq(organizations.id, organization.id));
      await db.delete(users).where(eq(users.id, otherUser.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }, 120_000);
});
