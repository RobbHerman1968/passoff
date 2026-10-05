import { describe, expect, it } from "vitest";

import {
  csvCell,
  exportFilename,
  protectSpreadsheetValue,
  toCsv,
  toMarkdown,
  type IssueExportRow,
} from "@/lib/issues/export-format";

function row(overrides: Partial<IssueExportRow> = {}): IssueExportRow {
  return {
    number: 24,
    title: "Contrast",
    body: "The button is too faint.",
    status: "open",
    closureReason: null,
    priority: "high",
    assigneeDisplayName: "Maya",
    reporterDisplayName: "Jamie",
    pageTitle: "Pricing",
    pageUrl: "https://example.com/pricing",
    route: "/pricing",
    environmentName: "Production",
    versionLabel: "October 4",
    createdAt: new Date("2026-10-04T12:00:00.000Z"),
    updatedAt: new Date("2026-10-04T13:00:00.000Z"),
    publicReplyCount: 1,
    publicReplies: [
      { author: "Maya", body: "Working on it.", createdAt: new Date("2026-10-04T12:30:00.000Z") },
    ],
    latestVerificationOutcome: null,
    latestVerificationAt: null,
    issueHref: "https://app.example.com/projects/p/reviews/r/issues/24",
    ...overrides,
  };
}

describe("issue export format", () => {
  it("quotes commas, line breaks, and quotation marks", () => {
    expect(csvCell('Say "hello", then retry')).toBe('"Say ""hello"", then retry"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("protects spreadsheet formula injection", () => {
    expect(protectSpreadsheetValue("=CMD()")).toBe("'=CMD()");
    expect(protectSpreadsheetValue("+1")).toBe("'+1");
    expect(protectSpreadsheetValue("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("builds a utf-8 csv with stable headings and no private fields", () => {
    const csv = toCsv([row({ body: "=HACK()" })]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Issue number");
    expect(csv).toContain("Passoff link");
    expect(csv).toContain("'=HACK()");
    expect(csv).not.toContain("cssSelector");
    expect(csv).not.toContain("storage");
  });

  it("builds markdown with public replies only when requested", () => {
    const meta = {
      reviewName: "Homepage review",
      environmentName: "Production",
      versionLabel: "October 4",
      exportedAt: new Date("2026-10-04T14:00:00.000Z"),
      filters: { q: "", show: "active" as const, p: 1 },
      includeReplies: true,
    };
    const markdown = toMarkdown(meta, [row()]);
    expect(markdown).toContain("# Homepage review");
    expect(markdown).toContain("## Issue #24");
    expect(markdown).toContain("Working on it.");
    expect(toMarkdown({ ...meta, includeReplies: false }, [row()])).not.toContain(
      "Working on it.",
    );
  });

  it("creates a safe filename from the review name and date", () => {
    expect(exportFilename("Homepage Review!", "csv", new Date("2026-10-04"))).toBe(
      "passoff-homepage-review-issues-2026-10-04.csv",
    );
  });
});
