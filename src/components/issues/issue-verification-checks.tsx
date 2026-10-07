"use client";

import { CircleAlert, CircleCheck, CircleHelp, CirclePause } from "lucide-react";

import { RecordHumanVerificationDialog } from "@/components/issues/record-human-verification-dialog";
import { RunVerificationDialog } from "@/components/issues/run-verification-dialog";
import type { VerificationLaunchContext } from "@/lib/verification/launch";
import type { VerificationRunView } from "@/lib/verification/query";
import { formatRelativeActivity } from "@/lib/projects/format";
import { CHECK_KIND_LABELS, OUTCOME_LABELS } from "@/lib/verification/copy";
import type { VerificationOutcome } from "@/lib/verification/contract";

function OutcomeIcon({ outcome }: { outcome: string | null }) {
  if (outcome === "passed") return <CircleCheck aria-hidden="true" className="size-4" />;
  if (outcome === "failed") return <CircleAlert aria-hidden="true" className="size-4" />;
  if (outcome === "cancelled") return <CirclePause aria-hidden="true" className="size-4" />;
  return <CircleHelp aria-hidden="true" className="size-4" />;
}

export function IssueVerificationChecks({
  projectId,
  reviewId,
  issueNumber,
  launch,
  runs,
}: {
  projectId: string;
  reviewId: string;
  issueNumber: number;
  launch: VerificationLaunchContext | null;
  runs: VerificationRunView[];
}) {
  const latestComplete = runs.find(
    (run) => run.overall && run.overall !== "cancelled" && run.state !== "preparing",
  );

  return (
    <section
      aria-labelledby="verification-checks-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="verification-checks-heading" className="type-section-title">
            Verification checks
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Browser checks are evidence. A person still records whether the issue is fixed.
          </p>
        </div>
        {launch ? (
          <RunVerificationDialog
            projectId={projectId}
            reviewId={reviewId}
            context={launch}
            rerun={runs.length > 0}
          />
        ) : null}
      </div>

      {runs.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No browser checks have been run for this issue yet.
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {runs.map((run) => (
            <li
              key={run.id}
              className="rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <OutcomeIcon outcome={run.overall} />
                <span>
                  {run.overall
                    ? OUTCOME_LABELS[run.overall]
                    : "In progress"}
                </span>
              </div>
              <p className="mt-1 text-sm">{run.summary}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {run.environmentName} · {run.versionLabel}
                {run.route ? ` · ${run.route}` : ""}
                {run.viewportWidth && run.viewportHeight
                  ? ` · ${run.viewportWidth} × ${run.viewportHeight}`
                  : ""}
                {` · ${run.initiatorName} · `}
                <time dateTime={run.startedAt.toISOString()}>
                  {formatRelativeActivity(run.startedAt)}
                </time>
              </p>
              <ul className="mt-2 grid gap-1 text-sm">
                {run.checks.map((check) => (
                  <li key={`${check.kind}-${check.summary}`}>
                    {CHECK_KIND_LABELS[check.kind]}:{" "}
                    {OUTCOME_LABELS[check.outcome as VerificationOutcome]}
                    {check.summary ? ` — ${check.summary}` : ""}
                  </li>
                ))}
              </ul>
              {run.limitations.length > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Limitation: {run.limitations.join(" ")}
                </p>
              ) : null}
              {run.hasEvidence ? (
                <p className="mt-2 text-sm">Fresh verification picture captured.</p>
              ) : run.evidenceStatus === "failed" ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  A fresh picture could not be captured. The check results are still saved.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {latestComplete ? (
        <div className="mt-4">
          <RecordHumanVerificationDialog
            projectId={projectId}
            reviewId={reviewId}
            issueNumber={issueNumber}
            run={latestComplete}
          />
        </div>
      ) : null}
    </section>
  );
}
