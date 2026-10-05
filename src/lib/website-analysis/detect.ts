import { createHash } from "node:crypto";

import type { DetectedPlatform } from "@/lib/website-analysis/platforms";
import type {
  SanitizedEvidence,
  deterministicCandidateSchema,
} from "@/lib/website-analysis/schema";
import type { z } from "zod";

type Candidate = z.infer<typeof deterministicCandidateSchema>;

export type PageSignals = {
  finalUrl: string;
  contentType: string | null;
  headers: Record<string, string>;
  body: string;
  /** Hostname that serves Passoff’s install script, used for CSP allow checks. */
  passoffScriptHost?: string | null;
};

const SAFE_HEADER_NAMES = [
  "content-type",
  "server",
  "x-powered-by",
  "x-shopify-stage",
  "x-wix-request-id",
  "x-nf-request-id",
  "x-vercel-id",
  "cf-ray",
  "content-security-policy",
  "content-security-policy-report-only",
] as const;

function stripAssetUrl(raw: string): {
  hostname: string;
  path: string;
  filename: string | null;
} | null {
  try {
    const url = new URL(raw, "https://placeholder.invalid");
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname.slice(0, 200);
    const segments = path.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? null;
    return {
      hostname: url.hostname.toLowerCase().slice(0, 253),
      path,
      filename: last && last.includes(".") ? last.slice(0, 120) : null,
    };
  } catch {
    return null;
  }
}

function uniqueLimited<T>(items: T[], max: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function extractMetaGenerator(html: string): string | null {
  const match = html.match(
    /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i,
  ) ?? html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']generator["']/i,
  );
  if (!match?.[1]) return null;
  return match[1].trim().slice(0, 200);
}

function extractTagAttributes(
  html: string,
  tag: "script" | "link",
  attr: string,
): string[] {
  const pattern =
    tag === "script"
      ? /<script\b[^>]*>/gi
      : /<link\b[^>]*>/gi;
  const attrPattern = new RegExp(`${attr}=["']([^"']+)["']`, "i");
  const values: string[] = [];
  for (const chunk of html.match(pattern) ?? []) {
    const found = chunk.match(attrPattern);
    if (found?.[1]) values.push(found[1]);
  }
  return values;
}

function extractMetaContentSecurityPolicy(html: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const httpEquiv = tag.match(/http-equiv\s*=\s*(["'])([^"']+)\1/i)?.[2];
    if (!httpEquiv || httpEquiv.toLowerCase() !== "content-security-policy") {
      continue;
    }
    const content = tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
    if (content?.trim()) return content.trim();
  }
  return null;
}

function scriptSrcTokensFromCsp(raw: string): {
  names: string[];
  tokens: string[];
} {
  const directives = raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  const names: string[] = [];
  let scriptSrc = "";
  for (const directive of directives) {
    const [name, ...rest] = directive.split(/\s+/);
    if (!name) continue;
    names.push(name.toLowerCase().slice(0, 80));
    if (
      name.toLowerCase() === "script-src" ||
      name.toLowerCase() === "default-src"
    ) {
      if (!scriptSrc || name.toLowerCase() === "script-src") {
        scriptSrc = rest.join(" ");
      }
    }
  }
  return {
    names,
    tokens: scriptSrc.split(/\s+/).filter(Boolean),
  };
}

/** True when CSP script-src/default-src would allow loading an external script from host. */
export function cspAllowsExternalScriptHost(
  scriptSrcTokens: string[],
  scriptHost: string,
): boolean {
  const host = scriptHost.trim().toLowerCase().replace(/\.$/, "");
  if (!host || scriptSrcTokens.length === 0) return false;
  if (scriptSrcTokens.includes("*") || scriptSrcTokens.includes("https:")) {
    return true;
  }
  if (scriptSrcTokens.includes("'none'")) return false;

  for (const token of scriptSrcTokens) {
    const normalized = token
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!normalized || normalized.startsWith("'")) continue;
    if (normalized === "*") return true;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1); // ".example.com"
      if (host.endsWith(suffix) || host === normalized.slice(2)) return true;
      continue;
    }
    if (normalized.startsWith(".")) {
      if (host.endsWith(normalized) || host === normalized.slice(1)) return true;
      continue;
    }
    if (host === normalized || host.endsWith(`.${normalized}`)) return true;
  }
  return false;
}

function parseCsp(raw: string | undefined): SanitizedEvidence["csp"] {
  if (!raw) {
    return {
      present: false,
      scriptSrcHosts: [],
      blocksInlineScripts: false,
      restrictsThirdPartyScripts: false,
      rawDirectiveNames: [],
    };
  }

  const { names, tokens } = scriptSrcTokensFromCsp(raw);
  const hosts = tokens
    .filter(
      (token) =>
        token.startsWith("http") ||
        token.startsWith("*") ||
        token.startsWith("."),
    )
    .map((token) => token.replace(/^https?:\/\//, "").slice(0, 253))
    .slice(0, 30);
  const blocksInline =
    tokens.includes("'none'") ||
    (tokens.length > 0 && !tokens.includes("'unsafe-inline'"));
  const restrictsThirdParty =
    tokens.includes("'self'") ||
    tokens.includes("'none'") ||
    hosts.length > 0;

  return {
    present: true,
    scriptSrcHosts: uniqueLimited(hosts, 30),
    blocksInlineScripts: blocksInline,
    restrictsThirdPartyScripts: restrictsThirdParty,
    rawDirectiveNames: uniqueLimited(names, 20),
  };
}

function addCandidate(
  map: Map<DetectedPlatform, Candidate>,
  platform: DetectedPlatform,
  score: number,
  reason: string,
) {
  const existing = map.get(platform);
  if (!existing) {
    map.set(platform, { platform, score, reasons: [reason] });
    return;
  }
  existing.score = Math.min(100, existing.score + score);
  if (existing.reasons.length < 6 && !existing.reasons.includes(reason)) {
    existing.reasons.push(reason);
  }
}

export function collectPageSignals(page: PageSignals): {
  evidence: SanitizedEvidence;
  fingerprint: string;
} {
  const finalUrl = new URL(page.finalUrl);
  const metaGenerator = extractMetaGenerator(page.body);
  const scriptSrcs = extractTagAttributes(page.body, "script", "src");
  const linkTags = page.body.match(/<link\b[^>]*>/gi) ?? [];
  const cssHrefs: string[] = [];
  for (const tag of linkTags) {
    const rel = tag.match(/rel=["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? "";
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    if (rel.includes("stylesheet") || href.includes(".css")) {
      cssHrefs.push(href);
    }
  }

  const scriptAssets = uniqueLimited(
    scriptSrcs.map(stripAssetUrl).filter((v): v is NonNullable<typeof v> => Boolean(v)),
    40,
  );
  const stylesheetAssets = uniqueLimited(
    cssHrefs
      .map(stripAssetUrl)
      .filter((v): v is NonNullable<typeof v> => Boolean(v)),
    40,
  );

  const frameworkMarkers: string[] = [];
  const cmsMarkers: string[] = [];
  const htmlLower = page.body.toLowerCase();
  const headerServer = page.headers.server?.toLowerCase() ?? "";
  const poweredBy = page.headers["x-powered-by"]?.toLowerCase() ?? "";
  const generatorLower = metaGenerator?.toLowerCase() ?? "";

  const has = (value: string) => htmlLower.includes(value);

  if (has("/_next/") || has("__next") || has("next/dist")) {
    frameworkMarkers.push("nextjs_asset");
  }
  if (has("data-reactroot") || has("data-reactid") || has("__NEXT_DATA__")) {
    frameworkMarkers.push("react_marker");
  }
  if (has("__NEXT_DATA__")) frameworkMarkers.push("next_data");
  if (has("webpackJsonp") || has("__vite_")) frameworkMarkers.push("bundler_marker");
  if (has("cdn.shopify.com") || has("Shopify.theme") || headerServer.includes("shopify")) {
    cmsMarkers.push("shopify");
  }
  if (
    generatorLower.includes("wordpress") ||
    has("wp-content/") ||
    has("wp-includes/")
  ) {
    cmsMarkers.push("wordpress");
  }
  if (generatorLower.includes("webflow") || has("webflow.js") || has("data-wf-site")) {
    cmsMarkers.push("webflow");
  }
  if (generatorLower.includes("squarespace") || has("squarespace.com") || has("static.squarespace")) {
    cmsMarkers.push("squarespace");
  }
  if (
    generatorLower.includes("wix") ||
    has("static.wixstatic.com") ||
    Boolean(page.headers["x-wix-request-id"])
  ) {
    cmsMarkers.push("wix");
  }
  if (has("framer.com") || has("framerusercontent.com") || generatorLower.includes("framer")) {
    cmsMarkers.push("framer");
  }
  if (has("googletagmanager.com/gtm.js") || has("gtm.start") || has("www.googletagmanager.com")) {
    frameworkMarkers.push("gtm");
  }
  if (poweredBy.includes("next.js") || poweredBy.includes("nextjs")) {
    frameworkMarkers.push("next_powered_by");
  }
  if (page.headers["x-vercel-id"]) frameworkMarkers.push("vercel_header");

  const hasGoogleTagManager = frameworkMarkers.includes("gtm");
  const hasPassoffScript =
    scriptAssets.some(
      (asset) =>
        asset.path.includes("/sdk/v1/passoff.js") ||
        asset.filename === "passoff.js",
    ) ||
    htmlLower.includes("data-passoff-key") ||
    htmlLower.includes("passoff.js");

  const appearsAuthenticated =
    page.headers["www-authenticate"] != null ||
    (has('name="password"') && has("login")) ||
    has("sign in to continue") ||
    has("authentication required");

  const textLength = page.body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").trim().length;
  const appearsClientRendered =
    textLength < 80 &&
    (frameworkMarkers.includes("nextjs_asset") ||
      frameworkMarkers.includes("react_marker") ||
      frameworkMarkers.includes("bundler_marker") ||
      has("<div id=\"root\"") ||
      has("<div id=\"app\"") ||
      has("__NEXT_DATA__"));

  const rawCsp =
    page.headers["content-security-policy"] ??
    page.headers["content-security-policy-report-only"] ??
    extractMetaContentSecurityPolicy(page.body) ??
    undefined;
  const csp = parseCsp(rawCsp);
  const scriptSrcTokens = rawCsp ? scriptSrcTokensFromCsp(rawCsp).tokens : [];
  const passoffScriptHost = page.passoffScriptHost?.trim().toLowerCase() || null;
  const passoffBlockedByCsp = Boolean(
    csp.present &&
      passoffScriptHost &&
      scriptSrcTokens.length > 0 &&
      !cspAllowsExternalScriptHost(scriptSrcTokens, passoffScriptHost),
  );

  const candidates = new Map<DetectedPlatform, Candidate>();
  if (frameworkMarkers.includes("nextjs_asset") || frameworkMarkers.includes("next_data") || frameworkMarkers.includes("next_powered_by")) {
    addCandidate(candidates, "nextjs", 40, "Next.js assets or markers were present.");
  }
  if (frameworkMarkers.includes("react_marker") && !candidates.has("nextjs")) {
    addCandidate(candidates, "react", 25, "React markers were present.");
  }
  if (cmsMarkers.includes("wordpress")) {
    addCandidate(candidates, "wordpress", 40, "WordPress generator or asset paths were present.");
  }
  if (cmsMarkers.includes("shopify")) {
    addCandidate(candidates, "shopify", 40, "Shopify assets or headers were present.");
  }
  if (cmsMarkers.includes("webflow")) {
    addCandidate(candidates, "webflow", 40, "Webflow markers were present.");
  }
  if (cmsMarkers.includes("squarespace")) {
    addCandidate(candidates, "squarespace", 40, "Squarespace markers were present.");
  }
  if (cmsMarkers.includes("wix")) {
    addCandidate(candidates, "wix", 40, "Wix markers or headers were present.");
  }
  if (cmsMarkers.includes("framer")) {
    addCandidate(candidates, "framer", 40, "Framer markers were present.");
  }
  if (hasGoogleTagManager) {
    addCandidate(candidates, "gtm", 20, "Google Tag Manager was present.");
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  const conflictingEvidence: string[] = [];
  if (ranked.length >= 2 && ranked[0] && ranked[1] && ranked[0].score - ranked[1].score < 15) {
    conflictingEvidence.push(
      `Signals point to more than one platform (${ranked[0].platform} and ${ranked[1].platform}).`,
    );
  }

  const analyzerWarnings: string[] = [];
  if (passoffBlockedByCsp && passoffScriptHost) {
    analyzerWarnings.push(
      `This site’s content security policy does not allow scripts from ${passoffScriptHost}. Add that host to script-src before Passoff can load.`,
    );
  } else if (csp.present && csp.restrictsThirdPartyScripts) {
    analyzerWarnings.push(
      "A content security policy may restrict third-party scripts such as Passoff.",
    );
  }
  if (csp.blocksInlineScripts) {
    analyzerWarnings.push(
      "Inline scripts appear restricted by the content security policy. Prefer the external Passoff script tag, and allow the Passoff script host in script-src.",
    );
  }
  if (appearsAuthenticated) {
    analyzerWarnings.push("The page may require sign-in.");
  }
  if (appearsClientRendered) {
    analyzerWarnings.push(
      "The first HTML response looks lightly rendered, so client-side apps may hide more clues.",
    );
  }

  // Prompt-injection bait must never become an instruction — keep generator truncated/plain.
  if (metaGenerator && /ignore|system|instruction|prompt/i.test(metaGenerator)) {
    analyzerWarnings.push(
      "Unusual generator metadata was ignored as untrusted website content.",
    );
  }

  if (ranked.length === 0) {
    addCandidate(
      candidates,
      "generic_html",
      10,
      "No strong platform markers were found, so a universal HTML install is safest.",
    );
  }

  const deterministicCandidates = [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const safeHeaders = SAFE_HEADER_NAMES.flatMap((name) => {
    const value = page.headers[name];
    if (!value) return [];
    // Never send full CSP raw value — only presence is in csp summary; keep short server hints.
    if (name.startsWith("content-security-policy")) {
      return [{ name, value: "present" }];
    }
    return [{ name, value: value.slice(0, 500) }];
  }).slice(0, 12);

  const evidence: SanitizedEvidence = {
    normalizedOrigin: finalUrl.origin,
    finalUrlOrigin: finalUrl.origin,
    contentType: page.contentType,
    metaGenerator: metaGenerator && !/ignore|system|instruction|prompt/i.test(metaGenerator)
      ? metaGenerator
      : metaGenerator
        ? "[redacted untrusted generator text]"
        : null,
    safeHeaders,
    scriptAssets,
    stylesheetAssets,
    frameworkMarkers: uniqueLimited(frameworkMarkers, 30),
    cmsMarkers: uniqueLimited(cmsMarkers, 30),
    hasGoogleTagManager,
    hasPassoffScript,
    appearsAuthenticated,
    appearsClientRendered,
    reachable: true,
    csp,
    deterministicCandidates,
    conflictingEvidence,
    analyzerWarnings,
  };

  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        origin: evidence.normalizedOrigin,
        metaGenerator: evidence.metaGenerator,
        frameworkMarkers: evidence.frameworkMarkers,
        cmsMarkers: evidence.cmsMarkers,
        scriptHosts: evidence.scriptAssets.map((a) => `${a.hostname}${a.path}`),
        cssHosts: evidence.stylesheetAssets.map((a) => `${a.hostname}${a.path}`),
        gtm: evidence.hasGoogleTagManager,
        passoff: evidence.hasPassoffScript,
        csp: evidence.csp,
        candidates: evidence.deterministicCandidates,
      }),
    )
    .digest("hex");

  return { evidence, fingerprint };
}

export function pickDeterministicPlatform(evidence: SanitizedEvidence): {
  platform: DetectedPlatform;
  confidence: "high" | "medium" | "low";
} {
  const top = evidence.deterministicCandidates[0];
  const second = evidence.deterministicCandidates[1];
  if (!top || top.platform === "generic_html" || top.platform === "unknown") {
    return { platform: "generic_html", confidence: "low" };
  }
  if (evidence.conflictingEvidence.length > 0) {
    return { platform: top.platform, confidence: "low" };
  }
  if (top.score >= 40 && (!second || top.score - second.score >= 15)) {
    return { platform: top.platform, confidence: "high" };
  }
  if (top.score >= 20) {
    return { platform: top.platform, confidence: "medium" };
  }
  return { platform: top.platform, confidence: "low" };
}
