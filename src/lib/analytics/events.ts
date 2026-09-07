/**
 * Typed analytics events for the SEO acquisition cluster and product funnel.
 * No vendor is wired yet — call `track()`; a provider can be connected later.
 */

export type AnalyticsEventName =
  | "seo_landing_page_view"
  | "primary_cta_click"
  | "signup_start"
  | "signup_completed"
  | "approval_room_created"
  | "first_revision_published"
  | "first_review_link_created";

export type AnalyticsEventPayloads = {
  seo_landing_page_view: {
    path: string;
    intent?: string;
    pageType: "commercial" | "resource" | "hub" | "home" | "pricing";
  };
  primary_cta_click: {
    path: string;
    cta: "Start Free Trial";
    placement: "header" | "hero" | "mid" | "footer" | "inline";
  };
  signup_start: {
    path: string;
    source?: string;
  };
  signup_completed: {
    path?: string;
  };
  approval_room_created: {
    roomId: string;
  };
  first_revision_published: {
    roomId: string;
    revisionNumber: number;
  };
  first_review_link_created: {
    roomId: string;
  };
};

export type AnalyticsEvent<T extends AnalyticsEventName = AnalyticsEventName> = {
  name: T;
  properties: AnalyticsEventPayloads[T];
  timestamp?: string;
};

export type AnalyticsProvider = {
  track: <T extends AnalyticsEventName>(event: AnalyticsEvent<T>) => void;
};

const noopProvider: AnalyticsProvider = {
  track() {
    // Provider intentionally unset until an analytics vendor is approved.
  },
};

let provider: AnalyticsProvider = noopProvider;

export function setAnalyticsProvider(next: AnalyticsProvider) {
  provider = next;
}

export function track<T extends AnalyticsEventName>(
  name: T,
  properties: AnalyticsEventPayloads[T],
) {
  provider.track({
    name,
    properties,
    timestamp: new Date().toISOString(),
  });
}
