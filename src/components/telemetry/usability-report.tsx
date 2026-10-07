"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { queryBehavioralAggregates } from "@/lib/telemetry/query";

type EnvironmentOption = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  kind: string;
};

export function UsabilityReport({
  environments,
  selectedId,
  route,
  version,
  viewport,
  view,
  report,
  start,
  end,
  findings,
}: {
  environments: EnvironmentOption[];
  selectedId: string;
  route: string;
  version: string;
  viewport: string;
  view: string;
  report: Awaited<ReturnType<typeof queryBehavioralAggregates>> | null;
  start: Date;
  end: Date;
  findings?: ReactNode;
}) {
  const router = useRouter();
  const selected = environments.find((item) => item.id === selectedId);

  function update(next: Record<string, string>) {
    const params = new URLSearchParams({
      environment: selectedId,
      route,
      version,
      viewport,
      view,
      ...next,
    });
    router.push(`/usability?${params.toString()}`);
  }

  return (
    <div className="grid gap-6">
      <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-2">
          <Label htmlFor="environment">Environment</Label>
          <Select
            value={selectedId}
            onValueChange={(value) => update({ environment: value })}
          >
            <SelectTrigger id="environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {environments.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.projectName} · {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="route">Page route</Label>
          <input
            id="route"
            className="min-h-11 rounded-md border border-input bg-background px-3"
            defaultValue={route}
            onBlur={(event) => update({ route: event.target.value || "/" })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="version">Version</Label>
          <input
            id="version"
            className="min-h-11 rounded-md border border-input bg-background px-3"
            defaultValue={version}
            onBlur={(event) => update({ version: event.target.value })}
            placeholder="Host version label"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="viewport">Viewport</Label>
          <Select value={viewport} onValueChange={(value) => update({ viewport: value })}>
            <SelectTrigger id="viewport">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="tablet">Tablet</SelectItem>
              <SelectItem value="desktop">Desktop</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="view">Visualization</Label>
          <Select value={view} onValueChange={(value) => update({ view: value })}>
            <SelectTrigger id="view">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clicks">Click heatmap</SelectItem>
              <SelectItem value="scroll">Scroll map</SelectItem>
              <SelectItem value="repeat">Repeat-click signals</SelectItem>
              <SelectItem value="dead">Possible dead clicks</SelectItem>
              <SelectItem value="errors">JavaScript errors</SelectItem>
              <SelectItem value="findings">Findings</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>

      <p className="type-supporting" role="status">
        {start.toISOString().slice(0, 10)} to {end.toISOString().slice(0, 10)} ·{" "}
        {selected?.name} · {viewport} · route {route || "/"} · version{" "}
        {version || "unspecified"}
      </p>

      {selected ? (
        <p>
          <Link
            className="text-sm underline"
            href={`/projects/${selected.projectId}/environments/${selected.id}`}
          >
            Collection settings
          </Link>
        </p>
      ) : null}

      {report && report.state === "no_data_collected" ? (
        <EmptyState
          title="No data collected"
          description="Behavioral insights are off, or this environment has not accepted any usability events yet. That is different from zero clicks."
        />
      ) : null}
      {report && report.state === "waiting_for_traffic" ? (
        <EmptyState
          title="Waiting for traffic"
          description="Collection is on, but there are not yet eligible page views for this filter."
        />
      ) : null}
      {report && report.state === "insufficient_sample" ? (
        <EmptyState
          title="Insufficient sample"
          description={`Need at least ${report.min} eligible tab sessions before showing this view. ${report.eligible} are available.`}
        />
      ) : null}
      {report && report.state === "data_available" && view === "clicks" ? (
        <div className="grid gap-4">
          <StatusPill tone="positive">Data available</StatusPill>
          <div
            className="overflow-hidden rounded-xl border border-border bg-muted"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(20, minmax(0, 1fr))",
              gridTemplateRows: "repeat(20, minmax(8px, 1fr))",
              minHeight: "16rem",
            }}
            aria-hidden="true"
          >
            {(report.rows ?? []).map((cell, index) => {
              const intensity = Math.min(1, cell.eventCount / 20);
              return (
                <span
                  key={`${cell.coordinateBucketX}-${cell.coordinateBucketY}-${index}`}
                  className="block"
                  style={{
                    gridColumn: (cell.coordinateBucketX ?? 0) + 1,
                    gridRow: (cell.coordinateBucketY ?? 0) + 1,
                    background: `rgb(194 65 12 / ${0.15 + intensity * 0.7})`,
                  }}
                />
              );
            })}
          </div>
          <p className="type-supporting">
            Intensity shows click counts in coarse page areas. A dark patch is
            not automatically a problem. Eligible sessions: {report.eligible}.
          </p>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Click summary table">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">
                Ranked click areas for the selected route and viewport
              </caption>
              <thead>
                <tr>
                  <th scope="col">Area or label</th>
                  <th scope="col">Clicks</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Route</th>
                  <th scope="col">Viewport</th>
                </tr>
              </thead>
              <tbody>
                {(report.rows ?? [])
                  .slice()
                  .sort((a, b) => b.eventCount - a.eventCount)
                  .map((row, index) => (
                    <tr key={index} className="border-t border-border">
                      <td>
                        {row.analyticsLabel || row.elementCategory || "Unlabeled"}
                      </td>
                      <td>{row.eventCount}</td>
                      <td>{row.tabSessionCount}</td>
                      <td>{route}</td>
                      <td>{viewport}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {report && report.state === "data_available" && view !== "clicks" && view !== "findings" ? (
        <div className="overflow-x-auto" tabIndex={0} aria-label="Behavioral summary table">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption className="sr-only">
              Ranked {view} signals for the selected route and viewport
            </caption>
            <thead>
              <tr>
                <th scope="col">Label or area</th>
                <th scope="col">Events</th>
                <th scope="col">Sessions</th>
                <th scope="col">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(report.rows ?? []).map((row, index) => (
                <tr key={index} className="border-t border-border">
                  <td>{row.analyticsLabel || row.elementCategory || row.errorCategory || "Unlabeled"}</td>
                  <td>{row.eventCount}</td>
                  <td>{row.tabSessionCount}</td>
                  <td>
                    {view === "scroll" && row.scrollMilestone >= 0
                      ? `${row.scrollMilestone}% scroll`
                      : viewport}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 type-supporting">
            Eligible sessions: {report.eligible}. These counts are aggregates, not individual visitors.
          </p>
        </div>
      ) : null}

      {view === "findings" ? findings : null}
    </div>
  );
}
