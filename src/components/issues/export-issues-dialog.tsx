"use client";

import { useState } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { ISSUE_EXPORT_MAX } from "@/lib/issues/export-format";
import type { IssueListFilters } from "@/lib/issues/schemas";
import { buildIssueListHref } from "@/lib/issues/url";

export function ExportIssuesDialog({
  open,
  onOpenChange,
  projectId,
  reviewId,
  filters,
  matchingCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  reviewId: string;
  filters: IssueListFilters;
  matchingCount: number;
}) {
  const [format, setFormat] = useState<"csv" | "md">("csv");
  const [includeReplies, setIncludeReplies] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = new URLSearchParams();
  const listHref = buildIssueListHref("/export", filters);
  const listQuery = listHref.includes("?") ? listHref.slice(listHref.indexOf("?") + 1) : "";
  if (listQuery) {
    for (const [key, value] of new URLSearchParams(listQuery)) {
      query.set(key, value);
    }
  }
  query.set("format", format);
  if (includeReplies && format === "md") query.set("replies", "1");
  const href = `/api/projects/${projectId}/reviews/${reviewId}/issues/export?${query.toString()}`;

  async function copyMarkdown() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(href);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "We couldn’t copy that export. Try again.");
        return;
      }
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      toast.success("Markdown copied.");
    } catch {
      setError("We couldn’t copy that export. Check your connection, then try again.");
    } finally {
      setPending(false);
    }
  }

  const tooLarge = matchingCount > ISSUE_EXPORT_MAX;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export issues</DialogTitle>
          <DialogDescription>
            {matchingCount === 1
              ? "1 issue matches the current search and filters."
              : `${matchingCount} issues match the current search and filters.`}{" "}
            The whole matching list is included, not just this page.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <FormAlert title="Export didn’t finish" description={error} />
        ) : null}
        {tooLarge ? (
          <FormAlert
            title="Too many issues to export at once"
            description={`Narrow the filters to ${ISSUE_EXPORT_MAX} or fewer issues, then try again.`}
          />
        ) : null}
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">Format</legend>
          <RadioGroup
            value={format}
            onValueChange={(value) => setFormat(value === "md" ? "md" : "csv")}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="csv" id="export-csv" />
              <Label htmlFor="export-csv">CSV spreadsheet</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="md" id="export-md" />
              <Label htmlFor="export-md">Markdown</Label>
            </div>
          </RadioGroup>
        </fieldset>
        {format === "md" ? (
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <Label htmlFor="export-replies">Include public replies</Label>
              <p id="export-replies-help" className="text-sm text-muted-foreground">
                Internal notes stay out of the file.
              </p>
            </div>
            <Switch
              id="export-replies"
              checked={includeReplies}
              onCheckedChange={setIncludeReplies}
              aria-describedby="export-replies-help"
            />
          </div>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {format === "md" ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending || tooLarge}
              onClick={() => void copyMarkdown()}
            >
              {pending ? "Copying…" : "Copy Markdown"}
            </Button>
          ) : null}
          <Button asChild disabled={tooLarge || pending}>
            <a href={href} download>
              Download file
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
