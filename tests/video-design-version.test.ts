import { describe, expect, it } from "vitest";

import {
  PROJECT_DESIGN_VERSION_SCHEMA,
  isVideoDesignVersionPayload,
  parseAnyProjectDesignVersion,
  parseProjectDesignVersion,
  serializeAnyProjectDesignVersion,
  type ProjectDesignVersionPayload,
  type VideoDesignVersionPayload,
} from "@/lib/projects/design-version";
import {
  MAX_VIDEO_UPLOAD_BYTES,
  validateVideoMetadata,
} from "@/lib/projects/video";

const videoPayload: VideoDesignVersionPayload = {
  schemaVersion: PROJECT_DESIGN_VERSION_SCHEMA,
  sourceType: "video",
  video: {
    originalFilename: "review.mp4",
    mimeType: "video/mp4",
    byteSize: 1024,
    durationMs: 5000,
    width: 1920,
    height: 1080,
    objectKey: "workspaces/w/projects/p/videos/review.mp4",
    storageProvider: "local",
    blobUrl: null,
    sha256: "a".repeat(64),
    poster: null,
    uploadedAt: "2026-09-07T00:00:00.000Z",
  },
};

describe("video design versions", () => {
  it.each(["video/mp4", "video/webm"])("accepts %s metadata", (mimeType) => {
    expect(validateVideoMetadata({
      originalFilename: "review",
      mimeType,
      byteSize: 100,
      durationMs: 1000,
      width: 1280,
      height: 720,
      checksum: "b".repeat(64),
    }).mimeType).toBe(mimeType);
  });

  it("rejects unsupported and oversized videos", () => {
    expect(() => validateVideoMetadata({
      originalFilename: "movie.mov",
      mimeType: "video/quicktime",
      byteSize: 100,
      durationMs: 1000,
      checksum: "c".repeat(64),
    })).toThrow(/MP4 and WebM/i);
    expect(() => validateVideoMetadata({
      originalFilename: "large.mp4",
      mimeType: "video/mp4",
      byteSize: MAX_VIDEO_UPLOAD_BYTES + 1,
      durationMs: 1000,
      checksum: "c".repeat(64),
    })).toThrow(/between 1 byte/i);
  });

  it("parses video without reinterpreting it as Figma", () => {
    const serialized = serializeAnyProjectDesignVersion(videoPayload);
    const parsed = parseAnyProjectDesignVersion(serialized);
    expect(isVideoDesignVersionPayload(parsed)).toBe(true);
    expect(() => parseProjectDesignVersion(serialized)).toThrow(/Figma/i);
  });

  it("continues parsing legacy Figma payloads", () => {
    const legacy: ProjectDesignVersionPayload = {
      schemaVersion: 1,
      file: {
        key: "legacy",
        name: "Legacy",
        sourceVersion: null,
        sourceLastModified: null,
        mainScreenId: null,
        thumbnailScreenId: null,
      },
      screens: [],
      interactions: [],
      breakpointGroups: [],
      inspectTrees: [],
      warnings: [],
    };
    expect(parseProjectDesignVersion(JSON.stringify(legacy)).file.key).toBe("legacy");
  });
});
