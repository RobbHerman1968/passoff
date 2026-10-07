"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";

import {
  addIssueLabelAction,
  createAndAddIssueLabelAction,
  removeIssueLabelAction,
  type IssueLabelActionResult,
} from "@/app/(app)/projects/label-actions";
import { useOnlineStatus } from "@/components/issues/use-online-status";
import { LabelChip } from "@/components/labels/label-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IssueHistoryEvent } from "@/lib/issues/history";
import {
  LABEL_COLORS,
  LABEL_COLOR_NAMES,
  LABEL_NAME_MAX_LENGTH,
  MAX_LABELS_PER_ISSUE,
  normalizeLabelName,
  type LabelColor,
  type LabelView,
} from "@/lib/labels/types";

export function IssueLabelsField({
  projectId,
  reviewId,
  issueNumber,
  initialLabels,
  workspaceLabels,
  canEdit,
  onHistoryEvent,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  initialLabels: LabelView[];
  workspaceLabels: LabelView[];
  canEdit: boolean;
  onHistoryEvent?: (event: IssueHistoryEvent) => void;
}) {
  const online = useOnlineStatus();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const listId = `${inputId}-options`;
  const [labels, setLabels] = useState(initialLabels);
  const [known, setKnown] = useState(workspaceLabels);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("slate");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [status, setStatus] = useState("");

  const atLimit = labels.length >= MAX_LABELS_PER_ISSUE;
  const attachedIds = new Set(labels.map((label) => label.id));
  const suggestions = known.filter((label) => !attachedIds.has(label.id));

  function apply(result: IssueLabelActionResult, success: string) {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setLabels(result.labels);
    if (result.createdLabel) {
      const created = result.createdLabel;
      setKnown((current) =>
        current.some((label) => label.id === created.id) ? current : [...current, created],
      );
    }
    if (result.event) onHistoryEvent?.(result.event);
    setError(null);
    setStatus(success);
    toast.success(success);
    return true;
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const checked = normalizeLabelName(name);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const existing = known.find(
        (label) => label.name.toLowerCase() === checked.name.toLowerCase(),
      );
      const result = existing
        ? await addIssueLabelAction({
            projectId,
            reviewId,
            issueNumber,
            labelId: existing.id,
          })
        : await createAndAddIssueLabelAction({
            projectId,
            reviewId,
            issueNumber,
            name: checked.name,
            color,
          });
      if (apply(result, `Added the label “${checked.name}”.`)) setName("");
    } catch {
      setError("We couldn’t add that label. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemove(label: LabelView) {
    setBusy("remove");
    setError(null);
    try {
      const result = await removeIssueLabelAction({
        projectId,
        reviewId,
        issueNumber,
        labelId: label.id,
      });
      apply(result, `Removed the label “${label.name}”.`);
    } catch {
      setError("We couldn’t remove that label. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={`${inputId}-heading`} className="grid min-w-0 gap-3">
      <h3 id={`${inputId}-heading`} className="text-sm font-medium">
        Labels
      </h3>

      {labels.length > 0 ? (
        <ul aria-label="Labels on this issue" className="flex flex-wrap gap-2">
          {labels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              onRemove={canEdit ? () => void onRemove(label) : undefined}
              removeDisabled={busy !== null || !online}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "No labels yet. Add one to group related issues."
            : "No labels on this issue."}
        </p>
      )}

      {canEdit ? (
        <form className="grid gap-3" onSubmit={onAdd} noValidate>
          <div className="grid gap-2">
            <Label htmlFor={inputId}>Add a label</Label>
            <Input
              id={inputId}
              value={name}
              maxLength={LABEL_NAME_MAX_LENGTH}
              list={listId}
              autoComplete="off"
              placeholder="For example, Copy or Layout"
              disabled={busy !== null || atLimit}
              aria-invalid={error ? true : undefined}
              aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
            />
            <datalist id={listId}>
              {suggestions.map((label) => (
                <option key={label.id} value={label.name} />
              ))}
            </datalist>
            <p id={hintId} className="text-sm text-muted-foreground">
              {atLimit
                ? `An issue can have up to ${MAX_LABELS_PER_ISSUE} labels. Remove one to add another.`
                : "Pick an existing label or type a new one."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`${inputId}-color`}>Color for a new label</Label>
            <Select
              value={color}
              onValueChange={(next) => setColor(next as LabelColor)}
              disabled={busy !== null || atLimit}
            >
              <SelectTrigger id={`${inputId}-color`} className="h-11 min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_COLORS.map((value) => (
                  <SelectItem key={value} value={value} className="min-h-11">
                    {LABEL_COLOR_NAMES[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!online ? (
            <p className="text-sm text-muted-foreground" role="status">
              You’re offline. Reconnect to change labels.
            </p>
          ) : null}

          <Button
            type="submit"
            variant="outline"
            disabled={busy !== null || !online || atLimit || name.trim() === ""}
          >
            {busy === "add" ? "Adding label…" : "Add label"}
          </Button>
        </form>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
