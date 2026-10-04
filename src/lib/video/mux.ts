import "server-only";

import Mux from "@mux/ts";

export class MuxConfigurationError extends Error {
  constructor(message = "Mux Video is not configured.") {
    super(message);
    this.name = "MuxConfigurationError";
  }
}

export const MUX_PLAYBACK_TOKEN_TTL = "15m";

let muxClient: Mux | null = null;
let muxWebhookClient: Mux | null = null;

export function getMuxClient() {
  if (muxClient) return muxClient;

  const tokenId = process.env.MUX_TOKEN_ID?.trim();
  const tokenSecret = process.env.MUX_TOKEN_SECRET?.trim();
  if (!tokenId || !tokenSecret) {
    throw new MuxConfigurationError();
  }

  muxClient = new Mux({
    tokenId,
    tokenSecret,
    webhookSecret: process.env.MUX_WEBHOOK_SECRET?.trim() || undefined,
    jwtSigningKey: process.env.MUX_SIGNING_KEY?.trim() || undefined,
    jwtPrivateKey: process.env.MUX_PRIVATE_KEY?.trim() || undefined,
  });
  return muxClient;
}

export function getMuxWebhookClient() {
  if (muxWebhookClient) return muxWebhookClient;

  const webhookSecret = process.env.MUX_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new MuxConfigurationError("Mux webhook verification is not configured.");
  }

  muxWebhookClient = new Mux({ webhookSecret });
  return muxWebhookClient;
}

export async function createMuxDirectUpload(input: {
  origin: string;
  videoAssetId: string;
}) {
  return getMuxClient().video.uploads.create({
    cors_origin: input.origin,
    timeout: 60 * 60,
    new_asset_settings: {
      passthrough: input.videoAssetId,
      playback_policies: ["signed"],
      video_quality: "basic",
      max_resolution_tier: "1080p",
      master_access: "none",
    },
  });
}

export type SignedPlaybackTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

export async function signMuxPlaybackTokens(playbackId: string): Promise<SignedPlaybackTokens> {
  const signingKey = process.env.MUX_SIGNING_KEY?.trim();
  const privateKey = process.env.MUX_PRIVATE_KEY?.trim();
  if (!signingKey || !privateKey) {
    throw new MuxConfigurationError("Mux signed playback is not configured.");
  }

  const tokens = await getMuxClient().jwt.signPlaybackId(playbackId, {
    keyId: signingKey,
    keySecret: privateKey,
    expiration: MUX_PLAYBACK_TOKEN_TTL,
    type: ["video", "thumbnail", "storyboard"],
  });

  const playback = tokens["playback-token"];
  const thumbnail = tokens["thumbnail-token"];
  const storyboard = tokens["storyboard-token"];
  if (!playback || !thumbnail || !storyboard) {
    throw new MuxConfigurationError("Mux playback token signing failed.");
  }

  return { playback, thumbnail, storyboard };
}
