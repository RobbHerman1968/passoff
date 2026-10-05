import { PASSOFF_SDK_VERSION } from "../../../packages/website-sdk/version";

export type EmbedBaseUrlResult =
  | { ok: true; baseUrl: string }
  | { ok: false; message: string };

/**
 * Public embed host used in install snippets and SDK asset URLs.
 * Must be an absolute http(s) origin or origin+path without a trailing slash.
 */
type EmbedEnv = {
  PASSOFF_EMBED_BASE_URL?: string | undefined;
};

export function getPassoffEmbedBaseUrl(env?: EmbedEnv): EmbedBaseUrlResult {
  const source = env ?? (process.env as EmbedEnv);
  const raw = source.PASSOFF_EMBED_BASE_URL?.trim();
  if (!raw) {
    return {
      ok: false,
      message: "PASSOFF_EMBED_BASE_URL is not configured.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      ok: false,
      message: "PASSOFF_EMBED_BASE_URL must be a valid absolute URL.",
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "PASSOFF_EMBED_BASE_URL must use http or https.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "PASSOFF_EMBED_BASE_URL must not include credentials.",
    };
  }

  if (parsed.search || parsed.hash) {
    return {
      ok: false,
      message: "PASSOFF_EMBED_BASE_URL must not include a query or hash.",
    };
  }

  const normalized = `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  return { ok: true, baseUrl: normalized };
}

export function getSdkBootstrapUrl(embedBaseUrl: string): string {
  return `${embedBaseUrl.replace(/\/$/, "")}/sdk/v1/passoff.js?v=${PASSOFF_SDK_VERSION}`;
}
