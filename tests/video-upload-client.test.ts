import { describe, expect, it, vi } from "vitest";

import { pollVideoUploadSession } from "@/lib/projects/video-upload-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("project video upload polling", () => {
  it("waits for completion of the exact upload session", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ uploadSessionId: "session-a", status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({
        uploadSessionId: "session-a",
        status: "completed",
        video: { designVersionId: "version-a", originalFilename: "same.mp4" },
      }));
    const result = await pollVideoUploadSession<{ designVersionId: string }>({
      projectId: "project-a",
      uploadSessionId: "session-a",
      fetchImpl,
      wait: async () => undefined,
    });
    expect(result.designVersionId).toBe("version-a");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/client-projects/project-a/videos/uploads/session-a",
      { cache: "no-store" },
    );
  });

  it("does not accept another session even if filename or version evidence could match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      uploadSessionId: "historical-session",
      status: "completed",
      video: {
        originalFilename: "same.mp4",
        designVersionId: "currently-selected-version",
      },
    }));
    await expect(pollVideoUploadSession({
      projectId: "project-a",
      uploadSessionId: "new-session",
      fetchImpl,
      attempts: 1,
    })).rejects.toThrow(/did not match/i);
  });

  it("reports server completion failures", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      uploadSessionId: "session-a",
      status: "failed",
      error: "Video checksum mismatch.",
    }));
    await expect(pollVideoUploadSession({
      projectId: "project-a",
      uploadSessionId: "session-a",
      fetchImpl,
    })).rejects.toThrow("Video checksum mismatch.");
  });

  it("treats polling exhaustion as an error", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => jsonResponse({
      uploadSessionId: "session-a",
      status: "pending",
    }));
    await expect(pollVideoUploadSession({
      projectId: "project-a",
      uploadSessionId: "session-a",
      fetchImpl,
      attempts: 2,
      intervalMs: 0,
      wait: async () => undefined,
    })).rejects.toThrow(/timed out/i);
  });
});
