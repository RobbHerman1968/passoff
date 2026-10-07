import type { BehavioralFindingType } from "@/db/schema";
import { FINDING_THRESHOLDS } from "@/lib/telemetry/limits";

export const FINDING_RULE_VERSION = FINDING_THRESHOLDS.ruleVersion;

export type AggregateGroup = {
  normalizedRoute: string;
  deploymentVersion: string;
  viewportGroup: "mobile" | "tablet" | "desktop";
  eventType: string;
  elementCategory: string;
  analyticsLabel: string;
  errorCategory: string;
  errorFingerprint: string;
  scrollMilestone: number;
  eventCount: number;
  tabSessionCount: number;
};

export type FindingCandidate = {
  findingType: BehavioralFindingType;
  title: string;
  explanation: string;
  uncertainty: string;
  metricName: string;
  metricValue: number;
  denominatorName: string;
  denominatorValue: number;
  eventCount: number;
  eligibleSessionCount: number;
  normalizedRoute: string;
  deploymentVersion: string;
  viewportGroup: "mobile" | "tablet" | "desktop";
  elementCategory: string;
  analyticsLabel: string;
  scopeKey: string;
};

export function findingScopeKey(parts: string[]): string {
  return parts.join("|");
}

export function safeElementLabel(row: {
  analyticsLabel: string;
  elementCategory: string;
}): string {
  return row.analyticsLabel || row.elementCategory || "an unlabeled control";
}

function eligibleSessions(
  groups: AggregateGroup[],
  route: string,
  version: string,
  viewport: string,
): number {
  return (
    groups.find(
      (row) =>
        row.eventType === "page_view" &&
        row.normalizedRoute === route &&
        row.deploymentVersion === version &&
        row.viewportGroup === viewport,
    )?.tabSessionCount ?? 0
  );
}

export function evaluateFindingCandidates(
  groups: AggregateGroup[],
  minSample: number,
  thresholds = FINDING_THRESHOLDS,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const seen = new Set<string>();

  const push = (candidate: FindingCandidate) => {
    if (seen.has(candidate.scopeKey)) return;
    seen.add(candidate.scopeKey);
    candidates.push(candidate);
  };

  for (const row of groups) {
    const eligible = eligibleSessions(
      groups,
      row.normalizedRoute,
      row.deploymentVersion,
      row.viewportGroup,
    );
    if (eligible < minSample) continue;
    const sessionRate = eligible > 0 ? row.tabSessionCount / eligible : 0;

    if (row.eventType === "repeat_click_signal" && sessionRate >= thresholds.repeatClickRate) {
      push(
        candidateFromRow({
          findingType: "repeat_click_concentration",
          title: `Visitors repeatedly clicked ${safeElementLabel(row)}.`,
          explanation: `${row.tabSessionCount} of ${eligible} eligible sessions included repeated clicks.`,
          uncertainty:
            "Repeated clicks can indicate a slow or unclear response, but they do not prove that the control is broken.",
          metricName: "repeat_click_session_rate",
          metricValue: sessionRate,
          row,
          eligible,
        }),
      );
    }

    if (row.eventType === "dead_click_candidate" && sessionRate >= thresholds.deadClickRate) {
      push(
        candidateFromRow({
          findingType: "possible_dead_click",
          title: `Possible dead clicks near ${safeElementLabel(row)}.`,
          explanation: `${row.tabSessionCount} of ${eligible} eligible sessions had a click with no detected response.`,
          uncertainty:
            "Delayed or asynchronous actions can look like possible dead clicks. A person should investigate before treating this as a defect.",
          metricName: "dead_click_candidate_rate",
          metricValue: sessionRate,
          row,
          eligible,
        }),
      );
    }

    if (
      row.eventType === "sanitized_javascript_error" &&
      sessionRate >= thresholds.errorRate
    ) {
      push(
        candidateFromRow({
          findingType: "sanitized_js_error_concentration",
          title: `A JavaScript error increased on ${row.normalizedRoute}.`,
          explanation: `${row.tabSessionCount} of ${eligible} eligible sessions recorded a sanitized ${row.errorCategory || "script"} error.`,
          uncertainty:
            "Error groups are sanitized and aggregated. They do not identify a visitor or prove a specific cause.",
          metricName: "error_session_rate",
          metricValue: sessionRate,
          row: {
            ...row,
            analyticsLabel: row.errorCategory || row.analyticsLabel,
          },
          eligible,
        }),
      );
    }

    if (row.eventType === "element_click" && row.elementCategory === "page_region") {
      const clickRate = eligible > 0 ? row.eventCount / eligible : 0;
      if (clickRate >= thresholds.clickConcentrationPerSession) {
        push(
          candidateFromRow({
            findingType: "click_concentration",
            title: `Clicks concentrated near ${safeElementLabel(row)} on ${row.normalizedRoute}.`,
            explanation: `${row.eventCount} clicks were recorded across ${eligible} eligible sessions.`,
            uncertainty:
              "A high click concentration is not necessarily a problem. Use it as a place to look, not a proven defect.",
            metricName: "click_per_session",
            metricValue: clickRate,
            row,
            eligible,
          }),
        );
      }
    }
  }

  pushScrollDropOffs(groups, minSample, thresholds.scrollDropOffPoints, push);
  pushMaterialVersionChanges(groups, minSample, thresholds.materialChangePoints, push);

  return candidates;
}

function candidateFromRow(input: {
  findingType: BehavioralFindingType;
  title: string;
  explanation: string;
  uncertainty: string;
  metricName: string;
  metricValue: number;
  row: AggregateGroup;
  eligible: number;
}): FindingCandidate {
  return {
    findingType: input.findingType,
    title: input.title,
    explanation: input.explanation,
    uncertainty: input.uncertainty,
    metricName: input.metricName,
    metricValue: input.metricValue,
    denominatorName: "eligible_sessions",
    denominatorValue: input.eligible,
    eventCount: input.row.eventCount,
    eligibleSessionCount: input.eligible,
    normalizedRoute: input.row.normalizedRoute,
    deploymentVersion: input.row.deploymentVersion,
    viewportGroup: input.row.viewportGroup,
    elementCategory: input.row.elementCategory,
    analyticsLabel: input.row.analyticsLabel,
    scopeKey: findingScopeKey([
      FINDING_RULE_VERSION,
      input.findingType,
      input.row.normalizedRoute,
      input.row.deploymentVersion,
      input.row.viewportGroup,
      input.row.elementCategory,
      input.row.analyticsLabel,
      input.row.errorFingerprint,
    ]),
  };
}

function pushScrollDropOffs(
  groups: AggregateGroup[],
  minSample: number,
  dropPoints: number,
  push: (candidate: FindingCandidate) => void,
) {
  const buckets = new Map<string, Map<number, number>>();
  for (const row of groups) {
    if (row.eventType !== "scroll_milestone") continue;
    const key = `${row.normalizedRoute}|${row.deploymentVersion}|${row.viewportGroup}`;
    const map = buckets.get(key) ?? new Map<number, number>();
    map.set(row.scrollMilestone, (map.get(row.scrollMilestone) ?? 0) + row.tabSessionCount);
    buckets.set(key, map);
  }

  const ordered = [25, 50, 75, 90, 100];
  for (const [key, milestones] of buckets) {
    const [normalizedRoute, deploymentVersion, viewportGroup] = key.split("|") as [
      string,
      string,
      "mobile" | "tablet" | "desktop",
    ];
    const eligible = eligibleSessions(groups, normalizedRoute, deploymentVersion, viewportGroup);
    if (eligible < minSample) continue;
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousRate = (milestones.get(previous) ?? 0) / eligible;
      const currentRate = (milestones.get(current) ?? 0) / eligible;
      const drop = previousRate - currentRate;
      if (drop >= dropPoints && previousRate >= 0.2) {
        const row: AggregateGroup = {
          normalizedRoute,
          deploymentVersion,
          viewportGroup,
          eventType: "scroll_milestone",
          elementCategory: "scroll_section",
          analyticsLabel: `${previous}-to-${current}`,
          errorCategory: "",
          errorFingerprint: "",
          scrollMilestone: current,
          eventCount: milestones.get(current) ?? 0,
          tabSessionCount: milestones.get(current) ?? 0,
        };
        push(
          candidateFromRow({
            findingType: "scroll_drop_off",
            title:
              viewportGroup === "mobile"
                ? `Fewer mobile visitors reached further down ${normalizedRoute}.`
                : `Fewer ${viewportGroup} visitors reached further down ${normalizedRoute}.`,
            explanation: `Reach dropped from ${(previousRate * 100).toFixed(0)}% at ${previous}% scroll to ${(currentRate * 100).toFixed(0)}% at ${current}% scroll across ${eligible} eligible sessions.`,
            uncertainty:
              "A scroll drop-off can mean the next section is less relevant, harder to notice, or simply the end of useful content. It does not prove a defect.",
            metricName: "scroll_reach_drop",
            metricValue: drop,
            row,
            eligible,
          }),
        );
      }
    }
  }
}

function pushMaterialVersionChanges(
  groups: AggregateGroup[],
  minSample: number,
  changePoints: number,
  push: (candidate: FindingCandidate) => void,
) {
  const byScope = new Map<string, { version: string; rate: number; eligible: number; row: AggregateGroup }[]>();
  for (const row of groups) {
    if (row.eventType !== "repeat_click_signal") continue;
    const eligible = eligibleSessions(
      groups,
      row.normalizedRoute,
      row.deploymentVersion,
      row.viewportGroup,
    );
    if (eligible < minSample) continue;
    const rate = row.tabSessionCount / eligible;
    const key = `${row.normalizedRoute}|${row.viewportGroup}|${row.elementCategory}|${row.analyticsLabel}`;
    const list = byScope.get(key) ?? [];
    list.push({ version: row.deploymentVersion, rate, eligible, row });
    byScope.set(key, list);
  }

  for (const list of byScope.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.version.localeCompare(b.version));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const delta = current.rate - previous.rate;
      if (Math.abs(delta) < changePoints) continue;
      const versionLabel = current.version || "the later version";
      push(
        candidateFromRow({
          findingType: "material_version_change",
          title:
            delta > 0
              ? `Repeat-click sessions increased after version ${versionLabel}.`
              : `Repeat-click sessions decreased after version ${versionLabel}.`,
          explanation: `Repeat-click sessions moved from ${(previous.rate * 100).toFixed(1)}% on ${previous.version || "an earlier version"} to ${(current.rate * 100).toFixed(1)}% on ${versionLabel}.`,
          uncertainty:
            "A material change between versions is an observation, not proof that a deployment caused a defect or a fix.",
          metricName: "repeat_click_session_rate",
          metricValue: current.rate,
          row: current.row,
          eligible: current.eligible,
        }),
      );
    }
  }
}
