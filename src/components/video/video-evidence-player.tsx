"use client";

import MuxPlayer from "@mux/mux-player-react";
import { useEffect, useId, useState } from "react";

type PlayerTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

type PlaybackResponse = {
  ok: boolean;
  playbackId?: string;
  tokens?: PlayerTokens;
  code?: string;
  message?: string;
};

type PlayerViewState =
  | { kind: "loading" }
  | { kind: "ready"; playbackId: string; tokens: PlayerTokens }
  | {
      kind: "processing" | "failed" | "needs_attention" | "permission_denied" | "offline" | "error";
      message: string;
    };

function mapErrorState(code: string | undefined, message: string | undefined): PlayerViewState {
  const safeMessage = message ?? "We couldn’t play this video. Try again.";
  switch (code) {
    case "processing":
      return { kind: "processing", message: safeMessage };
    case "failed":
      return { kind: "failed", message: safeMessage };
    case "needs_attention":
      return { kind: "needs_attention", message: safeMessage };
    case "permission_denied":
    case "unauthenticated":
      return { kind: "permission_denied", message: safeMessage };
    default:
      return { kind: "error", message: safeMessage };
  }
}

export function VideoEvidencePlayer({
  videoAssetId,
  title = "Video evidence",
}: {
  videoAssetId: string;
  title?: string;
}) {
  const statusId = useId();
  const [state, setState] = useState<PlayerViewState>({ kind: "loading" });
  const [retryCount, setRetryCount] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function authorize() {
      setState({ kind: "loading" });

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) {
          setState({
            kind: "offline",
            message: "You’re offline. Reconnect, then try playing this video again.",
          });
        }
        return;
      }

      try {
        const response = await fetch(`/api/video/${videoAssetId}/playback`, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const result = (await response.json().catch(() => null)) as PlaybackResponse | null;

        if (cancelled) return;

        if (!response.ok || !result?.ok || !result.playbackId || !result.tokens) {
          setState(
            mapErrorState(
              result?.code,
              result?.message ?? "We couldn’t play this video. Try again.",
            ),
          );
          return;
        }

        setState({
          kind: "ready",
          playbackId: result.playbackId,
          tokens: result.tokens,
        });
      } catch {
        if (cancelled) return;
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setState({
            kind: "offline",
            message: "You’re offline. Reconnect, then try playing this video again.",
          });
          return;
        }
        setState({
          kind: "error",
          message: "We couldn’t play this video. Check your connection and try again.",
        });
      }
    }

    void authorize();
    return () => {
      cancelled = true;
    };
  }, [videoAssetId, retryCount]);

  if (state.kind === "loading") {
    return (
      <div
        className="flex aspect-video w-full min-w-0 items-center justify-center rounded-lg bg-muted px-4 text-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
        id={statusId}
      >
        Preparing video…
      </div>
    );
  }

  if (state.kind !== "ready") {
    return (
      <div className="flex aspect-video w-full min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-6 text-center">
        <p id={statusId} className="max-w-prose text-sm text-foreground" role="status">
          {state.message}
        </p>
        {(state.kind === "error" || state.kind === "offline" || state.kind === "failed") && (
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setRetryCount((count) => count + 1)}
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`w-full min-w-0${reducedMotion ? " motion-reduce:transition-none" : ""}`}
    >
      <MuxPlayer
        className="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black"
        streamType="on-demand"
        playbackId={state.playbackId}
        tokens={state.tokens}
        title={title}
        videoTitle={title}
        preload="metadata"
        playsInline
        accentColor="hsl(var(--primary))"
        maxResolution="1080p"
        autoPlay={false}
        aria-describedby={statusId}
      />
      <p id={statusId} className="sr-only">
        Video ready to play.
      </p>
    </div>
  );
}
