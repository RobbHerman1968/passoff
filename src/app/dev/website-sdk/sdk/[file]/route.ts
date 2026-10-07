import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ALLOWED = new Map([
  ["passoff-sdk.js", "text/javascript; charset=utf-8"],
  ["passoff-sdk-review.js", "text/javascript; charset=utf-8"],
  ["passoff-sdk-screenshot.js", "text/javascript; charset=utf-8"],
  ["passoff-sdk-heatmap.js", "text/javascript; charset=utf-8"],
  ["passoff-sdk-analytics.js", "text/javascript; charset=utf-8"],
  ["passoff-sdk-verification.js", "text/javascript; charset=utf-8"],
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { file } = await context.params;
  const contentType = ALLOWED.get(file);
  if (!contentType) {
    notFound();
  }

  try {
    const source = await readFile(
      path.join(process.cwd(), "packages/website-sdk/dist", file),
    );
    return new Response(source, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("SDK artifact missing. Run npm run sdk:build.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
