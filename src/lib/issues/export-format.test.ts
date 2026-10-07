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
    labels: [],
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
    latestBrowserCheckSummary: "",
    behavioralEvidenceSummary: "",
    videoEvidenceSummary: "",
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

  it("includes label names in csv and markdown, protecting spreadsheet formulas", () => {
    const csv = toCsv([row({ labels: ["Copy", "Layout"] })]);
    expect(csv).toContain("Labels");
    expect(csv).toContain("Copy; Layout");
    expect(toCsv([row({ labels: ["=SUM(A1)"] })])).toContain("'=SUM(A1)");

    const meta = {
      reviewName: "Homepage review",
      environmentName: "Production",
      versionLabel: "October 4",
      exportedAt: new Date("2026-10-04T14:00:00.000Z"),
      filters: { q: "", show: "active" as const, p: 1 },
      includeReplies: false,
    };
    expect(toMarkdown(meta, [row({ labels: ["Copy", "Layout"] })])).toContain(
      "- Labels: Copy, Layout",
    );
    expect(toMarkdown(meta, [row()])).not.toContain("- Labels:");
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
    const markdown = toMarkdown(meta, [
      row({ latestBrowserCheckSummary: "Browser check failed on /pricing at 1440 × 900." }),
    ]);
    expect(markdown).toContain("# Homepage review");
    expect(markdown).toContain("## Issue #24");
    expect(markdown).toContain("Working on it.");
    expect(markdown).toContain("Latest browser check: Browser check failed on /pricing at 1440 × 900.");
    expect(markdown).not.toContain("cssSelector");
    expect(toMarkdown({ ...meta, includeReplies: false }, [row()])).not.toContain(
      "Working on it.",
    );
  });

  it("adds the review approval status to csv rows and the markdown header", () => {
    const csv = toCsv([row({ approvalStatus: "Approved for October 4" })]);
    expect(csv).toContain("Review approval");
    expect(csv).toContain("Approved for October 4");

    const meta = {
      reviewName: "Homepage review",
      environmentName: "Production",
      versionLabel: "October 5",
      exportedAt: new Date("2026-10-05T14:00:00.000Z"),
      filters: { q: "", show: "active" as const, p: 1 },
      includeReplies: false,
      approval: {
        statusLabel: "Approved for October 4",
        decidedBy: "Jamie Client",
        decidedAt: new Date("2026-10-04T15:00:00.000Z"),
        note: "Ship it",
        historical: true,
      },
    };
    const markdown = toMarkdown(meta, [row()]);
    expect(markdown).toContain("- Approval: Approved for October 4");
    expect(markdown).toContain("- Decided by: Jamie Client (2026-10-04T15:00:00.000Z)");
    expect(markdown).toContain("- Approval note: Ship it");
    expect(markdown).toContain("covers an earlier version, not October 5");
  });

  it("keeps exports working when no approval information exists", () => {
    const meta = {
      reviewName: "Homepage review",
      environmentName: "Production",
      versionLabel: "October 4",
      exportedAt: new Date("2026-10-04T14:00:00.000Z"),
      filters: { q: "", show: "active" as const, p: 1 },
      includeReplies: false,
    };
    expect(toMarkdown(meta, [row()])).not.toContain("- Approval:");
    expect(toMarkdown({ ...meta, approval: null }, [row()])).not.toContain("- Approval:");
  });

  it("creates a safe filename from the review name and date", () => {
    expect(exportFilename("Homepage Review!", "csv", new Date("2026-10-04"))).toBe(
      "passoff-homepage-review-issues-2026-10-04.csv",
    );
  });
});
