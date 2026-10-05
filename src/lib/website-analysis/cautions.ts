/**
 * Merge template, model, and analyzer cautions into a short, non-repetitive list.
 * CSP-related items collapse to the single most actionable warning.
 */

import type {
  SanitizedEvidence,
  WebsiteAnalysisResult,
} from "@/lib/website-analysis/schema";

function normalizeCaution(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCspCaution(text: string): boolean {
  return /content security policy|\bcsp\b|script-src|third-party scripts/i.test(
    text,
  );
}

function cspSpecificity(text: string): number {
  if (/does not allow scripts from/i.test(text)) return 4;
  if (/add that host to script-src/i.test(text)) return 4;
  if (/allow the passoff script host/i.test(text)) return 2;
  if (/may restrict|is present and may|third-party script hosts are restricted/i.test(
    text,
  )) {
    return 1;
  }
  return 1;
}

export function mergeInstallationCautions(
  ...groups: Array<readonly string[] | undefined>
): string[] {
  const items = groups
    .flatMap((group) => group ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  const nonCsp: string[] = [];
  const seen = new Set<string>();
  let bestCsp: string | null = null;
  let bestScore = -1;

  for (const item of items) {
    if (isCspCaution(item)) {
      const score = cspSpecificity(item);
      if (
        score > bestScore ||
        (score === bestScore &&
          bestCsp !== null &&
          item.length > bestCsp.length)
      ) {
        bestCsp = item;
        bestScore = score;
      }
      continue;
    }

    const key = normalizeCaution(item);
    if (seen.has(key)) continue;
    seen.add(key);
    nonCsp.push(item);
  }

  // Put the actionable CSP warning first when we have one.
  const merged = bestCsp ? [bestCsp, ...nonCsp] : nonCsp;
  return merged.slice(0, 8);
}

function hostFromCspWarning(text: string): string | null {
  const match = text.match(/does not allow scripts from ([^\s.]+(?:\.[^\s.]+)*)/i);
  return match?.[1] ?? null;
}

/**
 * Ensure CSP blockers become an explicit install step and a clear caution,
 * not only a buried note under “Things to watch for”.
 */
export function applyCspGuidanceToResult(
  result: WebsiteAnalysisResult,
  evidence: SanitizedEvidence,
): WebsiteAnalysisResult {
  const cspWarning =
    evidence.analyzerWarnings.find((warning) => isCspCaution(warning)) ??
    result.cautions.find((caution) => isCspCaution(caution)) ??
    null;

  const needsCspUpdate =
    Boolean(cspWarning) ||
    (evidence.csp.present && evidence.csp.restrictsThirdPartyScripts);

  if (!needsCspUpdate) {
    return {
      ...result,
      cautions: mergeInstallationCautions(result.cautions),
    };
  }

  const host =
    (cspWarning ? hostFromCspWarning(cspWarning) : null) ??
    "the Passoff script host";

  const cspStep =
    host === "the Passoff script host"
      ? "Update your website’s content security policy (CSP): add the Passoff script host to the script-src directive so the browser can load Passoff."
      : `Update your website’s content security policy (CSP): add ${host} to the script-src directive so the browser can load Passoff.`;

  const caution =
    cspWarning ??
    `A content security policy may block Passoff until ${host} is allowed in script-src.`;

  const steps = result.steps.some((step) => isCspCaution(step))
    ? result.steps
    : [cspStep, ...result.steps].slice(0, 12);

  return {
    ...result,
    steps,
    cautions: mergeInstallationCautions([caution], result.cautions),
  };
}
