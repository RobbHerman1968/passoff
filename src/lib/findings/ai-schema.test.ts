import { describe, expect, it } from "vitest";

import {
  behavioralAiResultSchema,
  FORBIDDEN_AI_INPUT_KEYS,
} from "@/lib/findings/ai-schema";

describe("behavioral AI contract", () => {
  it("requires structured sections", () => {
    const parsed = behavioralAiResultSchema.safeParse({
      observedFacts: ["18 of 142 eligible sessions had repeated clicks."],
      possibleExplanations: ["The control may respond slowly."],
      missingInformation: ["Whether a network request completed."],
      suggestedInvestigationSteps: ["Watch the control on a slow connection."],
      suggestedVerificationSteps: ["Record whether the action completes after a click."],
      confidence: "low",
      limitations: "This is not a proven cause.",
    });
    expect(parsed.success).toBe(true);
  });

  it("lists prohibited input fields", () => {
    expect(FORBIDDEN_AI_INPUT_KEYS).toContain("rawEvents");
    expect(FORBIDDEN_AI_INPUT_KEYS).toContain("ip");
    expect(FORBIDDEN_AI_INPUT_KEYS).toContain("tabSession");
  });
});
