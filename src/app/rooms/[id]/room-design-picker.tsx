"use client";

import { Check, FileImage, Film, LoaderCircle, Plus, Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectDesignSummary } from "@/lib/figma/types";
import { projectDesignsPath } from "@/lib/rooms/routes";

type ExistingDesign = {
  designId: string;
  designVersionId: string;
  versionNumber: number;
};

type VideoSummary = {
  designId: string;
  designName: string;
  designVersionId: string;
  versionNumber: number;
  originalFilename: string;
  durationMs: number;
};

type DesignFile = {
  designId: string;
  designVersionId: string;
  versionNumber: number;
  fileName: string;
  cards: ProjectDesignSummary[];
};

type Selection = {
  designId: string;
  designVersionId: string;
  screenIds: string[] | null;
};

function groupDesignFiles(designs: ProjectDesignSummary[]) {
  const groups = new Map<string, DesignFile>();
  for (const design of designs) {
    const current = groups.get(design.designVersionId);
    if (current) current.cards.push(design);
    else groups.set(design.designVersionId, {
      designId: design.designId,
      designVersionId: design.designVersionId,
      versionNumber: design.versionNumber,
      fileName: design.fileName,
      cards: [design],
    });
  }
  return [...groups.values()].sort((left, right) => left.fileName.localeCompare(right.fileName));
}

function cardScreenIds(card: ProjectDesignSummary) {
  return card.breakpoints.map((breakpoint) => breakpoint.id);
}

function videoDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function RoomDesignPicker({
  open,
  projectId,
  roomId,
  existingDesigns,
  onClose,
  onAdded,
}: {
  open: boolean;
  projectId: string;
  roomId: string;
  existingDesigns: ExistingDesign[];
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}) {
  const [designs, setDesigns] = useState<ProjectDesignSummary[]>([]);
  const [videos, setVideos] = useState<VideoSummary[]>([]);
  const [selection, setSelection] = useState<Record<string, Selection>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [designResponse, videoResponse] = await Promise.all([
        fetch(`/api/integrations/figma/import?projectKey=${encodeURIComponent(projectId)}`, { cache: "no-store" }),
        fetch(`/api/client-projects/${encodeURIComponent(projectId)}/videos`, { cache: "no-store" }),
      ]);
      const designPayload = await designResponse.json() as { designs?: ProjectDesignSummary[]; error?: string };
      const videoPayload = await videoResponse.json() as { videos?: VideoSummary[]; error?: string };
      if (!designResponse.ok) throw new Error(designPayload.error || "Unable to load project designs.");
      if (!videoResponse.ok) throw new Error(videoPayload.error || "Unable to load project videos.");
      setDesigns(designPayload.designs ?? []);
      setVideos(videoPayload.videos ?? []);
      setSelection({});
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the design library.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, saving]);

  const existingByDesign = useMemo(
    () => new Map(existingDesigns.map((item) => [item.designId, item])),
    [existingDesigns],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const files = useMemo(
    () => groupDesignFiles(designs).filter((file) => {
      if (!normalizedQuery) return true;
      return [file.fileName, ...file.cards.map((card) => card.name)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    }),
    [designs, normalizedQuery],
  );
  const filteredVideos = useMemo(
    () => videos.filter((video) => !normalizedQuery
      || `${video.designName} ${video.originalFilename}`.toLowerCase().includes(normalizedQuery)),
    [videos, normalizedQuery],
  );
  const selectedCount = Object.keys(selection).length;

  function toggleCard(file: DesignFile, card: ProjectDesignSummary) {
    if (existingByDesign.has(file.designId)) return;
    const ids = cardScreenIds(card);
    setSelection((current) => {
      const prior = current[file.designVersionId];
      const selectedIds = new Set(prior?.screenIds ?? []);
      const isSelected = ids.every((id) => selectedIds.has(id));
      for (const id of ids) {
        if (isSelected) selectedIds.delete(id);
        else selectedIds.add(id);
      }
      const next = { ...current };
      if (selectedIds.size === 0) delete next[file.designVersionId];
      else next[file.designVersionId] = {
        designId: file.designId,
        designVersionId: file.designVersionId,
        screenIds: [...selectedIds],
      };
      return next;
    });
  }

  function toggleFile(file: DesignFile) {
    if (existingByDesign.has(file.designId)) return;
    const allIds = file.cards.flatMap(cardScreenIds);
    setSelection((current) => {
      const next = { ...current };
      if (next[file.designVersionId]?.screenIds?.length === allIds.length) {
        delete next[file.designVersionId];
      } else {
        next[file.designVersionId] = {
          designId: file.designId,
          designVersionId: file.designVersionId,
          screenIds: allIds,
        };
      }
      return next;
    });
  }

  function toggleVideo(video: VideoSummary) {
    if (existingByDesign.has(video.designId)) return;
    setSelection((current) => {
      const next = { ...current };
      if (next[video.designVersionId]) delete next[video.designVersionId];
      else next[video.designVersionId] = {
        designId: video.designId,
        designVersionId: video.designVersionId,
        screenIds: null,
      };
      return next;
    });
  }

  async function addSelected() {
    if (saving || selectedCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const item of Object.values(selection)) {
        const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/design-versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            designId: item.designId,
            designVersionId: item.designVersionId,
            ...(item.screenIds ? { selectedScreenIds: item.screenIds } : {}),
          }),
        });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to add a design to this room.");
      }
      await onAdded();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add the selected designs.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const hasLibraryItems = designs.length > 0 || videos.length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-design-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#171329]/55 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#f5f2fb] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-black/8 bg-white px-5 py-4">
          <div>
            <h2 id="room-design-picker-title" className="text-lg font-semibold tracking-[-0.03em]">Add from Designs</h2>
            <p className="mt-1 text-xs text-black/45">Choose whole files, individual screens, or videos from this project’s design library.</p>
          </div>
          <button type="button" aria-label="Close design library" disabled={saving} onClick={onClose} className="flex size-9 items-center justify-center rounded-xl border border-black/10 text-black/45 disabled:opacity-40">
            <X className="size-4" />
          </button>
        </header>

        <div className="shrink-0 border-b border-black/8 bg-white/70 px-5 py-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/30" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search files, screens, or videos…"
              className="h-10 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-xs outline-none ring-[#7c6cf0]/30 focus:ring-2"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-sm text-black/45"><LoaderCircle className="size-5 animate-spin" /> Loading Designs…</div>
          ) : error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">{error}</div>
          ) : !hasLibraryItems ? (
            <div className="rounded-2xl border border-dashed border-black/15 bg-white p-10 text-center">
              <FileImage className="mx-auto size-8 text-black/25" />
              <p className="mt-3 text-sm font-semibold">The project design library is empty</p>
              <p className="mt-1 text-xs text-black/45">Import from Figma, upload images, or add a video in Designs first.</p>
              <Link href={projectDesignsPath(projectId)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-xs font-semibold text-white">
                <Plus className="size-4" /> Open Designs
              </Link>
            </div>
          ) : (
            <div className="space-y-7">
              {files.map((file) => {
                const existing = existingByDesign.get(file.designId);
                const chosen = selection[file.designVersionId]?.screenIds ?? [];
                const totalScreens = file.cards.flatMap(cardScreenIds).length;
                const allSelected = chosen.length === totalScreens;
                return (
                  <section key={file.designVersionId} className="rounded-2xl border border-black/8 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{file.fileName}</h3>
                        <p className="mt-0.5 text-[10px] text-black/40">Version {file.versionNumber} · {totalScreens} screen{totalScreens === 1 ? "" : "s"}</p>
                      </div>
                      {existing ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700"><Check className="size-3" /> Included as v{existing.versionNumber}</span>
                      ) : (
                        <button type="button" onClick={() => toggleFile(file)} className={`rounded-lg px-3 py-2 text-[10px] font-semibold ${allSelected ? "bg-[#6354d4] text-white" : "border border-[#a594f5]/40 text-[#6354d4]"}`}>
                          {allSelected ? "Deselect file" : "Select entire file"}
                        </button>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {file.cards.map((card) => {
                        const ids = cardScreenIds(card);
                        const selected = ids.every((id) => chosen.includes(id));
                        return (
                          <button
                            key={card.key}
                            type="button"
                            disabled={Boolean(existing)}
                            aria-pressed={selected || Boolean(existing)}
                            aria-label={`${selected ? "Deselect" : "Select"} ${card.name}`}
                            onClick={() => toggleCard(file, card)}
                            className={`overflow-hidden rounded-xl border text-left transition disabled:cursor-default ${selected || existing ? "border-[#6354d4] ring-2 ring-[#6354d4]/15" : "border-black/10 hover:border-[#a594f5]"}`}
                          >
                            <div className="relative aspect-[16/9] bg-[#e9e5f3]">
                              {card.imageUrl ? <Image src={card.imageUrl} alt="" fill sizes="300px" className="object-cover object-top" unoptimized /> : <FileImage className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-black/20" />}
                              {(selected || existing) ? <span className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-[#6354d4] text-white"><Check className="size-3.5" /></span> : null}
                            </div>
                            <div className="p-2.5">
                              <p className="truncate text-xs font-semibold">{card.name}</p>
                              <p className="mt-0.5 text-[9px] text-black/40">{ids.length} screen{ids.length === 1 ? "" : "s"}{card.isCombined ? " · breakpoint group" : ""}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              {filteredVideos.length > 0 ? (
                <section>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Film className="size-4" /> Videos</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filteredVideos.map((video) => {
                      const existing = existingByDesign.get(video.designId);
                      const selected = Boolean(selection[video.designVersionId]);
                      return (
                        <button key={video.designVersionId} type="button" disabled={Boolean(existing)} onClick={() => toggleVideo(video)} className={`rounded-xl border bg-white p-4 text-left ${selected || existing ? "border-[#6354d4] ring-2 ring-[#6354d4]/15" : "border-black/10"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <Film className="size-5 text-[#6354d4]" />
                            {selected || existing ? <Check className="size-4 text-[#6354d4]" /> : null}
                          </div>
                          <p className="mt-3 truncate text-xs font-semibold">{video.designName}</p>
                          <p className="mt-1 text-[10px] text-black/40">v{video.versionNumber} · {videoDuration(video.durationMs)}{existing ? " · Included" : ""}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {normalizedQuery && files.length === 0 && filteredVideos.length === 0 ? (
                <p className="py-12 text-center text-xs text-black/40">No designs match “{query.trim()}”.</p>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-black/8 bg-white px-5 py-4">
          <Link href={projectDesignsPath(projectId)} className="text-xs font-semibold text-[#6354d4] hover:underline">Manage project Designs</Link>
          <div className="flex items-center gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-black/55">Cancel</button>
            <button type="button" disabled={saving || selectedCount === 0} onClick={() => void addSelected()} className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {saving ? "Adding…" : `Add selected (${selectedCount})`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
