import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { collectPageSignals } from "@/lib/website-analysis/detect";
import { FIXTURE_HTML } from "@/lib/website-analysis/fixtures";
import { resetOpenAIClientForTests } from "@/lib/openai/client";

const parseMock = vi.fn();

vi.mock("@/lib/openai/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/openai/client")>(
    "@/lib/openai/client",
  );
  return {
    ...actual,
    getOpenAIClient: () => ({
      responses: {
        parse: (...args: unknown[]) => parseMock(...args),
      },
    }),
  };
});

import { analyzeEvidenceWithOpenAI } from "@/lib/website-analysis/openai-analyze";

function evidenceFrom(html: string) {
  return collectPageSignals({
    finalUrl: "https://example.com/",
    contentType: "text/html",
    headers: { "content-type": "text/html" },
    body: html,
  }).evidence;
}

describe("analyzeEvidenceWithOpenAI", () => {
  beforeEach(() => {
    parseMock.mockReset();
    resetOpenAIClientForTests();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "test-model";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    resetOpenAIClientForTests();
  });

  it("returns validated structured output", async () => {
    parseMock.mockResolvedValue({
      status: "completed",
      error: null,
      output_parsed: {
        detectedPlatform: "nextjs",
        confidence: "high",
        evidence: ["Next.js markers were present."],
        recommendedMethod: "nextjs_script",
        steps: ["Open the root layout."],
        placement: "Root layout",
        verificationSteps: ["Check installation."],
        cautions: [],
        requiresDeveloper: true,
        alternateMethods: ["generic_html_body"],
        existingInstallationDetected: false,
        needsClarification: false,
        clarificationQuestion: null,
      },
    });

    const result = await analyzeEvidenceWithOpenAI(
      evidenceFrom(FIXTURE_HTML.nextjs),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.modelId).toBe("test-model");
      expect(result.result.detectedPlatform).toBe("nextjs");
      expect(result.result.recommendedMethod).toBe("nextjs_script");
      expect(result.result.steps[0]).toMatch(/root layout/i);
    }
    expect(parseMock).toHaveBeenCalledTimes(1);
  });

  it("falls back when the model returns invalid output", async () => {
    parseMock.mockResolvedValue({
      status: "completed",
      error: null,
      output_parsed: {
        detectedPlatform: "not-a-platform",
        confidence: "high",
      },
    });

    const result = await analyzeEvidenceWithOpenAI(
      evidenceFrom(FIXTURE_HTML.genericHtml),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_output");
  });

  it("falls back on OpenAI timeout", async () => {
    parseMock.mockRejectedValue(
      Object.assign(new Error("timeout"), { code: "timeout" }),
    );
    const result = await analyzeEvidenceWithOpenAI(
      evidenceFrom(FIXTURE_HTML.wordpress),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("falls back on OpenAI rate limits", async () => {
    parseMock.mockRejectedValue(
      Object.assign(new Error("rate limited"), { status: 429 }),
    );
    const result = await analyzeEvidenceWithOpenAI(
      evidenceFrom(FIXTURE_HTML.wordpress),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("rate_limited");
  });

  it("reports not_configured without calling the client", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await analyzeEvidenceWithOpenAI(
      evidenceFrom(FIXTURE_HTML.genericHtml),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_configured");
    expect(parseMock).not.toHaveBeenCalled();
  });
});
