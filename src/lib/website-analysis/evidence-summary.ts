import type {
  EvidenceSummary,
  SanitizedEvidence,
} from "@/lib/website-analysis/schema";

export function toEvidenceSummary(evidence: SanitizedEvidence): EvidenceSummary {
  return {
    normalizedOrigin: evidence.normalizedOrigin,
    finalUrlOrigin: evidence.finalUrlOrigin,
    metaGenerator: evidence.metaGenerator,
    hasGoogleTagManager: evidence.hasGoogleTagManager,
    hasPassoffScript: evidence.hasPassoffScript,
    appearsAuthenticated: evidence.appearsAuthenticated,
    appearsClientRendered: evidence.appearsClientRendered,
    reachable: evidence.reachable,
    cspPresent: evidence.csp.present,
    blocksInlineScripts: evidence.csp.blocksInlineScripts,
    restrictsThirdPartyScripts: evidence.csp.restrictsThirdPartyScripts,
    topCandidates: evidence.deterministicCandidates
      .map((candidate) => candidate.platform)
      .slice(0, 5),
    warnings: evidence.analyzerWarnings.slice(0, 12),
  };
}
