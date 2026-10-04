import type { PassoffGlobal } from "./types";
import type { mountReview } from "./review";
import type * as screenshot from "./screenshot";

declare global {
  interface Window {
    Passoff?: PassoffGlobal;
    __PASSOFF_DISABLE__?: boolean;
    __PASSOFF_REVIEW_LOADER__?: (
      base: string,
    ) => Promise<{ mountReview: typeof mountReview }>;
    __PASSOFF_SCREENSHOT_LOADER__?: (
      base: string,
    ) => Promise<typeof screenshot>;
  }
}

export {};
