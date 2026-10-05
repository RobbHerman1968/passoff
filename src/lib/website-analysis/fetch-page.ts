import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { LookupFunction } from "node:net";

import {
  defaultDnsLookup,
  type LookupFn,
  validateFetchTarget,
  type UrlValidationFailure,
} from "@/lib/website-analysis/ssrf";

export const FETCH_CONNECT_TIMEOUT_MS = 5_000;
export const FETCH_TOTAL_TIMEOUT_MS = 15_000;
export const FETCH_MAX_REDIRECTS = 5;
export const FETCH_MAX_RESPONSE_BYTES = 512_000;

const SAFE_REQUEST_HEADERS = {
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en",
  "User-Agent": "PassoffWebsiteAnalyzer/1.0 (+https://passoff.io)",
} as const;

export type FetchPageFailureReason =
  | UrlValidationFailure
  | "timeout"
  | "too_many_redirects"
  | "response_too_large"
  | "not_html"
  | "http_error"
  | "network_error"
  | "empty_body";

export type FetchedPage = {
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  redirected: boolean;
  redirectCount: number;
};

export type FetchPageResult =
  | { ok: true; page: FetchedPage }
  | {
      ok: false;
      reason: FetchPageFailureReason;
      message: string;
      statusCode?: number;
    };

type RequestResult = {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  url: URL;
};

function headerRecord(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      out[key.toLowerCase()] = value;
    } else if (Array.isArray(value)) {
      out[key.toLowerCase()] = value.join(", ");
    }
  }
  return out;
}

function isHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return true; // many sites omit it; still inspect cautiously
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("text/html") ||
    normalized.includes("application/xhtml+xml")
  );
}

function readLimitedBody(
  response: IncomingMessage,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      response.destroy();
      reject(error);
    };

    const onAbort = () => fail(new Error("aborted"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });

    response.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > maxBytes) {
        fail(Object.assign(new Error("response_too_large"), { code: "response_too_large" }));
        return;
      }
      chunks.push(buf);
    });
    response.on("end", () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(Buffer.concat(chunks));
    });
    response.on("error", (error) => fail(error));
  });
}

type PinnedLookupAddress = { address: string; family: 4 | 6 };

/**
 * Custom DNS lookup that pins to a pre-validated address.
 * Supports both Node callback shapes: single address and `{ all: true }`.
 */
export function createPinnedLookup(address: PinnedLookupAddress): LookupFunction {
  const lookup: LookupFunction = (hostname, options, callback) => {
    const cb = typeof options === "function" ? options : callback;
    const opts =
      typeof options === "function" || typeof options === "number"
        ? undefined
        : options;
    if (typeof cb !== "function") {
      return;
    }
    void hostname;
    if (opts?.all) {
      (
        cb as (
          err: NodeJS.ErrnoException | null,
          addresses: PinnedLookupAddress[],
        ) => void
      )(null, [{ address: address.address, family: address.family }]);
      return;
    }
    (
      cb as (
        err: NodeJS.ErrnoException | null,
        address: string,
        family: number,
      ) => void
    )(null, address.address, address.family);
  };
  return lookup;
}

async function pinnedRequest(input: {
  url: URL;
  addresses: Array<{ address: string; family: 4 | 6 }>;
  signal: AbortSignal;
  maxBytes: number;
}): Promise<RequestResult> {
  const address = input.addresses[0];
  if (!address) {
    throw Object.assign(new Error("dns_failed"), { code: "dns_failed" });
  }

  const lib = input.url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const request = lib.request(
      {
        protocol: input.url.protocol,
        hostname: input.url.hostname,
        port: input.url.port || undefined,
        path: `${input.url.pathname}${input.url.search}`,
        method: "GET",
        headers: {
          ...SAFE_REQUEST_HEADERS,
          Host: input.url.host,
        },
        servername: input.url.hostname,
        timeout: FETCH_CONNECT_TIMEOUT_MS,
        // Pin DNS to pre-validated addresses to reduce DNS rebinding risk.
        lookup: createPinnedLookup(address),
      },
      (response) => {
        readLimitedBody(response, input.maxBytes, input.signal)
          .then((body) => {
            if (settled) return;
            settled = true;
            resolve({
              statusCode: response.statusCode ?? 0,
              headers: response.headers,
              body,
              url: input.url,
            });
          })
          .catch(fail);
      },
    );

    const onAbort = () => {
      request.destroy();
      fail(Object.assign(new Error("timeout"), { code: "timeout" }));
    };
    if (input.signal.aborted) {
      onAbort();
      return;
    }
    input.signal.addEventListener("abort", onAbort, { once: true });

    request.on("timeout", () => {
      request.destroy();
      fail(Object.assign(new Error("timeout"), { code: "timeout" }));
    });
    request.on("error", fail);
    request.end();
  });
}

function redirectLocation(
  current: URL,
  locationHeader: string | undefined,
): string | null {
  if (!locationHeader) return null;
  try {
    return new URL(locationHeader, current).toString();
  } catch {
    return null;
  }
}

/**
 * Fetch HTML for analysis without forwarding Passoff credentials or executing JS.
 */
export async function fetchPageForAnalysis(input: {
  startingUrl: string;
  allowedOrigins: string[];
  lookup?: LookupFn;
  requestFn?: typeof pinnedRequest;
}): Promise<FetchPageResult> {
  const lookup = input.lookup ?? defaultDnsLookup;
  const requestFn = input.requestFn ?? pinnedRequest;
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), FETCH_TOTAL_TIMEOUT_MS);

  try {
    let currentUrl = input.startingUrl;
    let redirectCount = 0;

    while (redirectCount <= FETCH_MAX_REDIRECTS) {
      const validated = await validateFetchTarget({
        rawUrl: currentUrl,
        allowedOrigins: input.allowedOrigins,
        lookup,
      });
      if (!validated.ok) {
        return {
          ok: false,
          reason: validated.reason,
          message: validated.message,
        };
      }

      // Re-check DNS immediately before connect (rebinding window reduction).
      const revalidated = await validateFetchTarget({
        rawUrl: validated.url.toString(),
        allowedOrigins: input.allowedOrigins,
        lookup,
      });
      if (!revalidated.ok) {
        return {
          ok: false,
          reason: revalidated.reason,
          message: revalidated.message,
        };
      }

      let response: RequestResult;
      try {
        response = await requestFn({
          url: revalidated.url,
          addresses: revalidated.addresses,
          signal: controller.signal,
          maxBytes: FETCH_MAX_RESPONSE_BYTES,
        });
      } catch (error) {
        const code =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: string }).code)
            : "";
        if (code === "response_too_large") {
          return {
            ok: false,
            reason: "response_too_large",
            message:
              "The website response was too large to analyze safely. You can still choose your platform manually.",
          };
        }
        if (
          code === "timeout" ||
          controller.signal.aborted ||
          (error instanceof Error && error.message === "timeout")
        ) {
          return {
            ok: false,
            reason: "timeout",
            message:
              "The website took too long to respond. You can try again or choose your platform manually.",
          };
        }
        return {
          ok: false,
          reason: "network_error",
          message:
            "We couldn’t reach this website. It may be down, blocking automated checks, or require sign-in.",
        };
      }

      const headers = headerRecord(response.headers);
      const status = response.statusCode;

      if (status >= 300 && status < 400) {
        const next = redirectLocation(revalidated.url, headers.location);
        if (!next) {
          return {
            ok: false,
            reason: "network_error",
            message: "The website returned a redirect we couldn’t follow.",
          };
        }
        redirectCount += 1;
        if (redirectCount > FETCH_MAX_REDIRECTS) {
          return {
            ok: false,
            reason: "too_many_redirects",
            message: "The website redirected too many times to analyze safely.",
          };
        }
        currentUrl = next;
        continue;
      }

      if (status === 401 || status === 403) {
        return {
          ok: false,
          reason: "http_error",
          statusCode: status,
          message:
            "We couldn’t inspect this site because it requires sign-in or blocked our request.",
        };
      }

      if (status < 200 || status >= 300) {
        return {
          ok: false,
          reason: "http_error",
          statusCode: status,
          message:
            "The website didn’t return a usable page. You can choose your platform manually.",
        };
      }

      if (!isHtmlContentType(headers["content-type"])) {
        return {
          ok: false,
          reason: "not_html",
          message:
            "The website didn’t return an HTML page we can analyze for installation guidance.",
        };
      }

      const body = response.body.toString("utf8");
      if (!body.trim()) {
        return {
          ok: false,
          reason: "empty_body",
          message: "The website returned an empty page.",
        };
      }

      return {
        ok: true,
        page: {
          finalUrl: revalidated.url.toString(),
          statusCode: status,
          headers,
          body,
          redirected: redirectCount > 0,
          redirectCount,
        },
      };
    }

    return {
      ok: false,
      reason: "too_many_redirects",
      message: "The website redirected too many times to analyze safely.",
    };
  } finally {
    clearTimeout(totalTimer);
  }
}
