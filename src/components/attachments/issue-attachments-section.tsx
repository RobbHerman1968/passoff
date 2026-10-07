"use client";

import { Eye, EyeOff, Paperclip } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import {
  attachFileToIssueAction,
  removeIssueAttachmentAction,
  setAttachmentVisibilityAction,
  type IssueAttachmentActionResult,
} from "@/app/(app)/projects/attachment-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useOnlineStatus } from "@/components/issues/use-online-status";
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
  ATTACHMENT_MAX_BYTES,
  formatBytes,
  type AttachableAssetView,
  type AttachmentView,
} from "@/lib/attachments/types";

const PRIVATE_VALUE = "private";
const PUBLIC_VALUE = "public";

function describeFile(file: { mimeType: string | null; byteSize: number | null }) {
  return [file.mimeType ?? "Unknown type", formatBytes(file.byteSize)].join(" · ");
}

export function IssueAttachmentsSection({
  projectId,
  reviewId,
  issueNumber,
  initialAttachments,
  attachable,
  canEdit,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  initialAttachments: AttachmentView[];
  attachable: AttachableAssetView[];
  canEdit: boolean;
}) {
  const online = useOnlineStatus();
  const baseId = useId();
  const [attachments, setAttachments] = useState(initialAttachments);
  const [candidates, setCandidates] = useState(attachable);
  const [assetId, setAssetId] = useState<string>("");
  const [visibility, setVisibility] = useState(PRIVATE_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const scope = { projectId, reviewId, issueNumber };

  function apply(result: IssueAttachmentActionResult, success: string): boolean {
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setAttachments(result.attachments);
    setError(null);
    setStatus(success);
    toast.success(success);
    return true;
  }

  async function run(work: () => Promise<IssueAttachmentActionResult>, success: string) {
    setBusy(true);
    setError(null);
    try {
      return apply(await work(), success);
    } catch {
      setError("We couldn’t save that change. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onAttach() {
    const file = candidates.find((item) => item.assetId === assetId);
    if (!file) {
      setError("Choose a file to attach.");
      return;
    }
    const ok = await run(
      () =>
        attachFileToIssueAction({
          ...scope,
          assetId: file.assetId,
          isPrivate: visibility !== PUBLIC_VALUE,
        }),
      `Attached ${file.fileName}.`,
    );
    if (ok) {
      setCandidates((current) => current.filter((item) => item.assetId !== file.assetId));
      setAssetId("");
    }
  }

  async function onToggleVisibility(item: AttachmentView) {
    await run(
      () =>
        setAttachmentVisibilityAction({
          ...scope,
          assetId: item.assetId,
          isPrivate: !item.isPrivate,
        }),
      item.isPrivate
        ? `${item.fileName} is now visible to reviewers.`
        : `${item.fileName} is now private to your team.`,
    );
  }

  async function onRemove(item: AttachmentView) {
    const ok = await run(
      () => removeIssueAttachmentAction({ ...scope, assetId: item.assetId }),
      `Removed ${item.fileName} from this issue.`,
    );
    if (ok) {
      setCandidates((current) => [
        {
          assetId: item.assetId,
          fileName: item.fileName,
          mimeType: item.mimeType,
          byteSize: item.byteSize,
        },
        ...current,
      ]);
    }
  }

  const disabled = busy || !online;

  return (
    <section
      aria-labelledby={`${baseId}-heading`}
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id={`${baseId}-heading`} className="type-section-title">
        Attachments
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Private files are only visible to your team. Reviewers see files you mark as visible.
      </p>

      {attachments.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No files are attached to this issue yet.
        </p>
      ) : (
        <ul aria-label="Files attached to this issue" className="mt-4 grid gap-3">
          {attachments.map((item) => (
            <li
              key={item.assetId}
              className="grid min-w-0 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="grid min-w-0 gap-1">
                <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <Paperclip aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 break-all">{item.fileName}</span>
                </p>
                <p className="text-sm text-muted-foreground">{describeFile(item)}</p>
                <p className="flex items-center gap-1.5 text-sm">
                  {item.isPrivate ? (
                    <EyeOff aria-hidden="true" className="size-4 shrink-0" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  {item.isPrivate ? "Private — team only" : "Visible to reviewers"}
                </p>
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => void onToggleVisibility(item)}
                  >
                    {item.isPrivate ? "Show to reviewers" : "Make private"}{" "}
                    <span className="sr-only">for {item.fileName}</span>
                  </Button>
                  <ConfirmDialog
                    title="Remove this file from the issue?"
                    description={`${item.fileName} will no longer appear on this issue. The file itself isn’t deleted.`}
                    confirmLabel="Remove from issue"
                    cancelLabel="Keep it"
                    onConfirm={() => void onRemove(item)}
                    trigger={
                      <Button type="button" variant="outline" size="sm" disabled={disabled}>
                        Remove{" "}
                        <span className="sr-only">{item.fileName} from this issue</span>
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="mt-5 grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Attach a file</h3>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No other files are available in this review yet. Files up to{" "}
              {formatBytes(ATTACHMENT_MAX_BYTES)} (images, PDFs, or text) show up here once
              they’re added to the review.
            </p>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`${baseId}-file`}>File</Label>
                <Select value={assetId} onValueChange={setAssetId} disabled={disabled}>
                  <SelectTrigger id={`${baseId}-file`} className="h-11 min-h-11 w-full">
                    <SelectValue placeholder="Choose a file" />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((file) => (
                      <SelectItem key={file.assetId} value={file.assetId} className="min-h-11">
                        {file.fileName} ({formatBytes(file.byteSize)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${baseId}-visibility`}>Who can see it</Label>
                <Select value={visibility} onValueChange={setVisibility} disabled={disabled}>
                  <SelectTrigger id={`${baseId}-visibility`} className="h-11 min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PRIVATE_VALUE} className="min-h-11">
                      Private — team only
                    </SelectItem>
                    <SelectItem value={PUBLIC_VALUE} className="min-h-11">
                      Visible to reviewers
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" disabled={disabled || !assetId} onClick={() => void onAttach()}>
                {busy ? "Saving…" : "Attach file"}
              </Button>
            </>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {!online ? (
            <p role="status" className="text-sm text-muted-foreground">
              You’re offline. Reconnect to change attachments.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
