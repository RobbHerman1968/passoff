import { sdkJsonResponse, sdkPreflightResponse } from "@/lib/sdk/cors";
import { listHeatmapIssuesForPage } from "@/lib/heatmap/service";
import { ISSUE_PRIORITIES, type IssuePriority } from "@/lib/issues/statuses";
import { normalizePageUrl } from "@/lib/sdk/page-url";
import {
  resolveSdkSession,
  sdkSessionErrorMessage,
} from "@/lib/sdk/session";

export const runtime = "nodejs";

const METHODS = "GET, OPTIONS";

export async function OPTIONS(request: Request) {
  return sdkPreflightResponse(request, METHODS);
}

export async function GET(request: Request) {
  const sessionLookup = await resolveSdkSession(request);
  if (!sessionLookup.ok) {
    return sdkJsonResponse(
      {
        ok: false,
        error: sessionLookup.reason,
        message: sdkSessionErrorMessage(sessionLookup.reason),
      },
      sessionLookup.status,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const url = new URL(request.url);
  const pageUrl = normalizePageUrl(url.searchParams.get("pageUrl"));
  if (!pageUrl) {
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t tell which page to load.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  const showRaw = url.searchParams.get("show");
  const show =
    showRaw === "verified" || showRaw === "closed" || showRaw === "all"
      ? showRaw
      : "active";
  const priorityRaw = url.searchParams.get("priority");
  const priority = ISSUE_PRIORITIES.includes(priorityRaw as IssuePriority)
    ? (priorityRaw as IssuePriority)
    : undefined;
  const weighting =
    url.searchParams.get("weighting") === "priority" ? "priority" : "equal";
  const version = url.searchParams.get("version")?.trim() || undefined;

  const listed = await listHeatmapIssuesForPage(sessionLookup.session, pageUrl, {
    show,
    priority,
    version,
  });
  if (!listed.ok) {
    if (listed.error === "origin") {
      return sdkJsonResponse(
        {
          ok: false,
          error: "origin",
          message: sdkSessionErrorMessage("origin"),
        },
        403,
        sessionLookup.corsOrigin,
        METHODS,
      );
    }
    return sdkJsonResponse(
      {
        ok: false,
        error: "validation",
        message: "Passoff couldn’t tell which page to load.",
      },
      400,
      sessionLookup.corsOrigin,
      METHODS,
    );
  }

  return sdkJsonResponse(
    {
      ok: true,
      issues: listed.issues,
      weighting,
      pageRoute: listed.meta.pageRoute,
      environmentName: listed.meta.environmentName,
      versionLabel: listed.meta.versionLabel,
      explanation:
        "This map shows where review issues are concentrated. It does not track website visitors or their behavior.",
    },
    200,
    sessionLookup.corsOrigin,
    METHODS,
  );
}
