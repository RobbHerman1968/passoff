"use client";

import { put } from "@vercel/blob/client";
import { Film, History, LoaderCircle, MessageSquarePlus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { pollVideoUploadSession } from "@/lib/projects/video-upload-client";
import { formatStorageBytes } from "@/lib/rooms/entitlements-format";

type VideoSummary = {
  designId: string;
  designName: string;
  designVersionId: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: "video/mp4" | "video/webm";
  byteSize: number;
  durationMs: number;
  width: number | null;
  height: number | null;
  isCurrent: boolean;
  isReferenced?: boolean;
  canDelete?: boolean;
};

type Explanation = {
  id: string;
  videoTimeMs: number;
  category: string;
  title: string;
  body: string;
  status: "draft" | "published";
  canEdit: boolean;
  canMoveToDraft: boolean;
};

function timestamp(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function videoMetadata(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("This browser could not read the video metadata."));
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error("The video duration could not be determined.");
    }
    return {
      durationMs: Math.round(video.duration * 1000),
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VideoDesignsPanel({
  projectId,
  roomId,
}: {
  projectId: string;
  roomId?: string | null;
}) {
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selected, setSelected] = useState<VideoSummary | null>(null);
  const [history, setHistory] = useState<VideoSummary[]>([]);
  const [explanations, setExplanations] = useState<Explanation[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newVersionFor, setNewVersionFor] = useState<string | null>(null);
  const [explainOpen, setExplainOpen] = useState(false);
  const [category, setCategory] = useState("intent");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [explainTime, setExplainTime] = useState(0);
  const [editingExplanationId, setEditingExplanationId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    videoTimeMs: 0,
    category: "",
    title: "",
    body: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/client-projects/${projectId}/videos`, { cache: "no-store" });
    const payload = await response.json() as { videos?: VideoSummary[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load project videos.");
    setVideos(payload.videos ?? []);
    setSelected((current) => {
      if (current) return payload.videos?.find((video) => video.designId === current.designId) ?? null;
      return payload.videos?.[0] ?? null;
    });
  }, [projectId]);

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load videos."));
  }, [load]);

  const loadHistory = useCallback(async (video: VideoSummary) => {
    const response = await fetch(
      `/api/client-projects/${projectId}/videos?designId=${encodeURIComponent(video.designId)}`,
      { cache: "no-store" },
    );
    const payload = await response.json() as { videos?: VideoSummary[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load video history.");
    setHistory(payload.videos ?? []);
  }, [projectId]);

  const loadExplanations = useCallback(async (video: VideoSummary) => {
    const query = new URLSearchParams({
      designId: video.designId,
      designVersionId: video.designVersionId,
    });
    const response = await fetch(`/api/client-projects/${projectId}/videos/explanations?${query}`, {
      cache: "no-store",
    });
    const payload = await response.json() as { explanations?: Explanation[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load explanations.");
    setExplanations(payload.explanations ?? []);
  }, [projectId]);

  useEffect(() => {
    if (!selected) {
      setHistory([]);
      setExplanations([]);
      setEditingExplanationId(null);
      return;
    }
    Promise.all([loadHistory(selected), loadExplanations(selected)])
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load video."));
  }, [selected, loadHistory, loadExplanations]);

  async function uploadVideo(file: File) {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      if (file.type !== "video/mp4" && file.type !== "video/webm") {
        throw new Error("Choose an MP4 or WebM video. MOV playback is not supported.");
      }
      const [checksum, metadata] = await Promise.all([sha256(file), videoMetadata(file)]);
      const requestBody = {
        action: "prepare",
        designId: newVersionFor,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        checksum,
        ...metadata,
      };
      const prepare = await fetch(`/api/client-projects/${projectId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const prepared = await prepare.json() as {
        uploadSessionId?: string;
        pathname?: string;
        clientToken?: string;
        fallback?: string;
        error?: string;
      };
      if (prepare.status === 501 && prepared.fallback === "multipart") {
        const form = new FormData();
        form.set("video", file);
        form.set("checksum", checksum);
        form.set("durationMs", String(metadata.durationMs));
        if (metadata.width) form.set("width", String(metadata.width));
        if (metadata.height) form.set("height", String(metadata.height));
        if (newVersionFor) form.set("designId", newVersionFor);
        const response = await fetch(`/api/client-projects/${projectId}/videos`, {
          method: "POST",
          body: form,
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Video upload failed.");
        setProgress(100);
      } else {
        if (!prepare.ok || !prepared.uploadSessionId || !prepared.pathname || !prepared.clientToken) {
          throw new Error(prepared.error || "Unable to authorize the video upload.");
        }
        await put(prepared.pathname, file, {
          access: "private",
          token: prepared.clientToken,
          contentType: file.type,
          multipart: file.size > 10 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => setProgress(Math.min(99, Math.round(percentage))),
        });
        await pollVideoUploadSession<VideoSummary>({
          projectId,
          uploadSessionId: prepared.uploadSessionId,
        });
        setProgress(100);
      }
      setNewVersionFor(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(null), 800);
    }
  }

  async function pinToRoom(video: VideoSummary) {
    if (!roomId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${roomId}/design-versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: video.designId,
          designVersionId: video.designVersionId,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to add this video to the room.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add video.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteVersion(video: VideoSummary) {
    setBusy(true);
    try {
      const query = new URLSearchParams({
        designId: video.designId,
        designVersionId: video.designVersionId,
      });
      const response = await fetch(`/api/client-projects/${projectId}/videos?${query}`, {
        method: "DELETE",
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to delete video version.");
      if (selected) await loadHistory(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete video version.");
    } finally {
      setBusy(false);
    }
  }

  async function saveExplanation() {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/client-projects/${projectId}/videos/explanations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: selected.designId,
          designVersionId: selected.designVersionId,
          videoTimeMs: explainTime,
          category,
          title,
          body,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to save explanation.");
      setExplainOpen(false);
      setTitle("");
      setBody("");
      await loadExplanations(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function publishExplanation(id: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/client-projects/${projectId}/videos/explanations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanationId: id, publish: true }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to publish explanation.");
      await loadExplanations(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to publish explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function moveExplanationToDraft(id: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/client-projects/${projectId}/videos/explanations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ explanationId: id, status: "draft" }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to move explanation to draft.");
      await loadExplanations(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to move explanation to draft.");
    } finally {
      setBusy(false);
    }
  }

  function beginExplanationEdit(note: Explanation) {
    if (!note.canEdit || note.status !== "draft") return;
    setEditDraft({
      videoTimeMs: note.videoTimeMs,
      category: note.category,
      title: note.title,
      body: note.body,
    });
    setEditingExplanationId(note.id);
    setError(null);
  }

  async function saveExplanationEdits() {
    if (!selected || !editingExplanationId) return;
    if (!Number.isSafeInteger(editDraft.videoTimeMs)
      || editDraft.videoTimeMs < 0
      || editDraft.videoTimeMs > selected.durationMs) {
      setError("Explanation timestamp is outside the video duration.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/client-projects/${projectId}/videos/explanations`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          explanationId: editingExplanationId,
          videoTimeMs: editDraft.videoTimeMs,
          category: editDraft.category,
          title: editDraft.title,
          body: editDraft.body,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update explanation.");
      await loadExplanations(selected);
      setEditingExplanationId(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyExplanations(source: VideoSummary) {
    if (!selected || source.designVersionId === selected.designVersionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/client-projects/${projectId}/videos/explanations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copy",
          designId: selected.designId,
          sourceDesignVersionId: source.designVersionId,
          targetDesignVersionId: selected.designVersionId,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to copy explanations.");
      await loadExplanations(selected);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to copy explanations.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-[24px] border border-black/8 bg-white/70 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Film className="size-5" /> Videos</h2>
          <p className="mt-1 text-xs text-black/45">Project-owned MP4 and WebM videos with immutable versions.</p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-xs font-semibold text-white">
          <Upload className="size-4" /> {newVersionFor ? "Choose new version" : "Upload video"}
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadVideo(file).catch((reason) => {
                setError(reason instanceof Error ? reason.message : "Video upload failed.");
                setBusy(false);
              });
            }}
          />
        </label>
      </div>
      {progress !== null ? (
        <div className="mt-4">
          <div className="flex justify-between text-[10px] text-black/45"><span>Uploading video</span><span>{progress}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-black/8"><div className="h-full bg-[#6354d4]" style={{ width: `${progress}%` }} /></div>
        </div>
      ) : null}
      {error ? <p role="alert" className="mt-4 text-xs text-red-600">{error}</p> : null}
      {!videos.length ? (
        <p className="mt-6 rounded-2xl border border-dashed border-black/15 p-8 text-center text-xs text-black/40">
          No project videos yet. Uploading does not require an approval room.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {videos.map((video) => (
              <button
                key={video.designId}
                type="button"
                onClick={() => setSelected(video)}
                className={`w-full rounded-xl border p-3 text-left ${selected?.designId === video.designId ? "border-[#6354d4] bg-[#eeeaff]" : "border-black/8 bg-white"}`}
              >
                <p className="flex items-center gap-1.5 truncate text-xs font-semibold">
                  <Film className="size-3.5 shrink-0" /> {video.designName}
                </p>
                <p className="mt-1 text-[10px] text-black/45">Current version {video.versionNumber} · {timestamp(video.durationMs)}</p>
              </button>
            ))}
          </div>
          {selected ? (
            <div>
              <video
                ref={playerRef}
                src={`/api/client-projects/${projectId}/videos/${selected.designVersionId}/playback`}
                controls
                preload="metadata"
                className="max-h-[55vh] w-full rounded-2xl bg-black"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{selected.designName} · version {selected.versionNumber}</span>
                <span className="text-[10px] text-black/45">
                  {timestamp(selected.durationMs)} · {selected.width && selected.height ? `${selected.width} × ${selected.height} · ` : ""}
                  {formatStorageBytes(selected.byteSize)} · {selected.mimeType}
                </span>
                <button type="button" disabled={busy} onClick={() => { setNewVersionFor(selected.designId); fileRef.current?.click(); }} className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[10px] font-semibold">Upload new version</button>
                {roomId ? <button type="button" disabled={busy} onClick={() => void pinToRoom(selected)} className="rounded-lg bg-[#6354d4] px-2.5 py-1.5 text-[10px] font-semibold text-white">Add v{selected.versionNumber} to room</button> : null}
                <button
                  type="button"
                  onClick={() => {
                    playerRef.current?.pause();
                    setExplainTime(Math.round((playerRef.current?.currentTime || 0) * 1000));
                    setExplainOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[10px] font-semibold text-sky-900"
                >
                  <MessageSquarePlus className="size-3" /> Explain this moment
                </button>
              </div>
              {explainOpen ? (
                <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <p className="text-xs font-semibold">Designer explanation at {timestamp(explainTime)}</p>
                  <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" className="w-full rounded-lg border px-3 py-2 text-xs" />
                  <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Title" className="w-full rounded-lg border px-3 py-2 text-xs" />
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Explanation" rows={3} className="w-full rounded-lg border px-3 py-2 text-xs" />
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !title.trim() || !body.trim()} onClick={() => void saveExplanation()} className="rounded-lg bg-sky-800 px-3 py-2 text-[10px] font-semibold text-white">Save draft</button>
                    <button type="button" onClick={() => setExplainOpen(false)} className="text-[10px] font-semibold">Cancel</button>
                  </div>
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold">Explanations</h3>
                  <ul className="mt-2 space-y-2">
                    {explanations.map((note) => (
                      <li key={note.id} className="rounded-xl border border-black/8 bg-white p-3 text-xs">
                        {editingExplanationId === note.id ? (
                          <div className="space-y-2">
                            <label className="block text-[10px] font-semibold">
                              Timestamp (seconds)
                              <input
                                aria-label="Explanation timestamp in seconds"
                                type="number"
                                min={0}
                                max={selected.durationMs / 1000}
                                step="0.001"
                                value={editDraft.videoTimeMs / 1000}
                                onChange={(event) => setEditDraft((draft) => ({
                                  ...draft,
                                  videoTimeMs: Math.round(Number(event.target.value) * 1000),
                                }))}
                                className="mt-1 w-full rounded-lg border px-3 py-2 text-xs"
                              />
                            </label>
                            <input aria-label="Explanation category" value={editDraft.category} onChange={(event) => setEditDraft((draft) => ({ ...draft, category: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-xs" />
                            <input aria-label="Explanation title" value={editDraft.title} onChange={(event) => setEditDraft((draft) => ({ ...draft, title: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-xs" />
                            <textarea aria-label="Explanation body" value={editDraft.body} onChange={(event) => setEditDraft((draft) => ({ ...draft, body: event.target.value }))} rows={3} className="w-full rounded-lg border px-3 py-2 text-xs" />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={busy || !editDraft.category.trim() || !editDraft.title.trim() || !editDraft.body.trim() || editDraft.videoTimeMs < 0 || editDraft.videoTimeMs > selected.durationMs}
                                onClick={() => void saveExplanationEdits()}
                                className="rounded-lg bg-sky-800 px-2.5 py-1.5 text-[10px] font-semibold text-white"
                              >
                                Save
                              </button>
                              <button type="button" disabled={busy} onClick={() => setEditingExplanationId(null)} className="text-[10px] font-semibold">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button type="button" className="font-semibold underline" onClick={() => { if (playerRef.current) playerRef.current.currentTime = note.videoTimeMs / 1000; }}>
                              {timestamp(note.videoTimeMs)} · {note.title}
                            </button>
                            <p className="mt-1 text-black/60">{note.body}</p>
                            <p className="mt-1 text-[10px] uppercase text-black/35">{note.category} · {note.status}</p>
                            {note.canEdit ? (
                              <div className="mt-2 flex gap-2">
                                <button type="button" disabled={busy} onClick={() => beginExplanationEdit(note)} className="rounded-lg border border-black/10 px-2 py-1 text-[10px] font-semibold">Edit</button>
                                <button type="button" disabled={busy} onClick={() => void publishExplanation(note.id)} className="rounded-lg bg-[#6354d4] px-2 py-1 text-[10px] font-semibold text-white">Publish</button>
                              </div>
                            ) : note.canMoveToDraft ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void moveExplanationToDraft(note.id)}
                                className="mt-2 rounded-lg border border-[#6354d4]/20 bg-[#f3f0ff] px-2 py-1 text-[10px] font-semibold text-[#5142bc]"
                              >
                                Move to draft
                              </button>
                            ) : null}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="flex items-center gap-1 text-xs font-semibold"><History className="size-3.5" /> Version history</h3>
                  <ul className="mt-2 space-y-2">
                    {history.map((version) => (
                      <li key={version.designVersionId} className="flex items-center justify-between rounded-xl border border-black/8 bg-white p-3 text-xs">
                        <button type="button" className="text-left" onClick={() => { setSelected(version); }}>
                          <span className="font-semibold">Version {version.versionNumber}</span>
                          <span className="block text-[10px] text-black/40">{version.originalFilename} · {timestamp(version.durationMs)}</span>
                        </button>
                        <span className="flex items-center gap-2">
                          {version.designVersionId !== selected.designVersionId ? (
                            <button type="button" disabled={busy} onClick={() => void copyExplanations(version)} className="text-[9px] font-semibold text-[#6354d4]">Copy notes</button>
                          ) : null}
                          {version.canDelete ? <button type="button" aria-label={`Delete version ${version.versionNumber}`} disabled={busy} onClick={() => void deleteVersion(version)}><Trash2 className="size-4 text-red-500" /></button> : <span className="text-[9px] text-black/30">{version.isCurrent ? "Current" : "Protected"}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
      {busy && progress === null ? <LoaderCircle className="mt-3 size-4 animate-spin text-[#6354d4]" /> : null}
    </section>
  );
}
