import { NextResponse } from "next/server";

import { buildIssueExport } from "@/lib/issues/export";
import { ISSUE_EXPORT_MAX } from "@/lib/issues/export-format";
import { parseIssueListSearchParams } from "@/lib/issues/schemas";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

export const runtime = "nodejs";

type RouteParams = { projectId: string; reviewId: string };

export async function GET(
  request: Request,
  context: { params: Promise<RouteParams> },
) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { projectId, reviewId } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "md" ? "md" : "csv";
  const includeReplies = url.searchParams.get("replies") === "1";
  const filters = parseIssueListSearchParams(
    Object.fromEntries(url.searchParams.entries()),
  );

  const result = await buildIssueExport(auth.context, {
    projectId,
    reviewId,
    filters,
    format,
    includeReplies,
  });

  if (!result.ok) {
    if (result.error === "too_large") {
      return NextResponse.json(
        {
          ok: false,
          error: "too_large",
          message: `This export includes ${result.count} issues. Narrow the filters to ${ISSUE_EXPORT_MAX} or fewer, then try again.`,
          count: result.count,
          max: ISSUE_EXPORT_MAX,
        },
        { status: 413 },
      );
    }
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
