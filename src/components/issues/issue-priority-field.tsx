"use client";

import { useRouter } from "next/navigation";

import { ISSUE_PRIORITY_ICONS } from "@/components/issues/issue-priority";
import { useIssueTriage } from "@/components/issues/issue-triage-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  type IssuePriority,
} from "@/lib/issues/statuses";
import { ISSUE_TRIAGE_CONFLICT_MESSAGE } from "@/lib/issues/triage-transitions";

export function IssuePriorityField() {
  const router = useRouter();
  const { snapshot, savingField, fieldError, online, updatePriority, retryFailed } =
    useIssueTriage();
  const busy = savingField === "priority";
  const error = fieldError?.field === "priority" ? fieldError.message : null;
  const isConflict = error === ISSUE_TRIAGE_CONFLICT_MESSAGE;
  const SelectedIcon = ISSUE_PRIORITY_ICONS[snapshot.priority];

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor="issue-priority">Priority</Label>
      <Select
        value={snapshot.priority}
        disabled={busy || !online}
        onValueChange={(next) => {
          void updatePriority(next as IssuePriority);
        }}
      >
        <SelectTrigger
          id="issue-priority"
          className="h-11 min-h-11 w-full"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            [busy ? "issue-priority-progress" : null, error ? "issue-priority-error" : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <SelectValue>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <SelectedIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              <span>{ISSUE_PRIORITY_LABELS[snapshot.priority]}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ISSUE_PRIORITIES.map((priority) => {
            const Icon = ISSUE_PRIORITY_ICONS[priority];
            return (
              <SelectItem key={priority} value={priority} className="min-h-11">
                <span className="inline-flex items-center gap-1.5">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{ISSUE_PRIORITY_LABELS[priority]}</span>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      {busy ? (
        <p id="issue-priority-progress" className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Updating priority…
        </p>
      ) : null}
      {error ? (
        <div id="issue-priority-error">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => {
              if (isConflict) {
                router.refresh();
                return;
              }
              void retryFailed();
            }}
          >
            {isConflict ? "Refresh" : "Try again"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
