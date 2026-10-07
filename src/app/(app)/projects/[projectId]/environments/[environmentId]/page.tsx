import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BehavioralInsightsSettingsForm } from "@/components/telemetry/behavioral-insights-settings-form";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { StatusPill } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getTelemetryStatus } from "@/lib/telemetry/query";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

type RouteParams = Promise<{ projectId: string; environmentId: string }>;

export const metadata: Metadata = {
  title: "Behavioral insights",
  description: "Privacy-first usability collection for this website environment.",
};

const STATUS_COPY: Record<string, string> = {
  no_data_collected: "No data collected",
  waiting_for_consented_traffic: "Waiting for consented traffic",
  insufficient_sample: "Insufficient sample",
  collecting_normally: "Collecting normally",
  collection_limited: "Collection limited",
  collection_paused: "Collection paused",
  configuration_needs_attention: "Configuration needs attention",
};

export default async function EnvironmentBehavioralPage({
  params,
}: {
  params: RouteParams;
}) {
  const { projectId, environmentId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect(
        `/sign-in?callbackUrl=/projects/${projectId}/environments/${environmentId}`,
      );
    }
    redirect("/onboarding");
  }

  const detail = await getTelemetryStatus(auth.context, environmentId);
  if (!detail || detail.environment.projectId !== projectId) {
    return (
      <>
        <PageHeader title="Environment unavailable" />
        <PermissionDeniedState />
      </>
    );
  }

  const canEdit = auth.context.role === "owner";
  const { settings, environment, usage, status, period } = detail;

  return (
    <>
      <PageHeader
        title={`Behavioral insights · ${environment.name}`}
        description="Collect limited, aggregated usability signals. This does not identify visitors or create issues automatically."
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { href: `/projects/${projectId}`, label: "Project" },
          { label: environment.name },
        ]}
        status={<StatusPill tone="neutral">{STATUS_COPY[status]}</StatusPill>}
        primaryAction={
          <Button asChild>
            <Link href={`/usability?environment=${environment.id}`}>
              Open usability report
            </Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
          <h2 className="type-section-title">Collection settings</h2>
          <BehavioralInsightsSettingsForm
            projectId={projectId}
            environmentId={environmentId}
            settings={settings}
            canEdit={canEdit}
          />
        </section>
        <aside aria-label="Collection status" className="grid content-start gap-4">
          <div className="grid gap-2 rounded-xl border border-border bg-card p-5">
            <h2 className="type-section-title">Status</h2>
            <p className="text-sm">Mode: {settings.collectionMode.replaceAll("_", " ")}</p>
            <p className="text-sm">
              Environment: {environment.kind}
              {settings.testModeEnabled ? " · test mode" : ""}
            </p>
            <p className="text-sm">
              Last accepted event:{" "}
              {settings.lastAcceptedEventAt
                ? settings.lastAcceptedEventAt.toLocaleString()
                : "None yet"}
            </p>
            <p className="text-sm">
              Last aggregation:{" "}
              {settings.lastAggregatedAt
                ? settings.lastAggregatedAt.toLocaleString()
                : "None yet"}
            </p>
            <p className="text-sm">
              Events accepted this period: {usage?.acceptedEvents ?? 0}
            </p>
            <p className="text-sm">
              Excluded or dropped this period: {usage?.droppedEvents ?? 0}
            </p>
            <p className="type-supporting">
              Period {period.start.toISOString().slice(0, 10)} to{" "}
              {period.end.toISOString().slice(0, 10)}.
            </p>
          </div>
          {status === "collection_limited" ? (
            <Alert>
              <AlertTitle>Collection was limited</AlertTitle>
              <AlertDescription>
                Passoff stopped accepting extra usability events for this period
                so the website and reviews keep working. Partial data is not
                complete.
              </AlertDescription>
            </Alert>
          ) : null}
          <p className="type-supporting">
            Raw events are never shown here. Visitors can change their choice
            from Privacy choices on the website.
          </p>
        </aside>
      </div>
    </>
  );
}
