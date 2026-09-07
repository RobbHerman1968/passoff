import type { FigmaImportProgress, FigmaImportResult, FigmaImportStreamEvent, FigmaRateLimitDetails } from "./types";

export class FigmaImportClientError extends Error {
  constructor(message: string, public readonly status: number, public readonly rateLimit: FigmaRateLimitDetails | null) {
    super(message);
    this.name = "FigmaImportClientError";
  }
}

export async function streamFigmaImport(
  url: string,
  onProgress: (progress: FigmaImportProgress) => void,
  options?: { projectKey?: string },
): Promise<FigmaImportResult> {
  const response = await fetch("/api/integrations/figma/import/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, projectKey: options?.projectKey }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new FigmaImportClientError(payload?.error || "Unable to start the Figma import.", response.status, null);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: FigmaImportResult | null = null;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as FigmaImportStreamEvent;
      if (event.type === "progress") onProgress(event);
      if (event.type === "complete") result = event.result;
      if (event.type === "error") throw new FigmaImportClientError(event.error, event.status, event.rateLimit);
    }
    if (done) break;
  }
  if (!result) throw new FigmaImportClientError("The import ended before Figma returned a file.", 500, null);
  return result;
}
