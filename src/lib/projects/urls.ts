import { WEBSITE_URL_MAX_LENGTH } from "@/lib/projects/constants";

export type WebsiteUrlResult =
  | { ok: true; startingUrl: string; allowedOrigin: string }
  | { ok: false; message: string };

/**
 * Accept only http/https website addresses, reject embedded credentials,
 * normalize the URL, and derive the allowed origin for installation.
 */
export function normalizeWebsiteUrl(raw: string): WebsiteUrlResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    return {
      ok: false,
      message: "Enter the website address you want to review.",
    };
  }

  if (trimmed.length > WEBSITE_URL_MAX_LENGTH) {
    return {
      ok: false,
      message: "Enter a shorter website address.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return {
        ok: false,
        message:
          "Enter a valid website address, such as https://example.com.",
      };
    }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      message: "Website addresses must start with http:// or https://.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      message: "Remove the username and password from the website address.",
    };
  }

  if (!parsed.hostname) {
    return {
      ok: false,
      message:
        "Enter a valid website address, such as https://example.com.",
    };
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";

  // Prefer a stable origin without a trailing slash for storage.
  const startingUrl = parsed.toString();
  const allowedOrigin = parsed.origin;

  return {
    ok: true,
    startingUrl,
    allowedOrigin,
  };
}

export function createPublicInstallationKey(): string {
  return `pk_${crypto.randomUUID().replace(/-/g, "")}`;
}
