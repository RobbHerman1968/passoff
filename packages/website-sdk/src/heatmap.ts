import { clusterHeatmapIssues, type HeatmapIssueInput } from "./heatmap-cluster";

export type HeatmapRemoteIssue = {
  id: string;
  number: number;
  title: string;
  status: string;
  statusLabel: string;
  priority: "low" | "normal" | "high" | "urgent";
  assigneeDisplayName: string | null;
  groupLabel: string;
  marker: {
    stableElementId: string | null;
    approvedDataAttributes: Record<string, string>;
    selectedText: string | null;
    pageTitle: string | null;
  };
};

export type HeatmapFilters = {
  show: "active" | "verified" | "closed" | "all";
  priority: "" | "low" | "normal" | "high" | "urgent";
  weighting: "equal" | "priority";
  version: string;
};

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}

export function resolveHeatmapElement(issue: HeatmapRemoteIssue): Element | null {
  if (issue.marker.stableElementId) {
    const byId = document.getElementById(issue.marker.stableElementId);
    if (byId) return byId;
  }
  for (const [attr, value] of Object.entries(issue.marker.approvedDataAttributes ?? {})) {
    try {
      const found = document.querySelector(`[${cssEscape(attr)}="${cssEscape(value)}"]`);
      if (found) return found;
    } catch {
      // ignore
    }
  }
  return null;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createHeatmapLayer(options: {
  overlay: HTMLElement;
  live: HTMLElement;
  onOpenIssue: (issue: HeatmapRemoteIssue) => void;
  onFiltersChange?: (filters: HeatmapFilters) => void;
}) {
  const canvas = document.createElement("div");
  canvas.className = "heatmap";
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  const list = document.createElement("div");
  list.className = "heatmap-list";
  list.hidden = true;
  list.setAttribute("role", "region");
  list.setAttribute("aria-label", "Issue concentrations");
  const hotspotDialog = document.createElement("div");
  hotspotDialog.className = "heatmap-hotspot-list";
  hotspotDialog.hidden = true;
  hotspotDialog.setAttribute("role", "dialog");
  hotspotDialog.setAttribute("aria-label", "Issues in this hotspot");
  options.overlay.append(canvas, list, hotspotDialog);

  let issues: HeatmapRemoteIssue[] = [];
  let filters: HeatmapFilters = {
    show: "active",
    priority: "",
    weighting: "equal",
    version: "",
  };
  let meta = {
    pageRoute: "/",
    environmentName: "",
    versionLabel: "",
  };
  let frame = 0;
  let debounce = 0;
  let running = false;
  let resize: ResizeObserver | null = null;
  let mutations: MutationObserver | null = null;

  const locate = (): HeatmapIssueInput[] =>
    issues.map((issue) => {
      const element = resolveHeatmapElement(issue);
      if (!element || !element.isConnected) {
        return {
          id: issue.id,
          number: issue.number,
          title: issue.title,
          status: issue.status,
          priority: issue.priority,
          assigneeDisplayName: issue.assigneeDisplayName,
          groupLabel: issue.groupLabel,
          x: null,
          y: null,
        };
      }
      const rect = element.getBoundingClientRect();
      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        assigneeDisplayName: issue.assigneeDisplayName,
        groupLabel: issue.groupLabel,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    });

  const issueButton = (issue: HeatmapRemoteIssue) => {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "button";
    const assignee = issue.assigneeDisplayName ? `. ${issue.assigneeDisplayName}` : "";
    open.textContent = `Issue #${issue.number}: ${issue.title}. ${issue.statusLabel}. ${issue.priority}${assignee}. Open issue`;
    open.addEventListener("click", () => {
      hotspotDialog.hidden = true;
      options.onOpenIssue(issue);
    });
    return open;
  };

  const openHotspot = (label: string, group: HeatmapRemoteIssue[]) => {
    hotspotDialog.hidden = false;
    hotspotDialog.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = `${label} — ${group.length} ${group.length === 1 ? "issue" : "issues"}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "button";
    close.textContent = "Close hotspot list";
    close.addEventListener("click", () => {
      hotspotDialog.hidden = true;
    });
    const ul = document.createElement("ul");
    for (const issue of group) {
      const li = document.createElement("li");
      li.append(issueButton(issue));
      ul.append(li);
    }
    hotspotDialog.append(heading, ul, close);
    options.live.textContent = `${label}, ${group.length} issues.`;
    close.focus();
  };

  const renderFilters = (parent: HTMLElement) => {
    const form = document.createElement("form");
    form.className = "heatmap-filters";
    form.addEventListener("submit", (event) => event.preventDefault());

    const show = document.createElement("select");
    show.setAttribute("aria-label", "Issue status");
    for (const [value, label] of [
      ["active", "Active issues"],
      ["verified", "Verified issues"],
      ["closed", "Closed issues"],
      ["all", "All issues"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (filters.show === value) option.selected = true;
      show.append(option);
    }
    show.addEventListener("change", () => {
      filters = { ...filters, show: show.value as HeatmapFilters["show"] };
      options.onFiltersChange?.(filters);
    });

    const priority = document.createElement("select");
    priority.setAttribute("aria-label", "Priority");
    for (const [value, label] of [
      ["", "Any priority"],
      ["urgent", "Urgent"],
      ["high", "High"],
      ["normal", "Normal"],
      ["low", "Low"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      if (filters.priority === value) option.selected = true;
      priority.append(option);
    }
    priority.addEventListener("change", () => {
      filters = { ...filters, priority: priority.value as HeatmapFilters["priority"] };
      options.onFiltersChange?.(filters);
    });

    const weighting = document.createElement("select");
    weighting.setAttribute("aria-label", "Intensity weighting");
    const equal = document.createElement("option");
    equal.value = "equal";
    equal.textContent = "Equal weight";
    const weighted = document.createElement("option");
    weighted.value = "priority";
    weighted.textContent = "Weight by priority";
    if (filters.weighting === "priority") weighted.selected = true;
    else equal.selected = true;
    weighting.append(equal, weighted);
    weighting.addEventListener("change", () => {
      filters = {
        ...filters,
        weighting: weighting.value === "priority" ? "priority" : "equal",
      };
      options.onFiltersChange?.(filters);
    });

    const applyNote = document.createElement("p");
    applyNote.className = "heatmap-help";
    applyNote.textContent =
      "These filters apply to the heatmap only. They do not change the issue list unless you choose Apply to issue list in Passoff.";

    form.append(show, priority, weighting, applyNote);
    parent.append(form);
  };

  const render = () => {
    const located = locate();
    const clustered = clusterHeatmapIssues(located, filters.weighting);
    canvas.replaceChildren();
    for (const hotspot of clustered.hotspots) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "heatmap-hotspot";
      button.dataset.intensity = hotspot.intensity;
      button.style.left = `${hotspot.x}px`;
      button.style.top = `${hotspot.y}px`;
      const countLabel = `${hotspot.count} ${hotspot.count === 1 ? "issue" : "issues"}`;
      button.setAttribute("aria-label", `${hotspot.label}, ${countLabel}`);
      const count = document.createElement("span");
      count.textContent = String(hotspot.count);
      button.append(count);
      if (hotspot.intensity === "high") {
        const caption = document.createElement("span");
        caption.className = "heatmap-hotspot-label";
        caption.textContent = hotspot.label;
        button.append(caption);
      }
      button.addEventListener("click", () =>
        openHotspot(
          hotspot.label,
          hotspot.issues
            .map((item) => issues.find((issue) => issue.id === item.id))
            .filter(Boolean) as HeatmapRemoteIssue[],
        ),
      );
      canvas.append(button);
    }

    const groups = new Map<string, HeatmapRemoteIssue[]>();
    for (const issue of issues) {
      const locatedIssue = located.find((item) => item.id === issue.id);
      const key =
        locatedIssue?.x == null
          ? "Could not be located"
          : issue.groupLabel;
      const listItems = groups.get(key) ?? [];
      listItems.push(issue);
      groups.set(key, listItems);
    }
    list.replaceChildren();
    const heading = document.createElement("h2");
    heading.textContent = "Issue concentrations";
    list.append(heading);
    const help = document.createElement("p");
    help.className = "heatmap-help";
    help.textContent =
      "This map shows where review issues are concentrated. It does not track website visitors or their behavior.";
    list.append(help);
    renderFilters(list);
    const summary = document.createElement("p");
    const weightingLabel =
      filters.weighting === "priority"
        ? "Priority weighting is on. Urgent counts more than High, High more than Normal, and Low less than Normal."
        : "Equal weighting is on. Every issue counts the same.";
    summary.textContent = `${issues.length} matching issues. ${clustered.located} located on ${meta.pageRoute}. ${clustered.unresolved.length} could not be located. ${meta.environmentName}${meta.versionLabel ? ` · ${meta.versionLabel}` : ""}. ${weightingLabel}`;
    list.append(summary);
    for (const [label, group] of groups) {
      const section = document.createElement("section");
      const title = document.createElement("h3");
      const locatedGroup = label !== "Could not be located";
      title.textContent = locatedGroup
        ? `${label} — ${group.length} ${group.length === 1 ? "issue" : "issues"}`
        : `${group.length} ${group.length === 1 ? "issue" : "issues"} could not be located`;
      const ul = document.createElement("ul");
      for (const issue of group) {
        const li = document.createElement("li");
        li.append(issueButton(issue));
        ul.append(li);
      }
      section.append(title, ul);
      list.append(section);
    }
    options.live.textContent = `${clustered.located} issues located on this page. ${clustered.unresolved.length} saved locations could not be matched on the current page.`;
  };

  const schedule = () => {
    if (!running || typeof window === "undefined") return;
    if (debounce) window.clearTimeout(debounce);
    debounce = window.setTimeout(() => {
      debounce = 0;
      if (frame || !running) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    }, 80);
  };

  return {
    setIssues(
      next: HeatmapRemoteIssue[],
      nextFilters: HeatmapFilters,
      nextMeta?: { pageRoute?: string; environmentName?: string; versionLabel?: string },
    ) {
      issues = next;
      filters = nextFilters;
      meta = {
        pageRoute: nextMeta?.pageRoute ?? meta.pageRoute,
        environmentName: nextMeta?.environmentName ?? meta.environmentName,
        versionLabel: nextMeta?.versionLabel ?? meta.versionLabel,
      };
      if (running) schedule();
    },
    start() {
      running = true;
      canvas.hidden = false;
      list.hidden = false;
      render();
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      resize = new ResizeObserver(() => {
        if (running) schedule();
      });
      resize.observe(document.documentElement);
      mutations = new MutationObserver(() => {
        if (running) schedule();
      });
      mutations.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: false,
      });
    },
    stop() {
      running = false;
      canvas.hidden = true;
      list.hidden = true;
      hotspotDialog.hidden = true;
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      resize = null;
      mutations?.disconnect();
      mutations = null;
      if (debounce) window.clearTimeout(debounce);
      debounce = 0;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      canvas.replaceChildren();
      hotspotDialog.replaceChildren();
    },
    prefersReducedMotion: reducedMotion,
  };
}

export type HeatmapLayer = ReturnType<typeof createHeatmapLayer>;
