import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { UsabilityReport } from "@/components/telemetry/usability-report";
import {
  listWorkspaceEnvironments,
  queryBehavioralAggregates,
} from "@/lib/telemetry/query";
import { FindingsList } from "@/components/telemetry/findings-list";
import type { BehavioralFindingDisposition, BehavioralFindingType } from "@/db/schema";
import {
  countWorkspaceAiUsage,
  latestFindingAnalysis,
  listFindings,
  relatedIssueForFinding,
} from "@/lib/findings/service";
import { listAssignableMembers } from "@/lib/issues/triage";
import { listProjectReviews } from "@/lib/projects/service";
import type { BehavioralAiResult } from "@/lib/findings/ai-schema";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const metadata: Metadata = {
  title: "Usability",
  description:
    "Aggregated click, scroll, and error signals from consented production traffic.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UsabilityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/usability");
    }
    redirect("/onboarding");
  }

  const params = await searchParams;
  const environments = await listWorkspaceEnvironments(auth.context);
  const environmentId =
    typeof params.environment === "string"
      ? params.environment
      : environments[0]?.id;
  const route = typeof params.route === "string" ? params.route : "/";
  const version = typeof params.version === "string" ? params.version : "";
  const viewport =
    params.viewport === "tablet" || params.viewport === "desktop"
      ? params.viewport
      : "mobile";
  const view =
    typeof params.view === "string" ? params.view : "clicks";
  const findingType =
    typeof params.findingType === "string" ? params.findingType : "";
  const disposition =
    typeof params.disposition === "string" ? params.disposition : "";

  const environment = environments.find((item) => item.id === environmentId);
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

  const eventType =
    view === "scroll"
      ? "scroll_milestone"
      : view === "repeat"
        ? "repeat_click_signal"
        : view === "dead"
          ? "dead_click_candidate"
          : view === "errors"
            ? "sanitized_javascript_error"
            : "element_click";

  const report =
    environment && view !== "findings"
      ? await queryBehavioralAggregates(auth.context, {
          environmentId: environment.id,
          route,
          version,
          viewport,
          start,
          end,
          eventType,
        })
      : null;

  const findingRows =
    environment && view === "findings"
      ? await listFindings(auth.context, {
          environmentId: environment.id,
          route,
          version,
          viewport,
          start,
          end,
          ...(findingType
            ? { findingType: findingType as BehavioralFindingType }
            : {}),
          ...(disposition
            ? { disposition: disposition as BehavioralFindingDisposition }
            : {}),
        })
      : [];

  const reviews = environment
    ? ((await listProjectReviews(auth.context, environment.projectId)) ?? []).map(
        (review) => ({ id: review.id, name: review.name }),
      )
    : [];

  const members = await listAssignableMembers(auth.context);
  const aiUsage = await countWorkspaceAiUsage(auth.context);
  const findingCards = [];
  const analysisByFindingId: Record<
    string,
    | {
        id: string;
        status: string;
        modelId: string | null;
        createdAt: string;
        result: BehavioralAiResult | null;
      }
    | undefined
  > = {};
  for (const row of findingRows) {
    const related = await relatedIssueForFinding(auth.context, row.finding);
    const analysis = await latestFindingAnalysis(auth.context, row.finding.id);
    findingCards.push({
      id: row.finding.id,
      findingType: row.finding.findingType,
      title: row.finding.title,
      explanation: row.finding.explanation,
      uncertainty: row.finding.uncertainty,
      normalizedRoute: row.finding.normalizedRoute,
      deploymentVersion: row.finding.deploymentVersion,
      viewportGroup: row.finding.viewportGroup,
      windowStart: row.finding.windowStart.toISOString(),
      windowEnd: row.finding.windowEnd.toISOString(),
      eligibleSessionCount: row.finding.eligibleSessionCount,
      eventCount: row.finding.eventCount,
      metricName: row.finding.metricName,
      metricValue: String(row.finding.metricValue),
      denominatorName: row.finding.denominatorName,
      denominatorValue: row.finding.denominatorValue,
      coverageStatus: row.finding.coverageStatus,
      dataQuality: row.finding.dataQuality,
      disposition: row.finding.disposition,
      samplingPercent: row.finding.samplingPercent,
      relatedIssueHref: related?.href ?? null,
      relatedIssueNumber: related?.number ?? null,
      environmentName: row.environmentName,
      investigationSteps: [
        "Reproduce the interaction on the same route and viewport.",
        "Check whether the control provides a visible response.",
      ],
    });
    if (analysis) {
      analysisByFindingId[row.finding.id] = {
        id: analysis.id,
        status: analysis.status,
        modelId: analysis.modelId,
        createdAt: analysis.createdAt.toISOString(),
        result: (analysis.result as BehavioralAiResult | null) ?? null,
      };
    }
  }

  return (
    <>
      <PageHeader
        title="Usability"
        description="See where production visitors click, stop scrolling, or encounter errors—without identifying anyone."
        breadcrumbs={[{ href: "/dashboard", label: "Projects" }, { label: "Usability" }]}
      />
      {environments.length === 0 ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title="No website environments yet"
          description="Add a website review first. Behavioral insights stay off until an owner turns them on."
          action={
            <Button asChild>
              <Link href="/dashboard">Go to projects</Link>
            </Button>
          }
        />
      ) : (
        <UsabilityReport
          environments={environments}
          selectedId={environment?.id ?? ""}
          route={route}
          version={version}
          viewport={viewport}
          view={view}
          report={report}
          start={start}
          end={end}
          findings={
            <FindingsList
              findings={findingCards}
              reviews={reviews}
              members={members}
              analysisByFindingId={analysisByFindingId}
              aiUsage={aiUsage}
            />
          }
        />
      )}
    </>
  );
}
