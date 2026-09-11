import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  organizationName: "Org",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  workspaceName: "Workspace",
  userId: "00000000-0000-4000-8000-000000000003",
  userName: "User",
  userEmail: "user@example.com",
};
const projectId = "00000000-0000-4000-8000-000000000004";
const prepareProjectVideoUpload = vi.hoisted(() => vi.fn());
const completeProjectVideoUploadSession = vi.hoisted(() => vi.fn());
const generateClientTokenFromReadWriteToken = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/authorization", () => ({
  requireClientProjectMembership: async () => ({ scope, project: { id: projectId } }),
  authzResponse: () => null,
}));

vi.mock("@/lib/projects/video", () => ({
  MAX_VIDEO_UPLOAD_BYTES: 500 * 1024 * 1024,
  VIDEO_MIME_TYPES: ["video/mp4", "video/webm"],
  validateVideoMetadata: (metadata: Record<string, unknown>) => ({
    ...metadata,
    originalFilename: metadata.originalFilename,
    mimeType: metadata.mimeType,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    checksum: String(metadata.checksum).toLowerCase(),
  }),
  prepareProjectVideoUpload,
  completeProjectVideoUploadSession,
  completeProjectVideoUpload: vi.fn(),
  deleteUnstoredVideoObject: vi.fn(),
  deleteVideoVersion: vi.fn(),
  listProjectVideos: vi.fn(),
  listVideoVersions: vi.fn(),
}));

vi.mock("@/lib/rooms/storage", () => ({
  getStorageAdapter: () => ({ put: vi.fn() }),
}));

vi.mock("@/lib/site", () => ({ getSiteUrl: () => "https://passoff.example" }));

vi.mock("@vercel/blob/client", () => ({
  generateClientTokenFromReadWriteToken,
  handleUpload: async (options: {
    body: { tokenPayload?: string };
    onUploadCompleted: (input: {
      blob: { pathname: string; url: string };
      tokenPayload: string;
    }) => Promise<void>;
  }) => {
    await options.onUploadCompleted({
      blob: {
        pathname: "workspaces/00000000-0000-4000-8000-000000000002/projects/00000000-0000-4000-8000-000000000004/videos/video.mp4",
        url: "https://private.example/video",
      },
      tokenPayload: options.body.tokenPayload || "",
    });
    return { type: "blob.upload-completed" };
  },
}));

import { POST } from "@/app/api/client-projects/[id]/videos/route";

function prepareRequest() {
  return new Request(`http://localhost/api/client-projects/${projectId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "prepare",
      fileName: "video.mp4",
      contentType: "video/mp4",
      size: 7,
      durationMs: 1000,
      width: 640,
      height: 360,
      checksum: "a".repeat(64),
    }),
  });
}

describe("project video upload route", () => {
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    prepareProjectVideoUpload.mockReset();
    completeProjectVideoUploadSession.mockReset();
    generateClientTokenFromReadWriteToken.mockReset();
    generateClientTokenFromReadWriteToken.mockResolvedValue("client-token");
    let sequence = 10;
    prepareProjectVideoUpload.mockImplementation(async () => {
      const id = `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;
      return {
        id,
        pathname: `workspaces/${scope.workspaceId}/projects/${projectId}/videos/video.mp4`,
        declaredSha256: "a".repeat(64),
      };
    });
  });

  it("returns a unique durable upload session and binds it into the Blob token", async () => {
    const first = await POST(prepareRequest(), { params: Promise.resolve({ id: projectId }) });
    const second = await POST(prepareRequest(), { params: Promise.resolve({ id: projectId }) });
    const firstBody = await first.json() as { uploadSessionId: string };
    const secondBody = await second.json() as { uploadSessionId: string };
    expect(firstBody.uploadSessionId).not.toBe(secondBody.uploadSessionId);
    const tokenOptions = generateClientTokenFromReadWriteToken.mock.calls[0][0];
    const bound = JSON.parse(tokenOptions.onUploadCompleted.tokenPayload);
    expect(bound).toMatchObject({
      projectId,
      uploadSessionId: firstBody.uploadSessionId,
      declaredSha256: "a".repeat(64),
    });
  });

  it("finalizes the exact signed session and ignores the callback URL", async () => {
    const uploadSessionId = "00000000-0000-4000-8000-000000000099";
    const pathname = `workspaces/${scope.workspaceId}/projects/${projectId}/videos/video.mp4`;
    const tokenPayload = JSON.stringify({
      organizationId: scope.organizationId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      projectId,
      uploadSessionId,
      pathname,
      declaredSha256: "b".repeat(64),
    });
    const response = await POST(new Request(`http://localhost/api/client-projects/${projectId}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "blob.upload-completed",
        tokenPayload,
      }),
    }), { params: Promise.resolve({ id: projectId }) });
    expect(response.status).toBe(200);
    expect(completeProjectVideoUploadSession).toHaveBeenCalledWith({
      scope: expect.objectContaining({
        organizationId: scope.organizationId,
        workspaceId: scope.workspaceId,
        userId: scope.userId,
      }),
      projectId,
      uploadSessionId,
      pathname,
      declaredSha256: "b".repeat(64),
    });
    expect(completeProjectVideoUploadSession.mock.calls[0][0]).not.toHaveProperty("blobUrl");
  });
});
