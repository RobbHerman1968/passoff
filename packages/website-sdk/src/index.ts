import { exchangeSession } from "./api";
import { REVIEW_CHUNK_FILE } from "./build-flags";
import { setPrivateSelectors } from "./privacy";
import { describeConfigureBlock, describeInitBlock, isKillSwitchOn } from "./session";
import {
  clearStoredSession,
  consumeExchangeCodeFromLocation,
  readStoredSession,
  writeStoredSession,
  type StoredSdkSession,
} from "./session-store";
import { reportInternalError, withHostSafety, withHostSafetyAsync } from "./safe";
import { createNavigationTracker } from "./navigation";
import { VERSION } from "./styles";
import type {
  NavigationEvent,
  PassoffApi,
  PassoffConfigureConfig,
  PassoffConfigureResult,
  PassoffGlobal,
  PassoffInitConfig,
  PassoffInitResult,
  PrototypeAnchor,
  PublicPassoffState,
  ReviewerConfirmation,
  ReviewMode,
  ScreenshotResult,
} from "./types";
import type { ReviewRuntime } from "./review";

export { PROTOTYPE_SESSION_VALUE, KILL_SWITCH_STORAGE_KEY, NEARBY_TEXT_LIMIT } from "./types";

type ReviewLoader = (baseUrl: string) => Promise<{ mountReview: typeof import("./review").mountReview }>;

function defaultReviewLoader(baseUrl: string) {
  const url = new URL(REVIEW_CHUNK_FILE, baseUrl);
  url.searchParams.set("v", VERSION);
  return import(/* @vite-ignore */ url.href) as ReturnType<ReviewLoader>;
}

function resolveScriptElement(): HTMLScriptElement | null {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement) {
    return current;
  }
  return (
    document.querySelector<HTMLScriptElement>("script[data-passoff-key]") ??
    document.querySelector<HTMLScriptElement>("script[src*='passoff']")
  );
}

function resolveBaseUrl(config?: PassoffInitConfig | PassoffConfigureConfig): string {
  if (config?.assetBaseUrl) {
    return config.assetBaseUrl.endsWith("/")
      ? config.assetBaseUrl
      : `${config.assetBaseUrl}/`;
  }
  const script = resolveScriptElement();
  if (script?.src) {
    return script.src.replace(/[^/]+(?:\?.*)?$/, "");
  }
  return `${window.location.origin}/dev/website-sdk/sdk/`;
}

function resolveApiBaseUrl(config?: PassoffConfigureConfig | PassoffInitConfig): string {
  if (config?.apiBaseUrl) {
    return config.apiBaseUrl.replace(/\/$/, "");
  }
  const script = resolveScriptElement();
  if (script?.src) {
    try {
      return new URL(script.src).origin;
    } catch {
      // fall through
    }
  }
  return window.location.origin;
}

function readInstallationKeyFromDom(): string | undefined {
  const script = resolveScriptElement();
  const key = script?.getAttribute("data-passoff-key")?.trim();
  return key || undefined;
}

let active = false;
let configured = false;
let installationStatus: PublicPassoffState["installationStatus"] = "idle";
let storedConfig: PassoffConfigureConfig = {};
let authorizedSession: StoredSdkSession | null = null;
let runtime: ReviewRuntime | null = null;
let navigation = createNavigationTracker(() => undefined);
let reviewLoader: ReviewLoader = defaultReviewLoader;
let bootstrapping = false;

function emptyState(): PublicPassoffState {
  return {
    active: false,
    mode: "browse",
    collapsed: false,
    markerCount: 0,
    reducedMotion: false,
    configured,
    installationStatus,
    reviewAuthorized: Boolean(authorizedSession),
    canComment: authorizedSession?.canComment ?? false,
  };
}

async function verifyInstallation(
  config: PassoffConfigureConfig,
): Promise<PassoffConfigureResult> {
  const installationKey =
    config.installationKey?.trim() || readInstallationKeyFromDom();
  if (!installationKey) {
    return {
      ok: false,
      reason: "Passoff needs an installation key before it can check this website.",
      verified: false,
      status: "unknown",
    };
  }

  const apiBase = resolveApiBaseUrl(config);
  const endpoint = `${apiBase}/api/sdk/v1/installations/verify`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        installationKey,
        origin: window.location.origin,
        sdkVersion: VERSION,
        buildId: config.buildId,
      }),
    });

    if (!response.ok) {
      installationStatus = "unknown";
      return {
        ok: false,
        reason: "Passoff couldn't confirm this installation yet.",
        verified: false,
        status: "unknown",
      };
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      status?: string;
    };

    if (payload.status === "disabled") {
      installationStatus = "disabled";
      return {
        ok: true,
        verified: false,
        status: "disabled",
        reason: "Passoff is disabled for this website.",
      };
    }

    if (payload.ok && payload.status === "ready") {
      installationStatus = "ready";
      return { ok: true, verified: true, status: "ready" };
    }

    installationStatus = "unknown";
    return {
      ok: false,
      verified: false,
      status: "unknown",
      reason: "Passoff couldn't confirm this installation yet.",
    };
  } catch (error) {
    reportInternalError(error);
    installationStatus = "unknown";
    return {
      ok: false,
      verified: false,
      status: "unknown",
      reason: "Passoff couldn't confirm this installation yet.",
    };
  }
}

async function tryAuthorizeFromLaunch(
  config: PassoffConfigureConfig,
): Promise<{ ok: boolean; reason?: string }> {
  const installationKey =
    config.installationKey?.trim() ||
    storedConfig.installationKey ||
    readInstallationKeyFromDom();
  if (!installationKey) {
    return {
      ok: false,
      reason: "Passoff isn’t configured on this website yet.",
    };
  }

  const existing = readStoredSession();
  if (existing && existing.installationKey === installationKey) {
    authorizedSession = existing;
    setPrivateSelectors(existing.privateSelectors);
    return { ok: true };
  }

  const exchangeCode = consumeExchangeCodeFromLocation();
  if (!exchangeCode) {
    return { ok: false };
  }

  const exchanged = await exchangeSession({
    apiBaseUrl: resolveApiBaseUrl(config),
    installationKey,
    exchangeCode,
  });

  if (!exchanged.ok) {
    return {
      ok: false,
      reason: exchanged.message ?? "Passoff couldn’t start this review.",
    };
  }

  authorizedSession = {
    sessionToken: exchanged.sessionToken,
    expiresAt: exchanged.expiresAt,
    canComment: exchanged.canComment,
    reviewerName: exchanged.reviewerName,
    privateSelectors: exchanged.privateSelectors,
    installationKey,
  };
  writeStoredSession(authorizedSession);
  setPrivateSelectors(exchanged.privateSelectors);
  return { ok: true };
}

const api: PassoffApi = {
  version: VERSION,
  async configure(config = {}): Promise<PassoffConfigureResult> {
    return withHostSafetyAsync(async () => {
      const blocked = describeConfigureBlock(config);
      if (blocked) {
        configured = true;
        installationStatus = "disabled";
        storedConfig = { ...storedConfig, ...config };
        return { ok: false, reason: blocked, verified: false, status: "disabled" };
      }

      storedConfig = {
        ...storedConfig,
        ...config,
        installationKey:
          config.installationKey?.trim() ||
          storedConfig.installationKey ||
          readInstallationKeyFromDom(),
      };
      configured = true;

      const verified = await verifyInstallation(storedConfig);

      // Authorization never comes from the public installation key alone.
      const authorized = await tryAuthorizeFromLaunch(storedConfig);
      if (authorized.ok && !active) {
        void api.init({
          sessionToken: authorizedSession?.sessionToken,
          assetBaseUrl: storedConfig.assetBaseUrl,
          apiBaseUrl: storedConfig.apiBaseUrl,
          buildId: storedConfig.buildId,
          theme: storedConfig.theme,
        });
      }

      return verified;
    }, {
      ok: false,
      reason: "Passoff couldn't confirm this installation yet.",
      verified: false,
      status: "unknown",
    });
  },
  async init(config = {}): Promise<PassoffInitResult> {
    return withHostSafetyAsync(async () => {
      const merged: PassoffInitConfig = {
        ...storedConfig,
        ...config,
        sessionToken:
          config.sessionToken?.trim() ||
          authorizedSession?.sessionToken ||
          config.sessionToken,
      };

      if (!merged.sessionToken && !merged.session) {
        const authorized = await tryAuthorizeFromLaunch(storedConfig);
        if (authorized.ok) {
          merged.sessionToken = authorizedSession?.sessionToken;
        } else if (authorized.reason) {
          return { ok: false, reason: authorized.reason, active: false };
        }
      }

      const blocked = describeInitBlock(merged);
      if (blocked) {
        return { ok: false, reason: blocked, active: false };
      }
      if (config.simulateInitFailure) {
        reportInternalError(new Error("Prototype initialization failed"));
        return {
          ok: false,
          reason: "Passoff couldn't start on this page. You can keep using the website.",
          active: false,
        };
      }
      if (installationStatus === "disabled" || isKillSwitchOn(merged)) {
        return {
          ok: false,
          reason: "Passoff is turned off for this website.",
          active: false,
        };
      }
      if (active && runtime) {
        return { ok: true, active: true };
      }
      const baseUrl = resolveBaseUrl(merged);
      const apiBaseUrl = resolveApiBaseUrl(merged);
      performance.mark("passoff-init-start");
      const reviewModule = await reviewLoader(baseUrl);
      runtime = reviewModule.mountReview({
        buildId: merged.buildId ?? storedConfig.buildId ?? null,
        assetBaseUrl: baseUrl,
        apiBaseUrl,
        sessionToken: merged.sessionToken ?? null,
        canComment: authorizedSession?.canComment ?? true,
        theme: merged.theme ?? storedConfig.theme,
      });
      navigation = createNavigationTracker(() => {
        withHostSafety(() => runtime?.revalidateMarkers(), undefined);
      });
      navigation.start();
      active = true;
      performance.mark("passoff-init-end");
      performance.measure("passoff-init", "passoff-init-start", "passoff-init-end");
      return { ok: true, active: true };
    }, {
      ok: false,
      reason: "Passoff couldn't start on this page. You can keep using the website.",
      active: false,
    });
  },
  destroy() {
    withHostSafety(() => {
      runtime?.destroy();
      runtime = null;
      navigation.stop();
      navigation = createNavigationTracker(() => undefined);
      active = false;
    }, undefined);
  },
  setMode(mode: ReviewMode) {
    withHostSafety(() => runtime?.setMode(mode), undefined);
  },
  getState() {
    return withHostSafety(() => {
      if (!runtime) {
        return emptyState();
      }
      return {
        active,
        mode: runtime.getMode(),
        collapsed: runtime.getCollapsed(),
        markerCount: runtime.getMarkers().length,
        reducedMotion: Boolean(
          window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
        ),
        configured,
        installationStatus,
        reviewAuthorized: Boolean(authorizedSession || runtime),
        canComment: authorizedSession?.canComment ?? true,
      };
    }, emptyState());
  },
  getAnchors(): PrototypeAnchor[] {
    return withHostSafety(() => runtime?.getAnchors() ?? [], []);
  },
  getNavigationEvents(): NavigationEvent[] {
    return withHostSafety(() => navigation.events.slice(), []);
  },
  getConfirmation(): ReviewerConfirmation | null {
    return withHostSafety(() => runtime?.getConfirmation() ?? null, null);
  },
  revalidateMarkers() {
    withHostSafety(() => runtime?.revalidateMarkers(), undefined);
  },
  removeSelectedElement() {
    withHostSafety(() => runtime?.removeCurrentTarget(), undefined);
  },
  async attemptScreenshot(): Promise<ScreenshotResult | null> {
    return withHostSafetyAsync(async () => runtime?.attemptScreenshot() ?? null, null);
  },
};

function asGlobal(): PassoffGlobal {
  const callable = function Passoff(command: string, ...args: unknown[]) {
    const method = api[command as keyof PassoffApi];
    if (typeof method === "function") {
      return (method as (...params: unknown[]) => unknown)(...args);
    }
    return undefined;
  } as PassoffGlobal;
  Object.assign(callable, api);
  return callable;
}

export function installPassoff(target: Window & { Passoff?: PassoffGlobal }): PassoffGlobal {
  const queued = Array.isArray(target.Passoff?.q) ? [...target.Passoff.q] : [];
  const globalApi = asGlobal();
  target.Passoff = globalApi;

  const domKey = readInstallationKeyFromDom();
  if (domKey && !queued.some((item) => Array.isArray(item) && item[0] === "configure")) {
    withHostSafety(() => {
      void globalApi.configure({ installationKey: domKey });
    }, undefined);
  } else if (!bootstrapping) {
    // Still try exchange if configure was queued — configure handles it.
    bootstrapping = true;
  }

  for (const item of queued) {
    const args = Array.isArray(item) ? item : [item];
    const [command, ...rest] = args as [string, ...unknown[]];
    withHostSafety(() => globalApi(command as "init", ...rest), undefined);
  }
  return globalApi;
}

export function __setReviewLoader(loader: ReviewLoader) {
  reviewLoader = loader;
}

export function __getRuntime() {
  return runtime;
}

export function __resetSdkStateForTests() {
  active = false;
  configured = false;
  installationStatus = "idle";
  storedConfig = {};
  authorizedSession = null;
  runtime = null;
  navigation = createNavigationTracker(() => undefined);
  reviewLoader = defaultReviewLoader;
  bootstrapping = false;
  clearStoredSession();
  setPrivateSelectors([]);
}
