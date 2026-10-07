"use client";

import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { Maximize2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/button";
import {
  clientPointToNormalized,
  containedContentRect,
  rectsEqual,
  type Point,
  type Rect,
} from "@/lib/video/annotations/geometry";

type PlayerTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

type PlaybackResponse = {
  ok: boolean;
  playbackId?: string;
  tokens?: PlayerTokens;
  expiresInSeconds?: number;
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

/**
 * What the notes layer may ask of the player. It never reaches into the player itself, so the
 * player can change without touching note code.
 */
export type VideoPlayerController = {
  getCurrentTimeMs(): number;
  /** The clip's length as the player measured it. Null until the player knows. */
  getDurationMs(): number | null;
  seekToMs(ms: number): void;
  pause(): void;
  exitFullscreen(): void;
};

export type VideoPlayerOverlayInfo = {
  /** Where the picture is, in pixels from the top-left of the player area. */
  content: Rect | null;
  fullscreen: boolean;
  /**
   * Turns a pointer position (clientX, clientY) into a position inside the picture, using the
   * player's size at that moment. Null when the point is outside the picture, unless
   * `clampToEdge` is set.
   */
  clientToNormalized: (
    clientX: number,
    clientY: number,
    options?: { clampToEdge?: boolean },
  ) => Point | null;
};

const OverlayContext = createContext<VideoPlayerOverlayInfo | null>(null);

/** What an overlay drawn inside the player needs to know about the picture. */
export function useVideoPlayerOverlay(): VideoPlayerOverlayInfo | null {
  return useContext(OverlayContext);
}

const OFFLINE_MESSAGE = "You’re offline. Reconnect, then try playing this video again.";

/**
 * Plays one clip of video evidence. Short-lived access is requested from Passoff each time
 * the player opens, for workspace members and for guests with a live review link. The
 * player waits for a press of play before it downloads any video, never starts on its own,
 * and pauses when the tab is hidden. Access is kept only in memory.
 */
export function VideoEvidencePlayer({
  videoAssetId,
  title = "Video evidence",
  onController,
  onMoment,
  onDuration,
  overlay,
}: {
  videoAssetId: string;
  title?: string;
  /** Receives the controller once the player is on screen, and null when it goes away. */
  onController?: (controller: VideoPlayerController | null) => void;
  /** Called with the current time on play, pause, seek, and about four times a second. */
  onMoment?: (ms: number) => void;
  onDuration?: (ms: number) => void;
  /**
   * Drawn on top of the picture, inside the same box (and so inside full screen). Read the
   * picture's position with `useVideoPlayerOverlay`.
   */
  overlay?: ReactNode;
}) {
  const statusId = useId();
  const playerRef = useRef<MuxPlayerRefAttributes>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState<Rect | null>(null);
  const contentRef = useRef<Rect | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported] = useState(
    () => typeof document !== "undefined" && Boolean(document.fullscreenEnabled),
  );
  const refreshedAfterErrorRef = useRef(false);
  const [state, setState] = useState<PlayerViewState>({ kind: "loading" });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    refreshedAfterErrorRef.current = false;

    async function authorize() {
      setState({ kind: "loading" });

      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        if (!cancelled) setState({ kind: "offline", message: OFFLINE_MESSAGE });
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
          setState({ kind: "offline", message: OFFLINE_MESSAGE });
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

  // Pause when the tab is hidden so a clip never plays unseen.
  useEffect(() => {
    if (state.kind !== "ready") return;
    function onVisibilityChange() {
      if (document.hidden) playerRef.current?.pause();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [state.kind]);

  // Access lasts a few minutes. If playback fails after the page sat open, ask once more.
  const onPlayerError = useCallback(() => {
    if (refreshedAfterErrorRef.current) {
      setState({
        kind: "error",
        message: "We couldn’t play this video. Check your connection and try again.",
      });
      return;
    }
    refreshedAfterErrorRef.current = true;
    setRetryCount((count) => count + 1);
  }, []);

  const controller = useMemo<VideoPlayerController>(
    () => ({
      getCurrentTimeMs: () => Math.round((playerRef.current?.currentTime ?? 0) * 1_000),
      getDurationMs: () => {
        const seconds = playerRef.current?.duration;
        return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1_000)
          : null;
      },
      seekToMs: (ms) => {
        const player = playerRef.current;
        if (player) player.currentTime = Math.max(0, ms) / 1_000;
      },
      pause: () => playerRef.current?.pause(),
      exitFullscreen: () => {
        if (typeof document !== "undefined" && document.fullscreenElement) {
          void document.exitFullscreen?.().catch(() => undefined);
        }
      },
    }),
    [],
  );

  const ready = state.kind === "ready";
  useEffect(() => {
    if (!ready) return;
    onController?.(controller);
    return () => onController?.(null);
  }, [ready, controller, onController]);

  // Work out where the picture sits inside the player. This changes only when the player is
  // resized, the page is zoomed, full screen starts or stops, or the video's shape is known,
  // so it is measured on those events and never while the video plays.
  const measure = useCallback(() => {
    const stage = stageRef.current;
    const player = playerRef.current as unknown as HTMLElement | null;
    if (!stage || !player) return;
    const native = (
      playerRef.current as unknown as { media?: { nativeEl?: HTMLVideoElement } } | null
    )?.media?.nativeEl;
    const playerBox = player.getBoundingClientRect();
    const stageBox = stage.getBoundingClientRect();
    const fitted = containedContentRect(
      { width: playerBox.width, height: playerBox.height },
      { width: native?.videoWidth ?? 0, height: native?.videoHeight ?? 0 },
    );
    const next = fitted
      ? {
          left: playerBox.left - stageBox.left + fitted.left,
          top: playerBox.top - stageBox.top + fitted.top,
          width: fitted.width,
          height: fitted.height,
        }
      : null;
    if (rectsEqual(contentRef.current, next)) return;
    contentRef.current = next;
    setContent(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const stage = stageRef.current;
    const player = playerRef.current as unknown as HTMLElement | null;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    if (stage) observer.observe(stage);
    if (player) observer.observe(player);
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === stageRef.current);
      schedule();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("resize", schedule);
    };
  }, [ready, measure]);

  const clientToNormalized = useCallback(
    (clientX: number, clientY: number, options?: { clampToEdge?: boolean }) => {
      const player = playerRef.current as unknown as HTMLElement | null;
      const native = (
        playerRef.current as unknown as { media?: { nativeEl?: HTMLVideoElement } } | null
      )?.media?.nativeEl;
      if (!player) return null;
      return clientPointToNormalized(
        { x: clientX, y: clientY },
        player.getBoundingClientRect(),
        { width: native?.videoWidth ?? 0, height: native?.videoHeight ?? 0 },
        options,
      );
    },
    [],
  );

  const reportMoment = useCallback(() => {
    onMoment?.(controller.getCurrentTimeMs());
  }, [controller, onMoment]);

  const reportDuration = useCallback(() => {
    measure();
    const ms = controller.getDurationMs();
    if (ms != null) onDuration?.(ms);
  }, [controller, measure, onDuration]);

  const overlayInfo = useMemo<VideoPlayerOverlayInfo>(
    () => ({ content, fullscreen, clientToNormalized }),
    [content, fullscreen, clientToNormalized],
  );

  function toggleFullscreen() {
    const stage = stageRef.current;
    if (!stage) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void stage.requestFullscreen().catch(() => undefined);
    }
  }

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
      <div className="flex min-h-48 w-full min-w-0 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-6 text-center sm:aspect-video">
        <p id={statusId} className="max-w-prose text-sm text-foreground" role="status">
          {state.message}
        </p>
        {(state.kind === "error" ||
          state.kind === "offline" ||
          state.kind === "failed" ||
          state.kind === "processing") && (
          <Button type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const stageClass = fullscreen
    ? "relative flex h-screen w-screen items-center justify-center bg-black"
    : "relative w-full overflow-hidden rounded-lg bg-black";

  return (
    <div className="w-full min-w-0">
      <div ref={stageRef} className={stageClass}>
        <MuxPlayer
          ref={playerRef}
          className={
            fullscreen
              ? "aspect-video max-h-full w-full max-w-full bg-black"
              : "aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black"
          }
          // Full screen is provided below so pins stay on the picture. Where the browser can't
          // put a page area full screen (some phones), the player's own button stays.
          style={fullscreenSupported ? { "--fullscreen-button": "none" } : undefined}
          streamType="on-demand"
          playbackId={state.playbackId}
          tokens={state.tokens}
          title={title}
          videoTitle={title}
          preload="none"
          playsInline
          maxResolution="1080p"
          autoPlay={false}
          onError={onPlayerError}
          onLoadedMetadata={reportDuration}
          onDurationChange={reportDuration}
          onTimeUpdate={reportMoment}
          onSeeked={reportMoment}
          onPause={reportMoment}
          onPlay={reportMoment}
          aria-describedby={statusId}
        />
        {overlay ? (
          <OverlayContext.Provider value={overlayInfo}>{overlay}</OverlayContext.Provider>
        ) : null}
      </div>
      {fullscreenSupported && overlay ? (
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={toggleFullscreen}>
            <Maximize2 data-icon="inline-start" aria-hidden="true" />
            Full screen
          </Button>
        </div>
      ) : null}
      <p id={statusId} className="sr-only">
        Video ready to play. Press play to start; it won’t start on its own.
      </p>
    </div>
  );
}
