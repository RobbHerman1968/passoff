"use client";

import { Clock, Lock, MapPin, MessageSquare, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRelativeActivity } from "@/lib/projects/format";
import {
  formatVideoTimestamp,
  spokenVideoTimestamp,
  videoNoteHistoricalWarning,
  videoNoteVideoStateLabel,
  type VideoNoteView,
} from "@/lib/video/annotations/types";

export const DISCUSSION_REPLY_FIELD_ID = "issue-discussion-reply";

function focusDiscussionReply() {
  const field = document.getElementById(DISCUSSION_REPLY_FIELD_ID);
  if (!field) return;
  field.scrollIntoView({ block: "center" });
  field.focus();
}

function NoteItem({
  note,
  selected,
  onSelect,
  canReply,
}: {
  note: VideoNoteView;
  selected: boolean;
  onSelect?: (note: VideoNoteView) => void;
  canReply: boolean;
}) {
  const headingId = useId();
  const isCurrent = note.videoState === "current";
  const isPrivate = note.visibility === "private";
  const time = formatVideoTimestamp(note.timestampMs);

  return (
    <li>
      <article
        aria-labelledby={headingId}
        data-testid={`note-item-${note.number}`}
        data-note-id={note.id}
        data-selected={selected || undefined}
        className={[
          "rounded-lg border bg-background p-3 sm:p-4",
          selected ? "border-primary ring-2 ring-ring/40" : "border-border",
        ].join(" ")}
      >
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <h4 id={headingId} className="font-semibold tabular-nums">
            Note {note.number} at {time}
          </h4>
          {isPrivate ? (
            <Badge variant="secondary">
              <Lock data-icon="inline-start" aria-hidden="true" />
              Private note
            </Badge>
          ) : null}
          {note.x != null ? (
            <Badge variant="outline">
              <MapPin data-icon="inline-start" aria-hidden="true" />
              Pin on the video
            </Badge>
          ) : null}
          {!isCurrent ? (
            <Badge variant="outline">{videoNoteVideoStateLabel(note.videoState)}</Badge>
          ) : null}
        </header>
        <p className="mt-1 text-xs text-muted-foreground">
          {note.authorDisplayName} ·{" "}
          <time dateTime={note.createdAt} suppressHydrationWarning>
            {formatRelativeActivity(note.createdAt)}
          </time>
          {isPrivate ? " · Only your team can see this note." : ""}
        </p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
          {note.body}
        </p>
        {!isCurrent ? (
          <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{videoNoteHistoricalWarning(note.videoState)}</span>
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          {isCurrent && onSelect ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Go to note ${note.number} at ${spokenVideoTimestamp(note.timestampMs)}`}
              onClick={() => onSelect(note)}
            >
              <Clock data-icon="inline-start" aria-hidden="true" />
              Go to {time}
            </Button>
          ) : null}
          {canReply ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Reply to note ${note.number} in the discussion`}
              onClick={focusDiscussionReply}
            >
              <MessageSquare data-icon="inline-start" aria-hidden="true" />
              Reply in discussion
            </Button>
          ) : null}
        </div>
      </article>
    </li>
  );
}

/**
 * Every note on the video as an ordered list, in time order. This is the full alternative to
 * the pins and timeline markers: nothing is only reachable by pointing at the picture.
 * Notes written for an earlier clip are kept apart and clearly marked.
 */
export function VideoNoteList({
  notes,
  selectedId,
  onSelect,
  canReply,
  emptyMessage,
}: {
  notes: VideoNoteView[];
  selectedId?: string | null;
  /** Leave out when the clip can't be played here. Notes then show without a jump button. */
  onSelect?: (note: VideoNoteView) => void;
  canReply: boolean;
  /** Shown when there are no notes at all. Pass null to show nothing. */
  emptyMessage?: string | null;
}) {
  const headingId = useId();
  const current = notes.filter((note) => note.videoState === "current");
  const earlier = notes.filter((note) => note.videoState !== "current");

  if (notes.length === 0) {
    return emptyMessage ? (
      <p className="text-sm text-muted-foreground" data-testid="notes-empty">
        {emptyMessage}
      </p>
    ) : null;
  }

  return (
    <div className="grid gap-4" data-testid="note-list">
      {current.length > 0 ? (
        <section aria-labelledby={`${headingId}-current`}>
          <h3 id={`${headingId}-current`} className="text-sm font-medium">
            Notes on this video ({current.length})
          </h3>
          <ol aria-label="Notes on this video, in time order" className="mt-2 grid gap-3">
            {current.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                selected={note.id === selectedId}
                onSelect={onSelect}
                canReply={canReply}
              />
            ))}
          </ol>
        </section>
      ) : null}

      {earlier.length > 0 ? (
        <section aria-labelledby={`${headingId}-earlier`}>
          <h3 id={`${headingId}-earlier`} className="text-sm font-medium">
            Notes from videos that are no longer here ({earlier.length})
          </h3>
          <Alert variant="warning" role="status" className="mt-2">
            <TriangleAlert aria-hidden="true" />
            <p data-slot="alert-description">
              These notes belong to an earlier or removed video. They are kept for the record,
              but their times can’t be played.
            </p>
          </Alert>
          <ol aria-label="Notes from earlier videos, in time order" className="mt-2 grid gap-3">
            {earlier.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                selected={false}
                canReply={canReply}
              />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
