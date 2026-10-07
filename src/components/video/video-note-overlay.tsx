"use client";

import { Lock, MessageSquarePlus } from "lucide-react";
import type { KeyboardEvent, PointerEvent, Ref } from "react";

import { Button } from "@/components/ui/button";
import { nudgeNormalized, type Point } from "@/lib/video/annotations/geometry";
import { videoNoteAccessibleName, type VideoNoteView } from "@/lib/video/annotations/types";
import { useVideoPlayerOverlay } from "@/components/video/video-evidence-player";

/** The percent text read aloud for a pin that has no words of its own yet. */
function percent(value: number): number {
  return Math.round(value * 100);
}

/**
 * Pins drawn over the picture for the current moment, plus the pin being placed while a note
 * is written. Everything is positioned as a fraction of the picture itself, so it stays put
 * when the player resizes, goes full screen, or the page is zoomed.
 */
export function VideoNoteOverlay({
  pins,
  selectedId,
  onSelect,
  draftPin,
  onDraftPinChange,
  draftPinRef,
  placing,
  onPlace,
  onAddNoteFromFullscreen,
}: {
  /** Notes to draw now: the ones in the current moment, plus the selected one. */
  pins: VideoNoteView[];
  selectedId: string | null;
  onSelect: (note: VideoNoteView) => void;
  draftPin: Point | null;
  onDraftPinChange: (point: Point) => void;
  draftPinRef?: Ref<HTMLButtonElement>;
  placing: boolean;
  onPlace: (point: Point) => void;
  /** Shown only in full screen, where the note form is out of reach. */
  onAddNoteFromFullscreen?: () => void;
}) {
  const info = useVideoPlayerOverlay();
  const content = info?.content ?? null;

  function handlePlacement(event: PointerEvent<HTMLDivElement>) {
    const point = info?.clientToNormalized(event.clientX, event.clientY, { clampToEdge: true });
    if (point) onPlace(point);
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!draftPin) return;
    const next = nudgeNormalized(draftPin, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onDraftPinChange(next);
  }

  if (!info) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {content ? (
        <div
          data-testid="note-content-area"
          className="absolute"
          style={{
            left: content.left,
            top: content.top,
            width: content.width,
            height: content.height,
          }}
        >
          {placing ? (
            <div
              data-testid="pin-placement-surface"
              aria-hidden="true"
              onPointerUp={handlePlacement}
              className="pointer-events-auto absolute inset-0 cursor-crosshair border-2 border-dashed border-primary bg-primary/10"
            />
          ) : null}

          {pins.map((note) => {
            if (note.x == null || note.y == null) return null;
            const selected = note.id === selectedId;
            const isPrivate = note.visibility === "private";
            return (
              <button
                key={note.id}
                type="button"
                data-testid={`note-pin-${note.number}`}
                aria-label={videoNoteAccessibleName(note)}
                aria-pressed={selected}
                onClick={() => onSelect(note)}
                className="pointer-events-auto absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
                style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
              >
                <span
                  aria-hidden="true"
                  className={[
                    "flex size-7 items-center justify-center rounded-full border-2 bg-primary text-xs font-semibold tabular-nums text-primary-foreground shadow-md",
                    isPrivate ? "border-dashed border-background" : "border-background",
                    selected ? "ring-4 ring-ring" : "",
                  ].join(" ")}
                >
                  {note.number}
                  {isPrivate ? <Lock className="ml-0.5 size-2.5" /> : null}
                </span>
              </button>
            );
          })}

          {draftPin ? (
            <button
              ref={draftPinRef}
              type="button"
              data-testid="draft-pin"
              aria-label={`New pin, ${percent(draftPin.x)} percent from the left and ${percent(draftPin.y)} percent from the top. Use the arrow keys to move it.`}
              onKeyDown={handleDraftKeyDown}
              className="pointer-events-auto absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
              style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }}
            >
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-full border-2 border-dashed border-primary bg-background text-xs font-semibold text-primary shadow-md"
              >
                +
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {info.fullscreen && onAddNoteFromFullscreen ? (
        <div className="pointer-events-auto absolute right-3 top-3">
          <Button type="button" size="sm" onClick={onAddNoteFromFullscreen}>
            <MessageSquarePlus data-icon="inline-start" aria-hidden="true" />
            Add note at this time
          </Button>
        </div>
      ) : null}
    </div>
  );
}
