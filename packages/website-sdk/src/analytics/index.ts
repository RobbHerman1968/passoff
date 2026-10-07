import { ANALYTICS_CHUNK_FILE } from "../build-flags";
import { VERSION } from "../styles";
import type { AnalyticsBootstrap } from "./contract";
import {
  collectionAllowed,
  excludeCurrentSession,
  readPrivacyChoice,
  shouldPrompt,
  writePrivacyChoice,
} from "./consent";
import { createCollector, type AnalyticsCollector } from "./collect";
import { createNavigationTracker, type NavigationTracker } from "../navigation";
import { mountPrivacyChoiceLauncher, mountPrivacyPanel } from "./panel";

export type AnalyticsRuntime = {
  openPrivacyChoices: () => void;
  excludeSession: () => void;
  setRouteTemplate: (template: string) => void;
  destroy: () => void;
};

type AnalyticsModule = {
  startAnalytics: typeof startAnalytics;
};

let loader: ((baseUrl: string) => Promise<AnalyticsModule>) | null = null;

export function defaultAnalyticsLoader(baseUrl: string): Promise<AnalyticsModule> {
  const url = new URL(ANALYTICS_CHUNK_FILE, baseUrl);
  url.searchParams.set("v", VERSION);
  return import(/* @vite-ignore */ url.href) as Promise<AnalyticsModule>;
}

export function setAnalyticsLoader(
  next: ((baseUrl: string) => Promise<AnalyticsModule>) | null,
) {
  loader = next;
}

export async function loadAnalyticsModule(baseUrl: string): Promise<AnalyticsModule> {
  if (loader) return loader(baseUrl);
  return defaultAnalyticsLoader(baseUrl);
}

export function startAnalytics(options: {
  config: AnalyticsBootstrap;
  installationKey: string;
  apiBaseUrl: string;
  buildId?: string;
  reviewActive: boolean;
}): AnalyticsRuntime | null {
  if (!options.config.enabled || options.config.killSwitch || options.reviewActive) {
    return null;
  }

  let collector: AnalyticsCollector | null = null;
  let panel: ReturnType<typeof mountPrivacyPanel> | null = null;
  let launcher: ReturnType<typeof mountPrivacyChoiceLauncher> | null = null;
  let navigation: NavigationTracker | null = null;
  let routeTemplate: string | undefined;
  let destroyed = false;

  const sync = () => {
    if (destroyed) return;
    if (collectionAllowed(options.config)) {
      collector ??= createCollector({
        config: options.config,
        installationKey: options.installationKey,
        apiBaseUrl: options.apiBaseUrl,
        buildId: options.buildId,
        getRouteTemplate: () => routeTemplate,
      });
      collector.start();
    } else {
      collector?.stop();
      collector = null;
    }
  };

  const openPrivacyChoices = () => {
    panel?.destroy();
    panel = mountPrivacyPanel({
      config: options.config,
      mode: "manage",
      current: readPrivacyChoice(),
      onAllow() {
        writePrivacyChoice("allow");
        sync();
        launcher?.focus();
      },
      onDeny() {
        writePrivacyChoice("deny");
        collector?.stop();
        collector = null;
        launcher?.focus();
      },
    });
  };

  navigation = createNavigationTracker((event) => {
    if (event.type !== "initial") collector?.routeChanged();
  });
  navigation.start();

  if (shouldPrompt(options.config)) {
    panel = mountPrivacyPanel({
      config: options.config,
      mode: options.config.mode === "strict_consent" ? "consent" : "notice",
      current: readPrivacyChoice(),
      onAllow() {
        writePrivacyChoice("allow");
        sync();
        launcher?.focus();
      },
      onDeny() {
        writePrivacyChoice("deny");
        collector?.stop();
        collector = null;
        launcher?.focus();
      },
    });
  } else {
    sync();
  }

  if (options.config.enabled && !options.config.hideBuiltInPrivacyLink) {
    launcher = mountPrivacyChoiceLauncher(openPrivacyChoices);
  }

  return {
    openPrivacyChoices,
    excludeSession() {
      excludeCurrentSession();
      collector?.stop();
      collector = null;
    },
    setRouteTemplate(template: string) {
      routeTemplate = template;
    },
    destroy() {
      destroyed = true;
      collector?.stop();
      collector = null;
      panel?.destroy();
      panel = null;
      launcher?.destroy();
      launcher = null;
      navigation?.stop();
      navigation = null;
    },
  };
}
