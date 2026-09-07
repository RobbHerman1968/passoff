import type {
  FigmaExplanationCategory,
  FigmaExplanationStatus,
} from "@/lib/figma/types";

export const FIGMA_EXPLANATION_CATEGORIES = [
  "intent",
  "behavior",
  "content",
  "data",
  "animation",
  "responsive",
  "accessibility",
  "edge_case",
  "developer_note",
] as const satisfies readonly FigmaExplanationCategory[];

export const FIGMA_EXPLANATION_CATEGORY_LABELS: Record<FigmaExplanationCategory, string> = {
  intent: "Intent",
  behavior: "Behavior",
  content: "Content",
  data: "Data",
  animation: "Animation",
  responsive: "Responsive",
  accessibility: "Accessibility",
  edge_case: "Edge case",
  developer_note: "Developer note",
};

export type FigmaAuthoringMode = "comment" | "explain" | null;

export function toggleFigmaAuthoringMode(
  current: FigmaAuthoringMode,
  requested: Exclude<FigmaAuthoringMode, null>,
): FigmaAuthoringMode {
  return current === requested ? null : requested;
}

export function isFigmaExplanationCategory(value: unknown): value is FigmaExplanationCategory {
  return typeof value === "string"
    && (FIGMA_EXPLANATION_CATEGORIES as readonly string[]).includes(value);
}

export function isFigmaExplanationStatus(value: unknown): value is FigmaExplanationStatus {
  return value === "draft" || value === "published";
}

export function isValidFigmaCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

export function isValidFigmaFileKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function requiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

function optionalText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

export type CreateFigmaExplanationInput = {
  projectKey: string;
  fileKey: string;
  fileName: string;
  screenId: string;
  screenName: string;
  figmaNodeId: string | null;
  figmaNodeName: string | null;
  x: number;
  y: number;
  category: FigmaExplanationCategory;
  title: string;
  body: string;
  status: FigmaExplanationStatus;
};

export type UpdateFigmaExplanationInput = {
  projectKey: string;
  id: string;
  title?: string;
  body?: string;
  category?: FigmaExplanationCategory;
  x?: number;
  y?: number;
  status?: FigmaExplanationStatus;
};

export function parseCreateFigmaExplanation(
  value: Record<string, unknown>,
): CreateFigmaExplanationInput | null {
  const projectKey = requiredText(value.projectKey, 200);
  const fileName = requiredText(value.fileName, 200);
  const screenId = requiredText(value.screenId, 200);
  const screenName = requiredText(value.screenName, 200);
  const title = requiredText(value.title, 120);
  const body = requiredText(value.body, 4_000);
  const figmaNodeId = optionalText(value.figmaNodeId, 200);
  const figmaNodeName = optionalText(value.figmaNodeName, 200);
  if (
    !projectKey
    || !isValidFigmaFileKey(value.fileKey)
    || !fileName
    || !screenId
    || !screenName
    || !title
    || !body
    || figmaNodeId === undefined
    || figmaNodeName === undefined
    || !isValidFigmaCoordinate(value.x)
    || !isValidFigmaCoordinate(value.y)
    || !isFigmaExplanationCategory(value.category)
    || !isFigmaExplanationStatus(value.status)
  ) {
    return null;
  }
  return {
    projectKey,
    fileKey: value.fileKey,
    fileName,
    screenId,
    screenName,
    figmaNodeId,
    figmaNodeName,
    x: value.x,
    y: value.y,
    category: value.category,
    title,
    body,
    status: value.status,
  };
}

export function parseUpdateFigmaExplanation(
  value: Record<string, unknown>,
): UpdateFigmaExplanationInput | null {
  const projectKey = requiredText(value.projectKey, 200);
  const id = requiredText(value.id, 200);
  if (!projectKey || !id) return null;

  const next: UpdateFigmaExplanationInput = { projectKey, id };
  let changed = false;
  if (value.title !== undefined) {
    const title = requiredText(value.title, 120);
    if (!title) return null;
    next.title = title;
    changed = true;
  }
  if (value.body !== undefined) {
    const body = requiredText(value.body, 4_000);
    if (!body) return null;
    next.body = body;
    changed = true;
  }
  if (value.category !== undefined) {
    if (!isFigmaExplanationCategory(value.category)) return null;
    next.category = value.category;
    changed = true;
  }
  const hasX = value.x !== undefined;
  const hasY = value.y !== undefined;
  if (hasX !== hasY) return null;
  if (hasX && hasY) {
    if (!isValidFigmaCoordinate(value.x) || !isValidFigmaCoordinate(value.y)) return null;
    next.x = value.x;
    next.y = value.y;
    changed = true;
  }
  if (value.status !== undefined) {
    if (!isFigmaExplanationStatus(value.status)) return null;
    next.status = value.status;
    changed = true;
  }
  return changed ? next : null;
}

export function buildFigmaExplanationsUrl(
  projectKey: string,
  fileKey: string,
  screenId: string,
) {
  const query = new URLSearchParams({ projectKey, fileKey, screenId });
  return `/api/integrations/figma/explanations?${query.toString()}`;
}
