import { pickDeterministicPlatform } from "@/lib/website-analysis/detect";
import type { DetectedPlatform } from "@/lib/website-analysis/platforms";
import {
  platformToDefaultMethod,
} from "@/lib/website-analysis/platforms";
import type {
  SanitizedEvidence,
  WebsiteAnalysisResult,
} from "@/lib/website-analysis/schema";
import {
  buildResultFromTemplate,
  describePlatformFinding,
} from "@/lib/website-analysis/templates";

export function buildDeterministicAnalysisResult(
  evidence: SanitizedEvidence,
  options?: {
    manualPlatform?: DetectedPlatform;
    tailoredUnavailable?: boolean;
  },
): WebsiteAnalysisResult {
  if (options?.manualPlatform) {
    return buildResultFromTemplate({
      platform: options.manualPlatform,
      method: platformToDefaultMethod(options.manualPlatform),
      confidence: "medium",
      evidence: [
        `You chose ${options.manualPlatform.replaceAll("_", " ")} as the platform.`,
      ],
      existingInstallationDetected: evidence.hasPassoffScript,
      needsClarification: false,
      clarificationQuestion: null,
      cautions: evidence.analyzerWarnings.filter((warning) =>
        /content security policy/i.test(warning),
      ),
    });
  }

  const picked = pickDeterministicPlatform(evidence);
  const evidenceLines = [
    describePlatformFinding(picked.platform, picked.confidence),
    ...(evidence.deterministicCandidates[0]?.reasons ?? []),
    ...evidence.conflictingEvidence,
  ].slice(0, 8);

  const cautions = [
    ...(options?.tailoredUnavailable
      ? [
          "Tailored guidance is temporarily unavailable, so these are the closest reviewed installation steps.",
        ]
      : []),
    ...evidence.analyzerWarnings.filter((warning) =>
      /content security policy|sign-in/i.test(warning),
    ),
  ];

  return buildResultFromTemplate({
    platform: picked.platform,
    method: platformToDefaultMethod(picked.platform),
    confidence: picked.confidence,
    evidence: evidenceLines,
    existingInstallationDetected: evidence.hasPassoffScript,
    needsClarification:
      picked.confidence === "low" || evidence.conflictingEvidence.length > 0,
    clarificationQuestion:
      picked.confidence === "low" || evidence.conflictingEvidence.length > 0
        ? "Which platform do you use to manage this website?"
        : null,
    cautions,
  });
}

export function buildUnreachableAnalysisResult(input: {
  message: string;
  appearsAuthenticated?: boolean;
}): WebsiteAnalysisResult {
  return buildResultFromTemplate({
    platform: "unknown",
    method: "manual_choice",
    confidence: "low",
    evidence: [
      input.appearsAuthenticated
        ? "We couldn’t inspect this site because it requires sign-in."
        : input.message,
    ],
    needsClarification: true,
    clarificationQuestion: "Which platform do you use to manage this website?",
    cautions: [
      "Do not weaken your website’s security settings just to install Passoff.",
      "You can still copy the Passoff install code and place it using your platform’s usual custom-code tools.",
    ],
    existingInstallationDetected: false,
  });
}
