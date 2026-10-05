import "server-only";

import { zodTextFormat } from "openai/helpers/zod";

import { getOpenAIClient } from "@/lib/openai/client";
import { getOpenAIModel, isOpenAIConfigured } from "@/lib/openai/config";
import {
  buildAnalysisUserPrompt,
  WEBSITE_ANALYSIS_SYSTEM_PROMPT,
} from "@/lib/website-analysis/prompt";
import {
  websiteAnalysisResultSchema,
  type SanitizedEvidence,
  type WebsiteAnalysisResult,
} from "@/lib/website-analysis/schema";
import { applyCspGuidanceToResult } from "@/lib/website-analysis/cautions";
import {
  buildResultFromTemplate,
  getInstallationTemplate,
} from "@/lib/website-analysis/templates";
import {
  platformToDefaultMethod,
  type DetectedPlatform,
  type RecommendedMethod,
  isDetectedPlatform,
} from "@/lib/website-analysis/platforms";
import { pickDeterministicPlatform } from "@/lib/website-analysis/detect";

export type OpenAIAnalyzeFailure =
  | "not_configured"
  | "timeout"
  | "rate_limited"
  | "invalid_output"
  | "refused"
  | "provider_error";

export type OpenAIAnalyzeResult =
  | {
      ok: true;
      result: WebsiteAnalysisResult;
      modelId: string;
    }
  | {
      ok: false;
      reason: OpenAIAnalyzeFailure;
      message: string;
    };

const OPENAI_REQUEST_TIMEOUT_MS = 20_000;

function adaptModelResult(
  parsed: WebsiteAnalysisResult,
  evidence: SanitizedEvidence,
): WebsiteAnalysisResult {
  const deterministic = pickDeterministicPlatform(evidence);
  let platform: DetectedPlatform = parsed.detectedPlatform;
  let confidence = parsed.confidence;

  // Strong deterministic evidence wins over a conflicting model guess.
  if (
    deterministic.confidence === "high" &&
    deterministic.platform !== "generic_html" &&
    deterministic.platform !== "unknown" &&
    platform !== deterministic.platform
  ) {
    platform = deterministic.platform;
    confidence = deterministic.confidence;
  }

  if (!isDetectedPlatform(platform)) {
    platform = deterministic.platform;
  }

  const method: RecommendedMethod =
    parsed.recommendedMethod || platformToDefaultMethod(platform);
  const template = getInstallationTemplate(method);

  // Keep customer-facing steps grounded in reviewed templates.
  // The model may refine evidence/cautions/clarification only.
  const grounded = applyCspGuidanceToResult(
    buildResultFromTemplate({
      platform,
      method,
      confidence,
      evidence: parsed.evidence.length
        ? parsed.evidence
        : deterministic.platform === platform
          ? evidence.deterministicCandidates[0]?.reasons ?? [
              "Limited platform signals were available.",
            ]
          : ["Limited platform signals were available."],
      cautions: [
        ...parsed.cautions,
        ...evidence.analyzerWarnings.filter((warning) =>
          /content security policy|sign-in/i.test(warning),
        ),
      ],
      existingInstallationDetected:
        parsed.existingInstallationDetected || evidence.hasPassoffScript,
      needsClarification:
        parsed.needsClarification ||
        confidence === "low" ||
        evidence.conflictingEvidence.length > 0,
      clarificationQuestion: parsed.clarificationQuestion,
      requiresDeveloper: parsed.requiresDeveloper || template.requiresDeveloper,
    }),
    evidence,
  );

  return websiteAnalysisResultSchema.parse(grounded);
}

export async function analyzeEvidenceWithOpenAI(
  evidence: SanitizedEvidence,
): Promise<OpenAIAnalyzeResult> {
  if (!isOpenAIConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message:
        "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
    };
  }

  const modelId = getOpenAIModel();
  const client = getOpenAIClient();

  try {
    const response = await Promise.race([
      client.responses.parse({
        model: modelId,
        temperature: 0,
        max_output_tokens: 1_200,
        text: {
          format: zodTextFormat(
            websiteAnalysisResultSchema,
            "website_installation_analysis",
          ),
        },
        input: [
          {
            role: "system",
            content: WEBSITE_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: buildAnalysisUserPrompt(evidence),
          },
        ],
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(Object.assign(new Error("timeout"), { code: "timeout" }));
        }, OPENAI_REQUEST_TIMEOUT_MS);
      }),
    ]);

    if (response.status === "failed" || response.error) {
      return {
        ok: false,
        reason: "provider_error",
        message:
          "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
      };
    }

    const parsed = response.output_parsed;
    if (!parsed) {
      const refused = response.output?.some(
        (item) => item.type === "message" && item.role === "assistant",
      );
      return {
        ok: false,
        reason: refused ? "refused" : "invalid_output",
        message:
          "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
      };
    }

    const validated = websiteAnalysisResultSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ok: false,
        reason: "invalid_output",
        message:
          "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
      };
    }

    return {
      ok: true,
      result: adaptModelResult(validated.data, evidence),
      modelId,
    };
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status?: number }).status)
        : undefined;
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : "";

    if (code === "timeout" || code === "ETIMEDOUT") {
      return {
        ok: false,
        reason: "timeout",
        message:
          "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
      };
    }
    if (status === 429) {
      return {
        ok: false,
        reason: "rate_limited",
        message:
          "Tailored guidance is temporarily unavailable because the assistant is busy. Showing the closest reviewed installation steps instead.",
      };
    }
    return {
      ok: false,
      reason: "provider_error",
      message:
        "Tailored guidance is temporarily unavailable. Showing the closest reviewed installation steps instead.",
    };
  }
}
