import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  signPlaybackId: vi.fn(),
  unwrap: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@mux/ts", () => ({
  default: class MockMux {
    video = { uploads: { create: mocks.create } };
    jwt = { signPlaybackId: mocks.signPlaybackId };
    webhooks = { unwrap: mocks.unwrap };
  },
}));

describe("Mux video provider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mocks.create.mockReset();
    mocks.signPlaybackId.mockReset();
    mocks.unwrap.mockReset();
  });

  it("requires both Vercel-provided Mux credentials", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "");
    vi.stubEnv("MUX_TOKEN_SECRET", "");
    const { getMuxClient, MuxConfigurationError } = await import("@/lib/video/mux");

    expect(() => getMuxClient()).toThrow(MuxConfigurationError);
  });

  it("creates a private Basic upload capped at 1080p for the exact app origin", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "token-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "token-secret");
    mocks.create.mockResolvedValue({ id: "upload-id", url: "https://storage.example/upload" });
    const { createMuxDirectUpload } = await import("@/lib/video/mux");

    await createMuxDirectUpload({
      origin: "https://app.passoff.test",
      videoAssetId: "video-asset-id",
    });

    expect(mocks.create).toHaveBeenCalledWith({
      cors_origin: "https://app.passoff.test",
      timeout: 3600,
      new_asset_settings: {
        passthrough: "video-asset-id",
        playback_policies: ["signed"],
        video_quality: "basic",
        max_resolution_tier: "1080p",
        master_access: "none",
      },
    });
  });

  it("signs short-lived playback, thumbnail, and storyboard tokens", async () => {
    vi.stubEnv("MUX_TOKEN_ID", "token-id");
    vi.stubEnv("MUX_TOKEN_SECRET", "token-secret");
    vi.stubEnv("MUX_SIGNING_KEY", "signing-key-id");
    vi.stubEnv("MUX_PRIVATE_KEY", "private-key");
    mocks.signPlaybackId.mockResolvedValue({
      "playback-token": "play",
      "thumbnail-token": "thumb",
      "storyboard-token": "story",
    });

    const { signMuxPlaybackTokens, MUX_PLAYBACK_TOKEN_TTL } = await import("@/lib/video/mux");
    const tokens = await signMuxPlaybackTokens("playback-id");

    expect(MUX_PLAYBACK_TOKEN_TTL).toBe("15m");
    expect(mocks.signPlaybackId).toHaveBeenCalledWith("playback-id", {
      keyId: "signing-key-id",
      keySecret: "private-key",
      expiration: "15m",
      type: ["video", "thumbnail", "storyboard"],
    });
    expect(tokens).toEqual({
      playback: "play",
      thumbnail: "thumb",
      storyboard: "story",
    });
  });
});

