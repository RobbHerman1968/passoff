"use client";

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createVideoNoteAction } from "@/app/(app)/projects/video-note-actions";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Button } from "@/components/ui/button";
import { VideoNoteComposer, type VideoNoteSubmit } from "@/components/video/video-note-composer";
import { VideoNoteList } from "@/components/video/video-note-list";
import { VideoNoteOverlay } from "@/components/video/video-note-overlay";
import { VideoNoteTimeline } from "@/components/video/video-note-timeline";
import {
  VideoEvidencePlayer,
  type VideoPlayerController,
} from "@/components/video/video-evidence-player";
import type { Point } from "@/lib/video/annotations/geometry";
import {
  clampVideoTimestamp,
  formatVideoTimestamp,
  spokenVideoTimestamp,
  videoNoteLabel,
  VIDEO_NOTE_SELECT_EVENT,
  type VideoNoteSelectDetail,
  type VideoNoteView,
} from "@/lib/video/annotations/types";
import {
  isNoteVisibleAt,
  sameIds,
  visibleNoteIds,
} from "@/lib/video/annotations/window";

type ComposerState = {
  timestampMs: number;
  pin: Point | null;
  placing: boolean;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Time that has to pass after choosing a note before the player may clear the choice. */
const SELECTION_SETTLE_MS = 1_500;

/**
 * The video player with its notes: pins for the moment on screen, timeline markers, the
 * "Add note at this time" form, and the ordered list. Notes belong to the clip they were
 * written for, so only notes on the current clip are drawn on the picture.
 */
export function VideoNotesPanel({
  projectId,
  reviewId,
  issueNumber,
  videoAssetId,
  durationSeconds,
  notes,
  onNotesChange,
  canAddNotes,
  readOnlyReason,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  videoAssetId: string;
  durationSeconds: number | null;
  notes: VideoNoteView[];
  onNotesChange: (notes: VideoNoteView[]) => void;
  /** Workspace members on an issue that can still be changed. */
  canAddNotes: boolean;
  /** One line explaining why notes can't be added, shown in place of the button. */
  readOnlyReason?: string | null;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const controllerRef = useRef<VideoPlayerController | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const draftPinRef = useRef<HTMLButtonElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const settleUntilRef = useRef(0);

  const currentNotes = useMemo(
    () => notes.filter((note) => note.videoAssetId === videoAssetId && note.videoState === "current"),
    [notes, videoAssetId],
  );
  const currentNotesRef = useRef(currentNotes);
  useEffect(() => {
    currentNotesRef.current = currentNotes;
  }, [currentNotes]);

  const [durationMs, setDurationMs] = useState<number | null>(
    durationSeconds != null ? Math.round(durationSeconds * 1_000) : null,
  );
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Runs a few times a second while playing. React only re-renders when the set of notes for
  // this moment actually changes, never on every tick.
  const handleMoment = useCallback((ms: number) => {
    const next = visibleNoteIds(currentNotesRef.current, ms);
    setVisibleIds((previous) => (sameIds(previous, next) ? previous : next));

    const selected = selectedIdRef.current;
    if (selected && Date.now() > settleUntilRef.current) {
      const note = currentNotesRef.current.find((item) => item.id === selected);
      if (!note || !isNoteVisibleAt(note.timestampMs, ms)) {
        selectedIdRef.current = null;
        setSelectedId(null);
      }
    }
  }, []);

  // Notes arriving or leaving change which pins belong to this moment.
  useEffect(() => {
    const controller = controllerRef.current;
    if (controller) handleMoment(controller.getCurrentTimeMs());
  }, [currentNotes, handleMoment]);

  const selectNote = useCallback(
    (note: VideoNoteView, options: { scrollIntoView?: boolean } = {}) => {
      const controller = controllerRef.current;
      if (!controller || note.videoState !== "current") return;
      settleUntilRef.current = Date.now() + SELECTION_SETTLE_MS;
      controller.pause();
      controller.seekToMs(note.timestampMs);
      selectedIdRef.current = note.id;
      setSelectedId(note.id);
      handleMoment(note.timestampMs);
      setAnnouncement(
        `${videoNoteLabel(note)}. The video is paused at ${spokenVideoTimestamp(note.timestampMs)}.${note.x != null ? " The pin is shown on the video." : ""}`,
      );
      if (options.scrollIntoView) {
        regionRef.current?.scrollIntoView({
          block: "nearest",
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      }
    },
    [handleMoment],
  );

  // A person choosing "Go to" on a note in the discussion.
  useEffect(() => {
    function onSelect(event: Event) {
      const detail = (event as CustomEvent<VideoNoteSelectDetail>).detail;
      const note = currentNotesRef.current.find((item) => item.id === detail?.annotationId);
      if (note) selectNote(note, { scrollIntoView: true });
    }
    window.addEventListener(VIDEO_NOTE_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(VIDEO_NOTE_SELECT_EVENT, onSelect);
  }, [selectNote]);

  const onController = useCallback((controller: VideoPlayerController | null) => {
    controllerRef.current = controller;
  }, []);

  function openComposer() {
    const controller = controllerRef.current;
    controller?.exitFullscreen();
    controller?.pause();
    const now = controller?.getCurrentTimeMs() ?? 0;
    setComposer({
      timestampMs: clampVideoTimestamp(now, durationMs),
      pin: null,
      placing: false,
    });
    setAnnouncement("The video is paused. Write your note.");
  }

  function closeComposer() {
    setComposer(null);
    requestAnimationFrame(() => addButtonRef.current?.focus());
  }

  function changeComposerTime(ms: number) {
    const next = clampVideoTimestamp(ms, durationMs);
    controllerRef.current?.seekToMs(next);
    handleMoment(next);
    setComposer((current) => (current ? { ...current, timestampMs: next } : current));
  }

  const submitNote: VideoNoteSubmit = async ({ body, visibility, timestampMs }) => {
    if (!composer) return { ok: false, message: "Open the note form and try again." };
    const result = await createVideoNoteAction({
      projectId,
      reviewId,
      issueNumber,
      videoAssetId,
      timestampMs,
      x: composer.pin?.x ?? null,
      y: composer.pin?.y ?? null,
      body,
      visibility,
    });
    if (!result.ok) return { ok: false, message: result.message };

    onNotesChange(result.notes);
    const saved = result.note;
    setComposer(null);
    settleUntilRef.current = Date.now() + SELECTION_SETTLE_MS;
    selectedIdRef.current = saved.id;
    setSelectedId(saved.id);
    handleMoment(saved.timestampMs);
    const message =
      saved.visibility === "private"
        ? `Private note added at ${formatVideoTimestamp(saved.timestampMs)}.`
        : `Note added at ${formatVideoTimestamp(saved.timestampMs)}.`;
    setAnnouncement(message);
    toast.success(message);
    // The note also shows up in the discussion, so bring that up to date.
    router.refresh();
    requestAnimationFrame(() => addButtonRef.current?.focus());
    return { ok: true };
  };

  const pinNotes = useMemo(() => {
    const ids = new Set(visibleIds);
    if (selectedId) ids.add(selectedId);
    return currentNotes.filter((note) => ids.has(note.id));
  }, [visibleIds, selectedId, currentNotes]);

  const selectedNote = currentNotes.find((note) => note.id === selectedId) ?? null;

  const overlay = (
    <VideoNoteOverlay
      pins={pinNotes}
      selectedId={selectedId}
      onSelect={(note) => selectNote(note)}
      draftPin={composer?.pin ?? null}
      onDraftPinChange={(point) =>
        setComposer((current) => (current ? { ...current, pin: point } : current))
      }
      draftPinRef={draftPinRef}
      placing={composer?.placing ?? false}
      onPlace={(point) =>
        setComposer((current) => (current ? { ...current, pin: point, placing: false } : current))
      }
      onAddNoteFromFullscreen={canAddNotes ? openComposer : undefined}
    />
  );

  return (
    <div ref={regionRef} className="grid min-w-0 gap-4">
      <VideoEvidencePlayer
        videoAssetId={videoAssetId}
        title={`Video evidence for issue ${issueNumber}`}
        onController={onController}
        onMoment={handleMoment}
        onDuration={setDurationMs}
        overlay={overlay}
      />

      <VideoNoteTimeline
        notes={currentNotes}
        durationMs={durationMs}
        selectedId={selectedId}
        onSelect={(note) => selectNote(note)}
      />

      {selectedNote ? (
        <div
          className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
          data-testid="selected-note"
        >
          <p className="font-medium tabular-nums">{videoNoteLabel(selectedNote)}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{selectedNote.body}</p>
        </div>
      ) : null}

      {canAddNotes ? (
        composer ? (
          <VideoNoteComposer
            timestampMs={composer.timestampMs}
            durationMs={durationMs}
            hasPin={composer.pin != null}
            placing={composer.placing}
            online={online}
            canChooseVisibility
            onTimestampChange={changeComposerTime}
            onUseCurrentTime={() => {
              const now = controllerRef.current?.getCurrentTimeMs();
              if (now != null) {
                setComposer((current) =>
                  current
                    ? { ...current, timestampMs: clampVideoTimestamp(now, durationMs) }
                    : current,
                );
              }
            }}
            onAddPin={() => {
              setComposer((current) =>
                current ? { ...current, pin: { x: 0.5, y: 0.5 }, placing: false } : current,
              );
              requestAnimationFrame(() => draftPinRef.current?.focus());
            }}
            onRemovePin={() =>
              setComposer((current) => (current ? { ...current, pin: null, placing: false } : current))
            }
            onTogglePlacing={() =>
              setComposer((current) => (current ? { ...current, placing: !current.placing } : current))
            }
            onWriting={() => controllerRef.current?.pause()}
            onCancel={closeComposer}
            onSubmit={submitNote}
          />
        ) : (
          <div>
            <Button ref={addButtonRef} type="button" onClick={openComposer}>
              <MessageSquarePlus data-icon="inline-start" aria-hidden="true" />
              Add note at this time
            </Button>
            <p className="mt-2 text-sm text-muted-foreground">
              Pause the video at the moment you mean, then add a note. You can add a pin too.
            </p>
          </div>
        )
      ) : readOnlyReason ? (
        <p className="text-sm text-muted-foreground">{readOnlyReason}</p>
      ) : null}

      <VideoNoteList
        notes={notes}
        selectedId={selectedId}
        onSelect={(note) => selectNote(note)}
        canReply
        emptyMessage={
          canAddNotes
            ? "No notes on this video yet. Pause at the moment that matters, then choose Add note at this time."
            : "No notes on this video yet."
        }
      />

      <p className="sr-only" role="status" aria-live="polite" data-testid="video-notes-status">
        {announcement}
      </p>
    </div>
  );
}
