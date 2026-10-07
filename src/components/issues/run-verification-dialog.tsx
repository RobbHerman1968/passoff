"use client";

import { useState } from "react";

import { startVerificationChecksAction } from "@/app/(app)/projects/verification-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { VerificationLaunchContext } from "@/lib/verification/launch";

const CONFIDENCE_LABELS: Record<string, string> = {
  exact: "Exact match",
  likely: "Likely match",
  ambiguous: "Ambiguous",
  missing: "Missing",
  unchecked: "Not checked yet",
};

export function RunVerificationDialog({
  projectId,
  reviewId,
  context,
  rerun = false,
}: {
  projectId: string;
  reviewId: string;
  context: VerificationLaunchContext;
  rerun?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<string[]>(
    context.availableChecks.map((item) => item.kind).filter((kind) => kind !== "named_test_hook"),
  );
  const [namedHook, setNamedHook] = useState(context.namedHooks[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (kind: string) => {
    setChecks((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {rerun ? "Run again" : "Run verification checks"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg" aria-describedby="verification-checks-help">
        <DialogHeader>
          <DialogTitle>Run verification checks</DialogTitle>
          <DialogDescription id="verification-checks-help">
            Automated checks provide evidence. They do not verify or close the issue.
          </DialogDescription>
        </DialogHeader>

        {context.blocker ? (
          <div role="alert" className="grid gap-2 text-sm">
            <p>{context.blocker.title}</p>
            <p className="text-muted-foreground">{context.blocker.next}</p>
          </div>
        ) : (
          <div className="grid gap-4 text-sm">
            <dl className="grid gap-2">
              <div>
                <dt className="text-muted-foreground">Issue</dt>
                <dd className="font-medium">
                  #{context.issueNumber} {context.issueTitle}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Environment</dt>
                <dd className="font-medium">{context.environmentName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Recorded version</dt>
                <dd className="font-medium">{context.versionLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target page</dt>
                <dd className="min-w-0 break-all font-medium">
                  {context.pageRoute ?? context.pageUrl ?? "Not recorded"}
                </dd>
              </div>
              {context.viewportWidth && context.viewportHeight ? (
                <div>
                  <dt className="text-muted-foreground">Saved viewport</dt>
                  <dd className="font-medium">
                    {context.viewportWidth} × {context.viewportHeight}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-muted-foreground">Anchor confidence</dt>
                <dd className="font-medium">
                  {CONFIDENCE_LABELS[context.matchConfidence ?? "unchecked"] ??
                    "Not checked yet"}
                </dd>
              </div>
            </dl>

            <fieldset className="grid gap-2">
              <legend className="font-medium">Checks to run</legend>
              {context.availableChecks.map((item) => (
                <label key={item.kind} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checks.includes(item.kind)}
                    onChange={() => toggle(item.kind)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>

            {checks.includes("named_test_hook") && context.namedHooks.length > 0 ? (
              <div className="grid gap-1">
                <Label htmlFor="named-hook">Named check</Label>
                <select
                  id="named-hook"
                  className="min-h-11 rounded-md border border-input bg-background px-3"
                  value={namedHook}
                  onChange={(event) => setNamedHook(event.target.value)}
                >
                  {context.namedHooks.map((hook) => (
                    <option key={hook} value={hook}>
                      {hook}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {context.eligible ? (
            <Button
              type="button"
              disabled={busy || checks.length === 0}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await startVerificationChecksAction({
                  projectId,
                  reviewId,
                  issueNumber: context.issueNumber,
                  checks: checks as Array<
                    "element_visibility" | "bounding_box_overlap" | "named_test_hook"
                  >,
                  namedHook: checks.includes("named_test_hook") ? namedHook : null,
                });
                setBusy(false);
                if (!result.ok) {
                  setError(`${result.title} ${result.next}`);
                  return;
                }
                window.location.assign(result.launchUrl);
              }}
            >
              {busy ? "Opening website…" : "Open website and run checks"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
