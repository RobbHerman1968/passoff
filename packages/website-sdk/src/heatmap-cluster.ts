export const HEATMAP_MAX_LOCATIONS = 80;
export const HEATMAP_CLUSTER_PX = 72;

export type HeatmapPriority = "low" | "normal" | "high" | "urgent";

export const PRIORITY_WEIGHTS: Record<HeatmapPriority, number> = {
  low: 0.5,
  normal: 1,
  high: 2,
  urgent: 3,
};

export type HeatmapIssueInput = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: HeatmapPriority;
  assigneeDisplayName: string | null;
  groupLabel: string;
  x: number | null;
  y: number | null;
};

export type HeatmapHotspot = {
  id: string;
  label: string;
  count: number;
  weight: number;
  intensity: "low" | "medium" | "high";
  x: number;
  y: number;
  issues: HeatmapIssueInput[];
};

export function issueWeight(priority: HeatmapPriority, mode: "equal" | "priority"): number {
  return mode === "priority" ? PRIORITY_WEIGHTS[priority] : 1;
}

export function intensityForWeight(weight: number, maxWeight: number): "low" | "medium" | "high" {
  if (maxWeight <= 0) return "low";
  const ratio = weight / maxWeight;
  if (ratio >= 0.66) return "high";
  if (ratio >= 0.33) return "medium";
  return "low";
}

export function clusterHeatmapIssues(
  issues: HeatmapIssueInput[],
  weighting: "equal" | "priority",
): { hotspots: HeatmapHotspot[]; unresolved: HeatmapIssueInput[]; located: number } {
  const unresolved = issues.filter((issue) => issue.x == null || issue.y == null);
  const located = issues.filter((issue) => issue.x != null && issue.y != null);
  const clusters: HeatmapIssueInput[][] = [];

  for (const issue of located) {
    const existing = clusters.find((cluster) => {
      const first = cluster[0];
      if (!first || first.x == null || first.y == null || issue.x == null || issue.y == null) {
        return false;
      }
      return Math.hypot(first.x - issue.x, first.y - issue.y) <= HEATMAP_CLUSTER_PX;
    });
    if (existing) existing.push(issue);
    else clusters.push([issue]);
  }

  clusters.sort((a, b) => b.length - a.length || a[0]!.number - b[0]!.number);
  const limited = clusters.slice(0, HEATMAP_MAX_LOCATIONS);
  const overflow = clusters.slice(HEATMAP_MAX_LOCATIONS).flat();

  const hotspots: HeatmapHotspot[] = limited.map((cluster, index) => {
    const weight = cluster.reduce((sum, issue) => sum + issueWeight(issue.priority, weighting), 0);
    const x = cluster.reduce((sum, issue) => sum + (issue.x ?? 0), 0) / cluster.length;
    const y = cluster.reduce((sum, issue) => sum + (issue.y ?? 0), 0) / cluster.length;
    const labelCounts = new Map<string, number>();
    for (const issue of cluster) {
      labelCounts.set(issue.groupLabel, (labelCounts.get(issue.groupLabel) ?? 0) + 1);
    }
    const label =
      [...labelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
      "Page area";
    return {
      id: `hotspot-${index}`,
      label,
      count: cluster.length,
      weight,
      intensity: "low" as const,
      x,
      y,
      issues: [...cluster].sort((a, b) => a.number - b.number),
    };
  });

  const maxWeight = Math.max(...hotspots.map((hotspot) => hotspot.weight), 0);
  for (const hotspot of hotspots) {
    hotspot.intensity = intensityForWeight(hotspot.weight, maxWeight);
  }

  return {
    hotspots,
    unresolved: [...unresolved, ...overflow],
    located: located.length - overflow.length,
  };
}
