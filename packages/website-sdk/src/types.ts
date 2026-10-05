export const PROTOTYPE_SESSION_VALUE = "passoff-prototype-m0";

export const NEARBY_TEXT_LIMIT = 180;

export const ANCHOR_DATA_ATTRIBUTES = [
  "data-testid",
  "data-qa",
  "data-cy",
  "data-passoff-anchor",
] as const;

export const PRIVACY_ATTRIBUTE = "data-passoff-private";

export const KILL_SWITCH_STORAGE_KEY = "passoff.killSwitch";

export type ReviewMode = "browse" | "add-feedback" | "pins" | "heatmap";

export type NavigationType =
  | "initial"
  | "pushState"
  | "replaceState"
  | "popstate"
  | "hashchange";

export type ScreenshotStatus = "captured" | "partially-captured" | "unavailable";

/**
 * Normalized annotation for the selected element inside a wider contextual
 * screenshot. Coordinates are relative to the capture target (0–1).
 */
export type ScreenshotAnnotation = {
  version: 1;
  selectedBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pin: {
    x: number;
    y: number;
  };
};

export type PassoffTheme = "light" | "dark" | "system";

/** Production configuration. Never put reusable secrets here. */
export type PassoffConfigureConfig = {
  installationKey?: string;
  disabled?: boolean;
  assetBaseUrl?: string;
  apiBaseUrl?: string;
  buildId?: string;
  theme?: PassoffTheme;
};

export type PassoffInitConfig = {
  session?: string;
  disabled?: boolean;
  assetBaseUrl?: string;
  apiBaseUrl?: string;
  buildId?: string;
  theme?: PassoffTheme;
  /** Authorized review session token from session exchange. */
  sessionToken?: string;
  /** Prototype-only: force initialization to fail without throwing into the host. */
  simulateInitFailure?: boolean;
};

export type PassoffInitResult = {
  ok: boolean;
  reason?: string;
  active: boolean;
};

export type PassoffConfigureResult = {
  ok: boolean;
  reason?: string;
  verified: boolean;
  status?: "ready" | "disabled" | "unknown";
};

export type PrototypeAnchor = {
  pageUrl: string;
  route: string;
  pageTitle: string;
  elementTag: string;
  accessibleRole: string | null;
  accessibleName: string | null;
  nearbyVisibleText: string;
  stableElementId: string | null;
  approvedDataAttributes: Record<string, string>;
  cssSelector: string;
  ancestryFingerprint: string;
  normalizedPosition: { x: number; y: number };
  documentPosition: { x: number; y: number };
  elementBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  environment: { browser: string; operatingSystem: string };
  hostBuildId: string | null;
  capturedAt: string;
  private: boolean;
};

export type ReviewerConfirmation = {
  title: string;
  description: string;
  markerNumber: number;
  screenshotStatus?: ScreenshotStatus;
  screenshotReason?: string;
  targetMissing?: boolean;
  issueId?: string;
  summary?: string;
  statusLabel?: string;
};

export type NavigationEvent = {
  previousUrl: string;
  currentUrl: string;
  type: NavigationType;
  time: string;
};

export type ScreenshotResult = {
  status: ScreenshotStatus;
  reason: string;
  limitations: string[];
  dataUrl?: string;
  /** Present only when capture succeeded and geometry could be calculated. */
  annotation?: ScreenshotAnnotation;
  capturedAt: string;
};

export type PublicPassoffState = {
  active: boolean;
  mode: ReviewMode;
  collapsed: boolean;
  markerCount: number;
  reducedMotion: boolean;
  configured: boolean;
  installationStatus: "idle" | "ready" | "disabled" | "unknown";
  reviewAuthorized: boolean;
  canComment: boolean;
};

export type PassoffCommand = "configure" | "init" | "destroy" | "setMode";

export type PassoffApi = {
  configure: (config?: PassoffConfigureConfig) => Promise<PassoffConfigureResult>;
  init: (config?: PassoffInitConfig) => Promise<PassoffInitResult>;
  destroy: () => void;
  setMode: (mode: ReviewMode) => void;
  getState: () => PublicPassoffState;
  getAnchors: () => PrototypeAnchor[];
  getNavigationEvents: () => NavigationEvent[];
  getConfirmation: () => ReviewerConfirmation | null;
  revalidateMarkers: () => void;
  removeSelectedElement: () => void;
  attemptScreenshot: () => Promise<ScreenshotResult | null>;
  version: string;
};

export type PassoffGlobal = PassoffApi & {
  (command: PassoffCommand, ...args: unknown[]): unknown;
  q?: unknown[];
};
