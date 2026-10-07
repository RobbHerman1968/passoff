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

export type MuxDeleteOutcome =
  /** The provider no longer holds the video (deleted now, or already gone). */
  | { done: true }
  /** Try again later. `code` is a short label, never a raw provider message. */
  | { done: false; code: "not_configured" | "provider_error" | "upload_in_progress" };

function providerStatus(error: unknown): number | null {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

/** Deletes the stored video at Mux. A video Mux no longer has counts as deleted. */
export async function deleteMuxAsset(providerAssetId: string): Promise<MuxDeleteOutcome> {
  let client: Mux;
  try {
    client = getMuxClient();
  } catch {
    return { done: false, code: "not_configured" };
  }
  try {
    await client.video.assets.delete(providerAssetId);
    return { done: true };
  } catch (error) {
    if (providerStatus(error) === 404) return { done: true };
    return { done: false, code: "provider_error" };
  }
}

/**
 * Cancels an upload that has not produced a video yet. If Mux already started the
 * video, this reports "upload_in_progress" so the caller waits for the asset id and
 * deletes the video instead.
 */
export async function cancelMuxUpload(providerUploadId: string): Promise<MuxDeleteOutcome> {
  let client: Mux;
  try {
    client = getMuxClient();
  } catch {
    return { done: false, code: "not_configured" };
  }
  try {
    await client.video.uploads.cancel(providerUploadId);
    return { done: true };
  } catch (error) {
    const status = providerStatus(error);
    if (status === 404) return { done: true };
    if (status === 400 || status === 409 || status === 422) {
      return { done: false, code: "upload_in_progress" };
    }
    return { done: false, code: "provider_error" };
  }
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
