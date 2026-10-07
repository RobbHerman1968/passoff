"use client";

import { CalendarClock, TriangleAlert } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { setReviewDeadlineAction } from "@/app/(app)/projects/deadline-actions";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  dateTimeLocalToIso,
  formatDeadline,
  parseDeadlineInput,
  toDateTimeLocalValue,
} from "@/lib/reviews/deadline-format";

export function ReviewDeadlineField({
  projectId,
  reviewId,
  initialDeadline,
  canEdit,
}: {
  projectId: string;
  reviewId: string;
  /** ISO timestamp or null. */
  initialDeadline: string | null;
  canEdit: boolean;
}) {
  const online = useOnlineStatus();
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [deadline, setDeadline] = useState<string | null>(initialDeadline);
  const [value, setValue] = useState(() =>
    initialDeadline ? toDateTimeLocalValue(new Date(initialDeadline)) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "clear" | null>(null);
  // Saved deadlines are always in the future, so one snapshot at load is enough.
  const [loadedAt] = useState(() => Date.now());

  const deadlineDate = deadline ? new Date(deadline) : null;
  const pastDue = deadlineDate ? deadlineDate.getTime() < loadedAt : false;

  async function submit(next: string, mode: "save" | "clear") {
    const iso = next ? dateTimeLocalToIso(next) : "";
    const checked = parseDeadlineInput(iso);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      const result = await setReviewDeadlineAction({
        projectId,
        reviewId,
        deadline: iso || null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeadline(result.deadline);
      setValue(result.deadline ? toDateTimeLocalValue(new Date(result.deadline)) : "");
      toast.success(result.deadline ? "Feedback deadline saved." : "Feedback deadline cleared.");
    } catch {
      setError("We couldn’t save the deadline. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit(value, value ? "save" : "clear");
  }

  return (
    <div className="grid min-w-0 gap-3" data-testid="review-deadline">
      <div className="grid min-w-0 gap-1 text-sm">
        <p className="flex items-center gap-2 text-muted-foreground">
          <CalendarClock aria-hidden="true" className="size-4 shrink-0" />
          Feedback deadline
        </p>
        <p className="font-medium">
          {deadlineDate ? (
            <>
              <time dateTime={deadlineDate.toISOString()} suppressHydrationWarning>
                {formatDeadline(deadlineDate)}
              </time>
              {pastDue ? (
                <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                  Past due
                </span>
              ) : null}
            </>
          ) : (
            "No deadline set"
          )}
        </p>
      </div>

      {canEdit ? (
        <form className="grid gap-2" onSubmit={onSubmit} noValidate>
          <Label htmlFor={id}>{deadline ? "Change deadline" : "Set a deadline"}</Label>
          <Input
            id={id}
            type="datetime-local"
            value={value}
            disabled={busy !== null}
            aria-invalid={error ? true : undefined}
            aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
          />
          <p id={hintId} className="text-sm text-muted-foreground">
            Your team gets a reminder a day before. Times use your device’s time zone.
          </p>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!online ? (
            <p role="status" className="text-sm text-muted-foreground">
              You’re offline. Reconnect to change the deadline.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy !== null || !online || value === ""}>
              {busy === "save" ? "Saving…" : "Save deadline"}
            </Button>
            {deadline ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy !== null || !online}
                onClick={() => void submit("", "clear")}
              >
                {busy === "clear" ? "Clearing…" : "Clear deadline"}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
