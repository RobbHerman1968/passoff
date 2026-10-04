/**
 * Build-time flags injected by esbuild `define`.
 * Vitest and TypeScript fall back to development-friendly defaults.
 */

declare const __PASSOFF_ALLOW_PROTOTYPE__: boolean | undefined;
declare const __PASSOFF_REVIEW_CHUNK__: string | undefined;
declare const __PASSOFF_SCREENSHOT_CHUNK__: string | undefined;

export const ALLOW_PROTOTYPE_SESSION =
  typeof __PASSOFF_ALLOW_PROTOTYPE__ === "boolean"
    ? __PASSOFF_ALLOW_PROTOTYPE__
    : true;

export const REVIEW_CHUNK_FILE =
  typeof __PASSOFF_REVIEW_CHUNK__ === "string"
    ? __PASSOFF_REVIEW_CHUNK__
    : "passoff-sdk-review.js";

export const SCREENSHOT_CHUNK_FILE =
  typeof __PASSOFF_SCREENSHOT_CHUNK__ === "string"
    ? __PASSOFF_SCREENSHOT_CHUNK__
    : "passoff-sdk-screenshot.js";
