export type VideoUploadStatus<TVideo> =
  | { uploadSessionId: string; status: "pending" }
  | { uploadSessionId: string; status: "completed"; video: TVideo }
  | { uploadSessionId: string; status: "failed"; error: string };

export async function pollVideoUploadSession<TVideo>(input: {
  projectId: string;
  uploadSessionId: string;
  attempts?: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const wait = input.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const attempts = input.attempts ?? 40;
  const intervalMs = input.intervalMs ?? 500;
  const url = `/api/client-projects/${encodeURIComponent(input.projectId)}/videos/uploads/${encodeURIComponent(input.uploadSessionId)}`;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await wait(intervalMs);
    const response = await fetchImpl(url, { cache: "no-store" });
    const payload = await response.json() as VideoUploadStatus<TVideo> & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "Unable to check video completion.");
    }
    if (payload.uploadSessionId !== input.uploadSessionId) {
      throw new Error("Video upload status did not match the requested session.");
    }
    if (payload.status === "completed") return payload.video;
    if (payload.status === "failed") {
      throw new Error(payload.error || "Video completion failed.");
    }
  }
  throw new Error("Video upload timed out before server verification completed.");
}
