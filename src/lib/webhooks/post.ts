import "server-only";

import http from "node:http";
import https from "node:https";

export type PinnedPostInput = {
  href: string;
  /** The vetted address from resolveWebhookDestination. The connection goes only here. */
  address: string;
  family: 4 | 6;
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
};

/**
 * Sends one POST to a customer-owned address without following redirects.
 *
 * The connection is pinned to the address that was already checked, so a hostname that
 * changes its answer between the check and the request (DNS rebinding) cannot send the
 * delivery to an internal address. TLS still validates the certificate for the real
 * hostname. The response body is discarded, never stored or shown.
 */
export function postToPinnedAddress(input: PinnedPostInput): Promise<{ status: number }> {
  const url = new URL(input.href);
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const timeoutError = () => {
      const error = new Error("The endpoint took too long to respond.");
      error.name = "TimeoutError";
      return error;
    };

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: { ...input.headers, "Content-Length": String(Buffer.byteLength(input.body)) },
        lookup: (_hostname, _options, callback) => {
          // Node may ask for all addresses or for one; answer the way it asked.
          if ((_options as { all?: boolean }).all) {
            (callback as unknown as (
              error: Error | null,
              addresses: Array<{ address: string; family: number }>,
            ) => void)(null, [{ address: input.address, family: input.family }]);
            return;
          }
          callback(null, input.address, input.family);
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        // Drain and discard, then report only the status.
        response.resume();
        response.on("end", () => resolve({ status }));
        response.on("error", reject);
      },
    );

    request.setTimeout(input.timeoutMs, () => {
      request.destroy(timeoutError());
    });
    request.on("error", reject);
    request.end(input.body);
  });
}
