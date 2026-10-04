import { getSdkBootstrapUrl } from "@/lib/installations/embed-config";

const INSTALLATION_KEY_PATTERN = /^pk_[a-f0-9]{32}$/i;

export type InstallSnippetInput = {
  installationKey: string;
  embedBaseUrl: string;
};

function assertSafeInstallationKey(value: string): string {
  const key = value.trim();
  if (!INSTALLATION_KEY_PATTERN.test(key)) {
    throw new Error("Invalid installation key.");
  }
  return key;
}

function assertSafeEmbedBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid embed base URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid embed base URL.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Invalid embed base URL.");
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
}

/** Escape a value for use inside a double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Build a production-safe install snippet.
 * Values are escaped via JSON.stringify / attribute escaping — never raw interpolation.
 */
export function buildInstallSnippet(input: InstallSnippetInput): string {
  const installationKey = assertSafeInstallationKey(input.installationKey);
  const embedBaseUrl = assertSafeEmbedBaseUrl(input.embedBaseUrl);
  const scriptSrc = getSdkBootstrapUrl(embedBaseUrl);

  const configureLiteral = JSON.stringify({ installationKey });
  const srcAttribute = escapeHtmlAttribute(scriptSrc);
  const keyAttribute = escapeHtmlAttribute(installationKey);

  // Keep the stub so queued configure calls work if the async script loads later.
  // The SDK also reads data-passoff-key when the stub is omitted.
  return [
    "<script>",
    "  window.Passoff = window.Passoff || function () {",
    "    (window.Passoff.q = window.Passoff.q || []).push(arguments);",
    "  };",
    "",
    `  window.Passoff("configure", ${configureLiteral});`,
    "</script>",
    "<script",
    "  async",
    `  src="${srcAttribute}"`,
    `  data-passoff-key="${keyAttribute}"`,
    "></script>",
  ].join("\n");
}

export function snippetContainsForbiddenSecrets(snippet: string): boolean {
  const lowered = snippet.toLowerCase();
  return (
    lowered.includes("passoff-prototype-m0") ||
    lowered.includes("bearer ") ||
    lowered.includes("authorization") ||
    /sk_[a-z0-9]+/i.test(snippet) ||
    /session["']\s*:/i.test(snippet)
  );
}

export function isPublicInstallationKey(value: string): boolean {
  return INSTALLATION_KEY_PATTERN.test(value.trim());
}

export { INSTALLATION_KEY_PATTERN };
