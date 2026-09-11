export type FigmaScreen = {
  id: string;
  name: string;
  type: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
  interactionCount: number;
  isMain?: boolean;
  breakpointGroupId?: string | null;
  breakpointGroupName?: string | null;
  isGroupPrimary?: boolean;
  breakpointLabel?: string;
};

export type FigmaInteraction = {
  sourceNodeId: string;
  sourceNodeName: string;
  sourceScreenId: string;
  destinationNodeId: string | null;
  destinationScreenId: string | null;
  trigger: string;
  actions: string[];
  sourceBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type FigmaImportSource = "plugin" | "api" | "created" | "upload";

export type FigmaImportResult = {
  designId?: string;
  designVersionId?: string;
  versionNumber?: number;
  file: {
    key: string;
    name: string;
    version: string;
    lastModified: string;
    thumbnailUrl: string | null;
    mainScreenId?: string | null;
  };
  screens: FigmaScreen[];
  interactions: FigmaInteraction[];
  warnings: string[];
  importSource?: FigmaImportSource;
};

export type FigmaSavedImportSummary = {
  id: string;
  designId: string;
  designVersionId: string;
  versionNumber: number;
  fileKey: string;
  fileName: string;
  version: string;
  lastModified: string;
  thumbnailUrl: string | null;
  screenCount: number;
  previewCount: number;
  interactionCount: number;
  importedAt: string;
  importedBy: string;
  importSource: FigmaImportSource;
};

export type ProjectDesignBreakpoint = {
  id: string;
  name: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  breakpointLabel: string;
  isPrimary: boolean;
};

/** One grid card on the project page — a single screen or a breakpoint set. */
export type ProjectDesignSummary = {
  key: string;
  designId: string;
  designVersionId: string;
  versionNumber: number;
  name: string;
  fileKey: string;
  fileName: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  isMain: boolean;
  isCombined: boolean;
  groupId: string | null;
  breakpoints: ProjectDesignBreakpoint[];
  sortOrder: number;
};

export type FigmaImportProgress = {
  stage: "connecting" | "reading" | "rendering" | "mapping" | "saving" | "complete";
  message: string;
  percent: number;
  current?: number;
  total?: number;
};

export type FigmaRateLimitDetails = {
  retryAfterSeconds: number | null;
  retryAt: string | null;
  planTier: string | null;
  rateLimitType: string | null;
  upgradeUrl: string | null;
};

export type FigmaImportStreamEvent =
  | ({ type: "progress" } & FigmaImportProgress)
  | { type: "complete"; result: FigmaImportResult }
  | { type: "error"; error: string; status: number; rateLimit: FigmaRateLimitDetails | null };

export type FigmaConnectionStatus = {
  configured: boolean;
  pluginConfigured: boolean;
  connected: boolean;
  figmaUserId: string | null;
  expiresAt: string | null;
  tenant: {
    organizationName: string;
    workspaceName: string;
    projectName: string;
    userName: string;
    userEmail: string;
  } | null;
};

export type FigmaQuestionResponse = {
  answer: string;
  evidence: string[];
  gaps: string[];
  analysisSource: "openai" | "local";
};

export type FigmaQuestionRecord = FigmaQuestionResponse & {
  id: string;
  screenId: string;
  screenName: string;
  question: string;
  createdAt: string;
};

export type FigmaCommentRecord = {
  id: string;
  screenId: string;
  screenName: string;
  x: number;
  y: number;
  body: string;
  status: "open" | "resolved";
  authorName: string;
  authorUserId: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type FigmaExplanationCategory =
  | "intent"
  | "behavior"
  | "content"
  | "data"
  | "animation"
  | "responsive"
  | "accessibility"
  | "edge_case"
  | "developer_note";

export type FigmaExplanationStatus = "draft" | "published";

export type FigmaExplanationRecord = {
  id: string;
  screenId: string;
  screenName: string;
  figmaNodeId: string | null;
  figmaNodeName: string | null;
  x: number;
  y: number;
  selectionWidth: number | null;
  selectionHeight: number | null;
  category: FigmaExplanationCategory;
  title: string;
  body: string;
  status: FigmaExplanationStatus;
  authorName: string;
  authorUserId: string | null;
  canEdit: boolean;
  canMoveToDraft: boolean;
  createdAt: string;
  updatedAt: string;
};
