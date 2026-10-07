"use client";

import { ChevronLeft, ChevronRight, MapPin, MapPinOff, Timer } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_COMMENT_MAX_LENGTH } from "@/lib/comments/limits";
import type { CommentVisibility } from "@/lib/comments/types";
import {
  clampVideoTimestamp,
  formatVideoTimestamp,
  parseVideoTimestamp,
  VIDEO_NOTE_TIME_STEP_MS,
} from "@/lib/video/annotations/types";

export type VideoNoteSubmit = (input: {
  body: string;
  visibility: CommentVisibility;
  /** The time the person ended up with, so a time typed just before saving is never lost. */
  timestampMs: number;
}) => Promise<{ ok: true } | { ok: false; message: string }>;

/**
 * The form for one note: what to say, when in the video it applies, an optional pin, and who
 * can see it. The video is paused while this is open. Everything typed is kept if saving
 * fails, and the time and pin can be changed with the keyboard as well as the pointer.
 */
export function VideoNoteComposer({
  timestampMs,
  durationMs,
  hasPin,
  placing,
  online,
  canChooseVisibility,
  onTimestampChange,
  onUseCurrentTime,
  onAddPin,
  onRemovePin,
  onTogglePlacing,
  onWriting,
  onCancel,
  onSubmit,
}: {
  timestampMs: number;
  durationMs: number | null;
  hasPin: boolean;
  placing: boolean;
  online: boolean;
  canChooseVisibility: boolean;
  onTimestampChange: (ms: number) => void;
  onUseCurrentTime: () => void;
  onAddPin: () => void;
  onRemovePin: () => void;
  onTogglePlacing: () => void;
  /** Called when the person starts typing, so the video can be paused again if it was resumed. */
  onWriting: () => void;
  onCancel: () => void;
  onSubmit: VideoNoteSubmit;
}) {
  const baseId = useId();
  const bodyId = `${baseId}-body`;
  const timeId = `${baseId}-time`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);

  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("public");
  const [timeText, setTimeText] = useState(() => formatVideoTimestamp(timestampMs));
  const [lastTimestamp, setLastTimestamp] = useState(timestampMs);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The time can change from outside (the Use current time button, the video being seeked).
  if (timestampMs !== lastTimestamp) {
    setLastTimestamp(timestampMs);
    setTimeText(formatVideoTimestamp(timestampMs));
    setTimeError(null);
  }

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  /** Returns the time to save, or null when the typed time can't be used. */
  function commitTime(text: string): number | null {
    // Untouched text still stands for the exact moment, which can include fractions of a second.
    if (text.trim() === formatVideoTimestamp(timestampMs)) {
      setTimeError(null);
      return timestampMs;
    }
    const parsed = parseVideoTimestamp(text);
    if (parsed == null) {
      setTimeError("Enter a time in the video, like 0:42.");
      return null;
    }
    if (durationMs != null && parsed > durationMs) {
      setTimeError("That time is after the end of the video. Choose a time inside the video.");
      return null;
    }
    setTimeError(null);
    const next = clampVideoTimestamp(parsed, durationMs);
    setTimeText(formatVideoTimestamp(next));
    if (next !== timestampMs) onTimestampChange(next);
    return next;
  }

  function step(deltaMs: number) {
    const next = clampVideoTimestamp(timestampMs + deltaMs, durationMs);
    setTimeError(null);
    onTimestampChange(next);
  }

  function handleBodyChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setBody(event.target.value);
    if (bodyError) setBodyError(null);
    if (saveError && !saving) setSaveError(null);
    onWriting();
  }

  async function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (sendingRef.current) return;

    const trimmed = body.trim();
    if (!trimmed) {
      setBodyError("Write your note before adding it.");
      textareaRef.current?.focus();
      return;
    }
    if (trimmed.length > ISSUE_COMMENT_MAX_LENGTH) {
      setBodyError(
        `Keep this note under ${ISSUE_COMMENT_MAX_LENGTH.toLocaleString("en-US")} characters.`,
      );
      textareaRef.current?.focus();
      return;
    }
    const committed = commitTime(timeText);
    if (committed == null) {
      document.getElementById(timeId)?.focus();
      return;
    }
    if (!online) {
      setSaveError("You’re offline. Your note is still here. Reconnect, then try again.");
      return;
    }

    sendingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSubmit({ body: trimmed, visibility, timestampMs: committed });
      if (!result.ok) {
        setSaveError(result.message);
      }
    } catch {
      setSaveError(
        "We couldn’t add your note. Your text is still here. Check your connection and try again.",
      );
    } finally {
      sendingRef.current = false;
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && !saving) {
      event.stopPropagation();
      onCancel();
    }
  }

  const isPrivate = visibility === "private";
  const submitLabel = saving
    ? "Adding note…"
    : saveError && body.trim()
      ? "Try again"
      : isPrivate
        ? "Add private note"
        : "Add note";

  return (
    <form
      onSubmit={submit}
      onKeyDown={handleKeyDown}
      noValidate
      aria-labelledby={`${baseId}-title`}
      data-testid="note-composer"
      className="grid gap-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div>
        <h3 id={`${baseId}-title`} className="text-sm font-medium">
          Add a note at {formatVideoTimestamp(timestampMs)}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The video is paused while you write. Press Escape to cancel.
        </p>
      </div>

      <FormField id={bodyId} label="Your note" error={bodyError ?? undefined}>
        <Textarea
          ref={textareaRef}
          name="note"
          value={body}
          onChange={handleBodyChange}
          onFocus={onWriting}
          readOnly={saving}
          aria-busy={saving || undefined}
          autoComplete="off"
          rows={4}
        />
      </FormField>

      <div className="grid gap-2">
        <Label htmlFor={timeId}>Time in the video</Label>
        <div className="flex flex-wrap items-start gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Back 1 second"
            disabled={saving || timestampMs <= 0}
            onClick={() => step(-VIDEO_NOTE_TIME_STEP_MS)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <div className="grid w-28 gap-1">
            <Input
              id={timeId}
              inputMode="text"
              autoComplete="off"
              value={timeText}
              aria-invalid={Boolean(timeError) || undefined}
              aria-describedby={timeError ? `${timeId}-error` : `${timeId}-hint`}
              disabled={saving}
              onChange={(event) => setTimeText(event.target.value)}
              onBlur={(event) => {
                if (event.target.value !== formatVideoTimestamp(timestampMs)) {
                  commitTime(event.target.value);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTime(event.currentTarget.value);
                }
              }}
              className="tabular-nums"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Forward 1 second"
            disabled={saving || (durationMs != null && timestampMs >= durationMs)}
            onClick={() => step(VIDEO_NOTE_TIME_STEP_MS)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={onUseCurrentTime}>
            <Timer data-icon="inline-start" aria-hidden="true" />
            Use current time
          </Button>
        </div>
        {timeError ? (
          <p id={`${timeId}-error`} role="alert" className="text-sm text-destructive">
            {timeError}
          </p>
        ) : (
          <p id={`${timeId}-hint`} className="type-supporting">
            Minutes and seconds, like 1:05. The video jumps to this moment.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-medium" id={`${baseId}-pin-label`}>
          Pin on the picture (optional)
        </p>
        <p className="type-supporting">
          A pin shows where on the video you mean. Choose a spot by clicking the video, or use the
          arrow keys on the pin to move it.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${baseId}-pin-label`}>
          {hasPin ? (
            <>
              <Button type="button" variant="outline" disabled={saving} onClick={onTogglePlacing}>
                <MapPin data-icon="inline-start" aria-hidden="true" />
                {placing ? "Stop choosing a spot" : "Choose a new spot"}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={onRemovePin}>
                <MapPinOff data-icon="inline-start" aria-hidden="true" />
                Remove pin
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" disabled={saving} onClick={onAddPin}>
              <MapPin data-icon="inline-start" aria-hidden="true" />
              Add a pin
            </Button>
          )}
        </div>
        {placing ? (
          <p role="status" className="text-sm text-muted-foreground">
            Click the spot on the video you mean.
          </p>
        ) : null}
      </div>

      {canChooseVisibility ? (
        <div className="grid gap-2">
          <p id={`${baseId}-visibility-label`} className="text-sm font-medium">
            Who can see this?
          </p>
          <RadioGroup
            aria-labelledby={`${baseId}-visibility-label`}
            value={visibility}
            onValueChange={(value) => setVisibility(value as CommentVisibility)}
            disabled={saving}
            className="gap-1"
          >
            <div className="flex min-h-11 items-start gap-3 py-2">
              <RadioGroupItem value="public" id={`${baseId}-public`} className="mt-0.5" />
              <Label htmlFor={`${baseId}-public`} className="grid gap-0.5 font-normal">
                <span className="font-medium">Public note</span>
                <span className="type-supporting">
                  Reviewers on the page and your team can see it.
                </span>
              </Label>
            </div>
            <div className="flex min-h-11 items-start gap-3 py-2">
              <RadioGroupItem value="private" id={`${baseId}-private`} className="mt-0.5" />
              <Label htmlFor={`${baseId}-private`} className="grid gap-0.5 font-normal">
                <span className="font-medium">Private note</span>
                <span className="type-supporting">Only your team can see it.</span>
              </Label>
            </div>
          </RadioGroup>
        </div>
      ) : null}

      {!online ? (
        <p role="status" className="type-supporting">
          You’re offline. You can keep writing. Add your note once you’re back online.
        </p>
      ) : null}

      {saveError ? (
        <p role="alert" className="text-sm text-destructive" data-testid="note-save-error">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
