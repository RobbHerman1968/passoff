"use client";

import { useRouter } from "next/navigation";

import {
  UNASSIGNED_VALUE,
  useIssueTriage,
} from "@/components/issues/issue-triage-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ISSUE_TRIAGE_CONFLICT_MESSAGE } from "@/lib/issues/triage-transitions";

export function IssueAssigneeField() {
  const router = useRouter();
  const {
    snapshot,
    members,
    savingField,
    fieldError,
    online,
    updateAssignee,
    retryFailed,
  } = useIssueTriage();
  const busy = savingField === "assignee";
  const error = fieldError?.field === "assignee" ? fieldError.message : null;
  const isConflict = error === ISSUE_TRIAGE_CONFLICT_MESSAGE;
  const value = snapshot.assigneeUserId ?? UNASSIGNED_VALUE;
  const memberIds = new Set(members.map((member) => member.userId));
  const currentMissing =
    snapshot.assigneeUserId && !memberIds.has(snapshot.assigneeUserId)
      ? {
          userId: snapshot.assigneeUserId,
          displayName: snapshot.assigneeDisplayName,
        }
      : null;

  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor="issue-assignee">Assignee</Label>
      <Select
        value={value}
        disabled={busy || !online}
        onValueChange={(next) => {
          void updateAssignee(next === UNASSIGNED_VALUE ? null : next);
        }}
      >
        <SelectTrigger
          id="issue-assignee"
          className="h-11 min-h-11 w-full"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            [busy ? "issue-assignee-progress" : null, error ? "issue-assignee-error" : null]
              .filter(Boolean)
              .join(" ") || undefined
          }
        >
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED_VALUE} className="min-h-11">
            Unassigned
          </SelectItem>
          {currentMissing ? (
            <SelectItem value={currentMissing.userId} className="min-h-11">
              {currentMissing.displayName}
            </SelectItem>
          ) : null}
          {members.map((member) => (
            <SelectItem key={member.userId} value={member.userId} className="min-h-11">
              {member.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy ? (
        <p id="issue-assignee-progress" className="text-sm text-muted-foreground" role="status" aria-live="polite">
          Assigning…
        </p>
      ) : null}
      {error ? (
        <div id="issue-assignee-error">
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
