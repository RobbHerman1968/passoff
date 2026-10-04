import type { WebsiteAnalysisResult } from "@/lib/website-analysis/schema";
import { PLATFORM_LABELS } from "@/lib/website-analysis/platforms";
import { describeMethod } from "@/lib/website-analysis/templates";

export function confidenceLabel(
  confidence: WebsiteAnalysisResult["confidence"],
): string {
  switch (confidence) {
    case "high":
      return "Strong match";
    case "medium":
      return "Likely match";
    case "low":
      return "Uncertain match";
  }
}

export function analysisHeadline(result: WebsiteAnalysisResult): string {
  if (result.detectedPlatform === "unknown" || result.detectedPlatform === "generic_html") {
    return "This looks like a custom site, so we recommend the universal installation.";
  }
  if (result.confidence === "low") {
    return `We found some signs of ${PLATFORM_LABELS[result.detectedPlatform]}, but this may not be exact.`;
  }
  return `We found signs that this site uses ${PLATFORM_LABELS[result.detectedPlatform]}.`;
}

export function recommendedMethodLabel(result: WebsiteAnalysisResult): string {
  return describeMethod(result.recommendedMethod);
}
