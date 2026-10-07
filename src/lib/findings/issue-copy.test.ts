import { describe, expect, it } from "vitest";

import { suggestedIssueBody } from "@/lib/findings/copy";

describe("issue creation copy", () => {
  it("requires explicit confirmation copy and does not claim a proven defect", () => {
    const body = suggestedIssueBody({
      title: "Visitors repeatedly clicked the checkout button.",
      explanation: "18 of 142 eligible mobile sessions contained repeated clicks.",
      uncertainty:
        "Repeated clicks can indicate a slow or unclear response, but they do not prove that the control is broken.",
      environmentName: "Production",
      route: "/checkout",
      version: "v18",
      viewport: "mobile",
      includeInvestigationSteps: true,
      investigationSteps: ["Watch the control on a slow connection."],
    });
    expect(body).toContain("not a confirmed defect");
    expect(body).toContain("Watch the control on a slow connection.");
    expect(body).not.toMatch(/verified|approved|closed/i);
  });
});
