"use client";

import { Lock } from "lucide-react";

import {
  videoNoteAccessibleName,
  type VideoNoteView,
} from "@/lib/video/annotations/types";
import { timelinePercent } from "@/lib/video/annotations/window";

/**
 * Markers for every note on the current video, drawn under the player. The player's own
 * timeline can't hold buttons, so this strip is the keyboard and screen-reader way to jump
 * to a note. The ordered list below it carries the same information in words.
 */
export function VideoNoteTimeline({
  notes,
  durationMs,
  selectedId,
  onSelect,
}: {
  notes: VideoNoteView[];
  durationMs: number | null;
  selectedId: string | null;
  onSelect: (note: VideoNoteView) => void;
}) {
  if (notes.length === 0) return null;

  if (durationMs == null || durationMs <= 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="note-timeline-pending">
        The note timeline appears once the video has loaded. You can still use the list of
        notes below.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Timeline of ${notes.length} ${notes.length === 1 ? "note" : "notes"} on the video`}
      className="relative mx-5 h-11"
      data-testid="note-timeline"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border"
      />
      {notes.map((note) => {
        const left = timelinePercent(note.timestampMs, durationMs);
        if (left == null) return null;
        const selected = note.id === selectedId;
        const isPrivate = note.visibility === "private";
        return (
          <button
            key={note.id}
            type="button"
            data-testid={`note-marker-${note.number}`}
            aria-label={videoNoteAccessibleName(note)}
            aria-pressed={selected}
            onClick={() => onSelect(note)}
            className="absolute top-0 flex size-11 -translate-x-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring"
            style={{ left: `${left}%` }}
          >
            <span
              aria-hidden="true"
              className={[
                "flex size-6 items-center justify-center rounded-full border-2 bg-primary text-xs font-semibold tabular-nums text-primary-foreground",
                isPrivate ? "border-dashed border-foreground" : "border-background",
                selected ? "ring-3 ring-ring" : "",
              ].join(" ")}
            >
              {note.number}
              {isPrivate ? <Lock className="size-2.5" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
