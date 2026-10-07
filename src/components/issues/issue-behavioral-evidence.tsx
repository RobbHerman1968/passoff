"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { requestComparisonAction } from "@/app/(app)/usability/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Snapshot = {
  id: string;
  payload: Record<string, unknown>;
};

type Comparison = {
  id: string;
  summary: string;
  baselineVersion: string;
  comparisonVersion: string;
  baselineSample: number;
  comparisonSample: number;
  outcome: string;
};

function formatWindow(start: string, end: string) {
  return `${start.slice(0, 10)} to ${end.slice(0, 10)}`;
}

export function IssueBehavioralEvidence({
  snapshots,
  comparisons,
  issueId,
  canRequestComparison,
}: {
  snapshots: Snapshot[];
  comparisons: Comparison[];
  issueId: string;
  canRequestComparison: boolean;
}) {
  if (snapshots.length === 0) return null;

  return (
    <section
      aria-labelledby="behavioral-evidence-heading"
      className="rounded-xl border border-border bg-card p-4 text-card-foreground sm:p-5"
    >
      <h2 id="behavioral-evidence-heading" className="type-section-title">
        Behavioral evidence
      </h2>
      <p className="mt-2 type-supporting">
        These summaries come from aggregated production behavior. They do not identify visitors
        and they do not verify or close this issue.
      </p>
      <ul className="mt-4 grid gap-4">
        {snapshots.map((snapshot) => {
          const payload = snapshot.payload;
          const route = String(payload.route ?? "");
          const windowStart = String(payload.windowStart ?? "");
          const windowEnd = String(payload.windowEnd ?? "");
          const eligible = Number(payload.eligibleSessionCount ?? 0);
          const metric = Number(payload.metricValue ?? 0);
          const version = String(payload.deploymentVersion ?? "");
          const viewport = String(payload.viewportGroup ?? "");
          const explanation = String(payload.explanation ?? "");
          const uncertainty = String(payload.uncertainty ?? "");
          return (
            <li key={snapshot.id} className="grid gap-2 rounded-lg border border-border p-3">
              <p>
                Between {formatWindow(windowStart, windowEnd)},{" "}
                {Math.round(metric * eligible)} of {eligible} eligible {viewport} sessions
                matched this signal on {route}
                {version ? ` (${version})` : ""}.
              </p>
              <p>{explanation}</p>
              <p className="type-supporting">{uncertainty}</p>
              <p className="type-supporting">
                Sample {eligible} · coverage {String(payload.coverageStatus ?? "").replaceAll("_", " ")} ·
                detection rule {String(payload.detectionRuleVersion ?? "")}
              </p>
              <p>
                <Link className="underline" href={`/usability?view=clicks&route=${encodeURIComponent(route)}`}>
                  Open the related usability report
                </Link>
              </p>
              {canRequestComparison ? (
                <ComparisonForm
                  issueId={issueId}
                  snapshotId={snapshot.id}
                  viewport={viewport}
                  metricName={String(payload.observedMetric ?? "repeat_click_session_rate")}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      {comparisons.length > 0 ? (
        <div className="mt-4 grid gap-2">
          <h3 className="font-medium">Before and after</h3>
          <ul className="grid gap-3">
            {comparisons.map((comparison) => (
              <li key={comparison.id} className="rounded-lg border border-border p-3">
                <p>{comparison.summary}</p>
                <p className="type-supporting">
                  {comparison.baselineVersion || "baseline"} ({comparison.baselineSample} sessions) →{" "}
                  {comparison.comparisonVersion} ({comparison.comparisonSample} sessions) ·{" "}
                  {comparison.outcome.replaceAll("_", " ")}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ComparisonForm({
  issueId,
  snapshotId,
  viewport,
  metricName,
}: {
  issueId: string;
  snapshotId: string;
  viewport: string;
  metricName: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(async () => {
          const result = await requestComparisonAction({
            issueId,
            snapshotId,
            comparisonVersion: String(formData.get("comparisonVersion") ?? ""),
            viewportGroup: (viewport === "tablet" || viewport === "desktop" ? viewport : "mobile") as
              | "mobile"
              | "tablet"
              | "desktop",
            metricName,
          });
          if (result.status === "error") toast.error(result.message);
          else toast.success(result.message);
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor={`version-${snapshotId}`}>Compare with version</Label>
        <Input
          id={`version-${snapshotId}`}
          name="comparisonVersion"
          required
          placeholder="New host version label"
        />
      </div>
      <Button type="submit" disabled={pending}>
        Request comparison
      </Button>
    </form>
  );
}
