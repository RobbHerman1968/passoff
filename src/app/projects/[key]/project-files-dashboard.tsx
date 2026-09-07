"use client";

import { AlertTriangle, ArrowRight, Check, ExternalLink, FileImage, FolderKanban, ImagePlus, Layers2, LoaderCircle, LogOut, PenLine, Plus, RefreshCw, Search, Trash2, Upload, Workflow, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { commonDesignName } from "@/lib/figma/breakpoints";
import { FigmaImportClientError, streamFigmaImport } from "@/lib/figma/import-client";
import type {
  FigmaConnectionStatus,
  FigmaImportProgress,
  FigmaImportResult,
  FigmaRateLimitDetails,
  FigmaSavedImportSummary,
  ProjectDesignBreakpoint,
  ProjectDesignSummary,
} from "@/lib/figma/types";

import { HandoffWorkspace } from "./project-files/[fileKey]/handoff/handoff-workspace";

type ModalMode = "choose" | "import" | "create" | "upload";
type FilterMode = "all" | "ungrouped" | "combined" | "mobile" | "tablet" | "desktop";

type ProjectFileGroup = {
  fileKey: string;
  fileName: string;
  designs: ProjectDesignSummary[];
};

const FILTERS: Array<{ id: FilterMode; label: string }> = [
  { id: "all", label: "All" },
  { id: "ungrouped", label: "Ungrouped" },
  { id: "combined", label: "Grouped" },
  { id: "mobile", label: "Mobile" },
  { id: "tablet", label: "Tablet" },
  { id: "desktop", label: "Desktop" },
];

function projectFilePath(projectKey: string, fileKey: string) {
  return `/projects/${encodeURIComponent(projectKey)}/project-files/${encodeURIComponent(fileKey)}`;
}

function designPrimaryScreenId(design: ProjectDesignSummary) {
  return design.breakpoints.find((bp) => bp.isPrimary)?.id ?? design.breakpoints[0]?.id ?? null;
}

function designImageUnoptimized(src: string) {
  return src.startsWith("data:") || src.startsWith("/api/") || src.includes("figma.com") || src.includes("amazonaws.com");
}

function designScreenIds(design: ProjectDesignSummary) {
  return design.breakpoints.map((bp) => bp.id);
}

function matchesDesignFilter(design: ProjectDesignSummary, filter: FilterMode, query: string) {
  const q = query.trim().toLowerCase();
  if (q) {
    const haystack = [
      design.name,
      design.fileName,
      ...design.breakpoints.map((bp) => `${bp.name} ${bp.breakpointLabel}`),
    ].join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filter === "all") return true;
  if (filter === "ungrouped") return !design.isCombined;
  if (filter === "combined") return design.isCombined;
  return design.breakpoints.some((bp) => bp.breakpointLabel.toLowerCase() === filter);
}

function buildFileGroups(designs: ProjectDesignSummary[]): ProjectFileGroup[] {
  const byFile = new Map<string, ProjectFileGroup>();
  for (const design of designs) {
    const current = byFile.get(design.fileKey);
    if (current) current.designs.push(design);
    else byFile.set(design.fileKey, { fileKey: design.fileKey, fileName: design.fileName, designs: [design] });
  }
  return [...byFile.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function DesignThumb({
  src,
  alt,
  className,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      sizes={sizes}
      unoptimized={designImageUnoptimized(src)}
    />
  );
}

function ProjectDesignCard({
  design,
  selectedIds,
  busy,
  onToggleSelect,
  onOpen,
}: {
  design: ProjectDesignSummary;
  selectedIds: Set<string>;
  busy: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
}) {
  const screenIds = designScreenIds(design);
  const selectedCount = screenIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = screenIds.length > 0 && selectedCount === screenIds.length;

  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-[22px] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${
        allSelected
          ? "border-[#6354d4] ring-2 ring-[#6354d4]/25"
          : design.isMain
            ? "border-[#7c6cf0]/45 ring-2 ring-[#7c6cf0]/15"
            : design.isCombined
              ? "border-[#a594f5]/55"
              : "border-black/8"
      }`}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          disabled={busy}
          className="relative block w-full aspect-[16/10] overflow-hidden bg-[#dfe4de] text-left disabled:opacity-60"
        >
          {design.imageUrl ? (
            <DesignThumb
              src={design.imageUrl}
              alt=""
              className="object-cover object-top transition duration-500 group-hover:scale-[1.03]"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileImage className="size-6 text-black/20" />
            </div>
          )}
          {design.isMain && (
            <span className="absolute left-2 top-2 rounded-lg bg-[#6354d4] px-2 py-1 text-[8px] font-bold text-[#ffd7a8] shadow-sm">
              PROJECT MAIN
            </span>
          )}
          {design.isCombined && (
            <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-[#6354d4] px-2 py-1 text-[8px] font-bold text-[#e4dffc] shadow-sm">
              <Layers2 className="size-2.5" />
              {design.breakpoints.length} breakpoints
            </span>
          )}
          <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-white/90 text-black/55 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
            <ArrowRight className="size-3.5" />
          </span>
        </button>

        <button
          type="button"
          aria-pressed={allSelected}
          aria-label={allSelected ? "Deselect design" : "Select design"}
          disabled={busy}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSelect();
          }}
          className={`absolute bottom-2 right-2 z-10 flex size-7 items-center justify-center rounded-lg border shadow-sm transition ${
            allSelected
              ? "border-[#6354d4] bg-[#6354d4] text-[#e4dffc]"
              : "border-black/10 bg-white/95 text-black/35 hover:text-black/60"
          }`}
        >
          <Check className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onOpen}
            disabled={busy}
            className="min-w-0 truncate text-left text-xs font-semibold transition hover:text-[#6354d4] disabled:opacity-60"
          >
            {design.name}
          </button>
          {design.isCombined && (
            <span className="shrink-0 rounded-md bg-[#e4dffc] px-1.5 py-0.5 text-[8px] font-bold text-[#6354d4]">
              {design.breakpoints.length}
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-[9px] text-black/35">{design.fileName}</p>
        <p className="mt-1 text-[9px] text-black/35">
          {design.isCombined
            ? design.breakpoints.map((bp) => bp.breakpointLabel).join(" · ")
            : design.width && design.height
              ? `${design.breakpoints[0]?.breakpointLabel ?? "Frame"} · ${Math.round(design.width)} × ${Math.round(design.height)}`
              : design.breakpoints[0]?.breakpointLabel ?? "Frame"}
        </p>

        {design.isCombined && design.breakpoints.length > 1 && (
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {design.breakpoints.map((bp) => (
              <li key={bp.id} className="min-w-0">
                <div className={`relative aspect-[4/3] overflow-hidden rounded-lg bg-[#dfe4de] ${bp.isPrimary ? "ring-1 ring-[#7c6cf0]/50" : ""}`}>
                  {bp.imageUrl ? (
                    <DesignThumb src={bp.imageUrl} alt="" className="object-cover object-top" sizes="120px" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <FileImage className="size-3 text-black/20" />
                    </div>
                  )}
                </div>
                <p className="mt-1 truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-black/40">
                  {bp.breakpointLabel}
                  {bp.width ? ` · ${Math.round(bp.width)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProjectFilesDashboard({
  projectKey,
  projectName,
}: {
  projectKey: string;
  projectName: string;
}) {
  const router = useRouter();
  const importTitleId = useId();
  const [status, setStatus] = useState<FigmaConnectionStatus | null>(null);
  const [imports, setImports] = useState<FigmaSavedImportSummary[]>([]);
  const [designs, setDesigns] = useState<ProjectDesignSummary[]>([]);
  const [fileUrl, setFileUrl] = useState("");
  const [createName, setCreateName] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<FigmaImportProgress | null>(null);
  const [rateLimit, setRateLimit] = useState<FigmaRateLimitDetails | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineName, setCombineName] = useState("");
  const [combinePrimaryId, setCombinePrimaryId] = useState<string | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [handoff, setHandoff] = useState<{
    result: FigmaImportResult;
    screenId: string;
    siblingIds: string[];
  } | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);

  const filteredDesigns = useMemo(
    () => designs.filter((design) => matchesDesignFilter(design, filter, query)),
    [designs, filter, query],
  );
  const fileGroups = useMemo(() => buildFileGroups(filteredDesigns), [filteredDesigns]);
  const fileCount = useMemo(() => new Set(designs.map((design) => design.fileKey)).size, [designs]);

  const selectedBreakpoints = useMemo(() => {
    const byId = new Map<string, ProjectDesignBreakpoint & { fileKey: string; designName: string }>();
    for (const design of designs) {
      for (const bp of design.breakpoints) {
        if (selected.has(bp.id)) {
          byId.set(bp.id, { ...bp, fileKey: design.fileKey, designName: design.name });
        }
      }
    }
    return [...byId.values()];
  }, [designs, selected]);

  const selectedFileKeys = useMemo(
    () => [...new Set(selectedBreakpoints.map((bp) => bp.fileKey))],
    [selectedBreakpoints],
  );
  const canCombine = selectedBreakpoints.length >= 2 && selectedFileKeys.length === 1;

  const selectedDesigns = useMemo(
    () => designs.filter((design) => {
      const ids = designScreenIds(design);
      return ids.length > 0 && ids.every((id) => selected.has(id));
    }),
    [designs, selected],
  );

  async function loadProject(options?: { silent?: boolean; keepSelection?: boolean }) {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const importUrl = `/api/integrations/figma/import?projectKey=${encodeURIComponent(projectKey)}`;
      const [statusResponse, importsResponse] = await Promise.all([
        fetch("/api/integrations/figma/status", { cache: "no-store" }),
        fetch(importUrl, { cache: "no-store" }),
      ]);
      const nextStatus = await statusResponse.json() as FigmaConnectionStatus;
      const payload = await importsResponse.json() as {
        imports?: FigmaSavedImportSummary[];
        designs?: ProjectDesignSummary[];
        error?: string;
      };
      if (statusResponse.ok) setStatus(nextStatus);
      if (!importsResponse.ok) throw new Error(payload.error || "Unable to load project files.");
      setImports(payload.imports ?? []);
      setDesigns(payload.designs ?? []);
      if (!options?.keepSelection) setSelected(new Set());
      if (!statusResponse.ok) setError("Unable to load the project workspace status.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load project files.");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    void loadProject();
  }, [projectKey]);

  useEffect(() => {
    if (!modalOpen && !combineOpen && !handoff) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || busy || handoffLoading) return;
      if (handoff) setHandoff(null);
      else if (combineOpen) setCombineOpen(false);
      else setModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, combineOpen, handoff, busy, handoffLoading]);

  useEffect(() => {
    if (!handoff && !handoffLoading) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [handoff, handoffLoading]);

  function openModal() {
    setModalMode("choose");
    setModalError(null);
    setRateLimit(null);
    setImportProgress(null);
    setCreateName("");
    setUploadName("");
    setUploadFiles([]);
    if (uploadInputRef.current) uploadInputRef.current.value = "";
    setModalOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setModalOpen(false);
  }

  async function openDesign(design: ProjectDesignSummary) {
    const screenId = designPrimaryScreenId(design);
    if (!screenId || handoffLoading) return;
    setHandoffLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/integrations/figma/import?fileKey=${encodeURIComponent(design.fileKey)}&projectKey=${encodeURIComponent(projectKey)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as FigmaImportResult | { error?: string };
      if (!response.ok || !("file" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to open this design.");
      }
      if (!payload.screens.some((screen) => screen.id === screenId)) {
        throw new Error("That design is no longer in this file.");
      }
      setHandoff({
        result: payload,
        screenId,
        siblingIds: design.breakpoints.map((bp) => bp.id),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to open this design.");
    } finally {
      setHandoffLoading(false);
    }
  }

  function toggleDesign(design: ProjectDesignSummary) {
    setSelected((current) => {
      const next = new Set(current);
      const ids = designScreenIds(design);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function openCombine() {
    if (!canCombine) return;
    const widest = [...selectedBreakpoints].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    setCombineName(commonDesignName(selectedBreakpoints.map((bp) => bp.name)));
    setCombinePrimaryId(widest?.id ?? selectedBreakpoints[0]?.id ?? null);
    setCombineOpen(true);
  }

  async function combineSelected() {
    if (!canCombine || !combinePrimaryId || !combineName.trim() || busy) return;
    const fileKey = selectedFileKeys[0];
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/figma/screens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileKey,
          projectKey,
          action: "combine",
          screenIds: selectedBreakpoints.map((bp) => bp.id),
          name: combineName.trim(),
          primaryScreenId: combinePrimaryId,
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to combine breakpoints.");
      setCombineOpen(false);
      setSelected(new Set());
      await loadProject({ silent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to combine breakpoints.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllFiles() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/figma/import?all=1&projectKey=${encodeURIComponent(projectKey)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to delete project files.");
      setDeleteAllOpen(false);
      setSelected(new Set());
      setQuery("");
      setFilter("all");
      setImports([]);
      setDesigns([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete project files.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedDesigns() {
    if (!selectedDesigns.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const design of selectedDesigns) {
        const params = new URLSearchParams({
          fileKey: design.fileKey,
          projectKey,
        });
        if (design.isCombined && design.groupId) {
          params.set("groupId", design.groupId);
        } else {
          const screenId = design.breakpoints[0]?.id ?? designScreenIds(design)[0];
          if (!screenId) throw new Error(`Unable to delete “${design.name}”.`);
          params.set("screenId", screenId);
        }
        const response = await fetch(`/api/integrations/figma/screens?${params.toString()}`, { method: "DELETE" });
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || `Unable to delete “${design.name}”.`);
      }
      setDeleteSelectedOpen(false);
      setSelected(new Set());
      await loadProject({ silent: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete the selected designs.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setModalError(null);
    setRateLimit(null);
    setImportProgress({ stage: "connecting", message: "Starting import", percent: 1 });
    try {
      await streamFigmaImport(fileUrl, setImportProgress, { projectKey });
      setModalOpen(false);
      setBusy(false);
      setImportProgress(null);
      await loadProject();
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Unable to import this Figma file.");
      if (reason instanceof FigmaImportClientError) setRateLimit(reason.rateLimit);
      setBusy(false);
    }
  }

  async function createFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setModalError(null);
    try {
      const response = await fetch("/api/integrations/figma/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, projectKey }),
      });
      const payload = await response.json() as { file?: { key: string }; error?: string };
      if (!response.ok || !payload.file?.key) throw new Error(payload.error || "Unable to create the project file.");
      router.push(projectFilePath(projectKey, payload.file.key));
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Unable to create the project file.");
      setBusy(false);
    }
  }

  async function uploadImages(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !uploadFiles.length) return;
    setBusy(true);
    setModalError(null);
    try {
      const body = new FormData();
      body.set("projectKey", projectKey);
      if (uploadName.trim()) body.set("name", uploadName.trim());
      for (const file of uploadFiles) body.append("images", file);
      const response = await fetch("/api/integrations/figma/image-import", {
        method: "POST",
        body,
      });
      const payload = await response.json() as { file?: { key: string }; error?: string };
      if (!response.ok || !payload.file?.key) throw new Error(payload.error || "Unable to import images.");
      router.push(projectFilePath(projectKey, payload.file.key));
    } catch (reason) {
      setModalError(reason instanceof Error ? reason.message : "Unable to import images.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/figma/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Unable to disconnect Figma.");
      setStatus((current) => current ? { ...current, connected: false, figmaUserId: null, expiresAt: null } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disconnect Figma.");
    } finally {
      setBusy(false);
    }
  }

  const modalTitle = modalMode === "choose"
    ? "Add a project file"
    : modalMode === "import"
      ? "Import a Figma design"
      : modalMode === "upload"
        ? "Import images"
        : "Create a blank file";
  const modalDescription = modalMode === "choose"
    ? "Bring in a Figma file, upload screen images, or start from scratch."
    : modalMode === "import"
      ? "Adds the frames from that Figma file into this project’s design list."
      : modalMode === "upload"
        ? "Upload PNG, JPEG, WebP, or GIF screenshots as designs in this project."
        : "Creates an empty Pass-Off file you can fill in later.";

  const hasActiveFilter = filter !== "all" || query.trim().length > 0;
  const summaryLabel = loading
    ? "Loading designs…"
    : [
        `${Math.max(fileCount, imports.length)} file${Math.max(fileCount, imports.length) === 1 ? "" : "s"}`,
        `${designs.length} design${designs.length === 1 ? "" : "s"}`,
        hasActiveFilter ? `${filteredDesigns.length} shown` : null,
      ].filter(Boolean).join(" · ");

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[#17221f]">
      <header className="sticky top-0 z-40 border-b border-[#a594f5]/25 bg-[#faf8ff]/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-5 lg:px-8">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {selectedDesigns.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDeleteSelectedOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-[#e6a44c]/40 bg-white px-3 py-2 text-[10px] font-semibold text-[#a14428] disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                  <span className="hidden sm:inline">Delete selected</span>
                  <span>({selectedDesigns.length})</span>
                </button>
                <button
                  type="button"
                  disabled={!canCombine || busy}
                  onClick={openCombine}
                  title={selectedFileKeys.length > 1 ? "Select designs from the same file to combine" : undefined}
                  className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-3 py-2 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
                >
                  <Layers2 className="size-3.5" />
                  <span className="hidden sm:inline">Combine breakpoints</span>
                  <span>({selectedBreakpoints.length})</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(new Set())}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/45 disabled:opacity-40"
                >
                  Clear
                </button>
              </>
            )}
            <span className="hidden text-xs text-black/40 lg:inline">{status?.tenant?.organizationName || "Project workspace"}</span>
            {status?.connected && (
              <button type="button" onClick={disconnect} disabled={busy} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/50">
                <LogOut className="size-3.5" />Disconnect Figma
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">
              <FolderKanban className="size-4" />{status?.tenant?.workspaceName || "Main workspace"}
            </div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">{projectName}</h1>
            <p className="mt-2 truncate font-mono text-xs text-black/35">{projectKey}</p>
            <p className="mt-1 text-sm text-black/40">{summaryLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { void loadProject(); }} className="flex items-center gap-2 rounded-xl border border-black/8 bg-white px-3 py-2 text-[10px] font-semibold text-black/50">
              <RefreshCw className="size-3.5" />Refresh
            </button>
            {(imports.length > 0 || designs.length > 0) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setDeleteAllOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-[#e6a44c]/40 bg-white px-3 py-2 text-[10px] font-semibold text-[#a14428] disabled:opacity-40"
              >
                <Trash2 className="size-3.5" />Delete all
              </button>
            )}
            <button type="button" onClick={openModal} className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2 text-[10px] font-semibold text-[#e4dffc]">
              <Plus className="size-3.5" />Add file
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="mt-6 flex items-start gap-3 rounded-xl border border-[#e6a44c]/35 bg-[#fff4d8] p-4 text-xs leading-5 text-[#76500b]">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {selected.size > 0 && selectedFileKeys.length > 1 && (
          <div role="status" className="mt-4 rounded-xl border border-[#e6a44c]/35 bg-[#fff4d8] px-4 py-3 text-xs text-[#76500b]">
            Select designs from the same Figma file to combine breakpoints.
          </div>
        )}

        {!loading && designs.length > 0 && (
          <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block min-w-0 flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-black/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by file, design, or breakpoint…"
                className="h-9 w-full rounded-xl border border-black/10 bg-white pl-9 pr-9 text-xs outline-none ring-[#7c6cf0]/30 placeholder:text-black/30 focus:ring-2"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear filter"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-black/35 transition hover:bg-black/[0.05] hover:text-black/60"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${filter === item.id ? "bg-[#6354d4] text-[#e4dffc]" : "bg-white text-black/45 ring-1 ring-black/8 hover:bg-black/[0.03]"}`}
                >
                  {item.label}
                </button>
              ))}
              {filteredDesigns.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const visibleIds = filteredDesigns.flatMap(designScreenIds);
                    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
                    setSelected((current) => {
                      const next = new Set(current);
                      for (const id of visibleIds) {
                        if (allVisibleSelected) next.delete(id);
                        else next.add(id);
                      }
                      return next;
                    });
                  }}
                  className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-semibold text-black/45 ring-1 ring-black/8 transition hover:bg-black/[0.03] disabled:opacity-40"
                >
                  {filteredDesigns.every((design) => {
                    const ids = designScreenIds(design);
                    return ids.length > 0 && ids.every((id) => selected.has(id));
                  })
                    ? "Deselect shown"
                    : "Select shown"}
                </button>
              )}
            </div>
          </div>
        )}

        <section className="mt-6">
          {loading ? (
            <div className="flex justify-center py-24"><LoaderCircle className="size-6 animate-spin text-[#7c6cf0]" /></div>
          ) : !designs.length ? (
            <div className="mt-5 rounded-[22px] border border-dashed border-black/15 bg-white/45 px-6 py-16 text-center">
              <FolderKanban className="mx-auto size-8 text-black/20" />
              <p className="mt-4 text-sm font-semibold text-black/55">No files yet</p>
              <p className="mt-1 text-xs text-black/35">Import from Figma to add designs to this project.</p>
              <button type="button" onClick={openModal} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc]">
                <Plus className="size-3.5" />Add file
              </button>
            </div>
          ) : !filteredDesigns.length ? (
            <div className="rounded-[22px] border border-dashed border-black/15 bg-white/45 px-6 py-16 text-center">
              <FileImage className="mx-auto size-8 text-black/20" />
              <p className="mt-4 text-sm font-semibold text-black/55">No designs match this filter</p>
              <p className="mt-1 text-xs text-black/35">Try another search or clear filters.</p>
              <button
                type="button"
                onClick={() => { setQuery(""); setFilter("all"); }}
                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[10px] font-semibold text-black/55"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className="space-y-10">
              {fileGroups.map((group) => (
                <section key={group.fileKey} className="space-y-4">
                  <div className="flex items-center justify-between gap-3 border-b border-black/8 pb-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold tracking-[-0.02em]">{group.fileName}</h2>
                      <p className="mt-0.5 text-[10px] text-black/35">
                        {group.designs.length} design{group.designs.length === 1 ? "" : "s"}
                        {group.designs.some((design) => design.isCombined)
                          ? ` · ${group.designs.filter((design) => design.isCombined).length} grouped`
                          : ""}
                      </p>
                    </div>
                    <Link
                      href={projectFilePath(projectKey, group.fileKey)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-black/8 bg-white px-3 py-2 text-[10px] font-semibold text-black/50 transition hover:border-[#a594f5]/50 hover:text-[#6354d4]"
                    >
                      Open file <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.designs.map((design) => (
                      <ProjectDesignCard
                        key={design.key}
                        design={design}
                        selectedIds={selected}
                        busy={busy || handoffLoading}
                        onOpen={() => { void openDesign(design); }}
                        onToggleSelect={() => toggleDesign(design)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>

      {combineOpen && canCombine && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Combine breakpoints"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1412]/75 p-4 backdrop-blur-sm"
          onClick={() => { if (!busy) setCombineOpen(false); }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[22px] border border-white/10 bg-[#f4f5f1] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-black/8 bg-white px-4 py-3">
              <h2 className="text-sm font-semibold">Combine as one design</h2>
              <p className="mt-1 text-[10px] text-black/40">Name the set and choose which breakpoint is primary.</p>
            </div>
            <div className="space-y-4 p-4">
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Design name</span>
                <input
                  value={combineName}
                  onChange={(event) => setCombineName(event.target.value)}
                  className="mt-1.5 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs outline-none ring-[#7c6cf0]/30 focus:ring-2"
                  placeholder="Homepage"
                  autoFocus
                />
              </label>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">Primary breakpoint</p>
                <div className="mt-2 space-y-1.5">
                  {[...selectedBreakpoints]
                    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
                    .map((screen) => (
                      <button
                        key={screen.id}
                        type="button"
                        onClick={() => setCombinePrimaryId(screen.id)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${combinePrimaryId === screen.id ? "border-[#7c6cf0]/45 bg-[#ebe6fa]" : "border-black/8 bg-white hover:bg-black/[0.02]"}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold">{screen.name}</span>
                          <span className="mt-0.5 block text-[9px] text-black/35">
                            {screen.breakpointLabel}
                            {screen.width ? ` · ${Math.round(screen.width)}px` : ""}
                          </span>
                        </span>
                        {combinePrimaryId === screen.id && <Check className="size-3.5 shrink-0 text-[#7c6cf0]" />}
                      </button>
                    ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-black/8 bg-white px-4 py-3">
              <button type="button" disabled={busy} onClick={() => setCombineOpen(false)} className="rounded-xl border border-black/10 px-3 py-2 text-[10px] font-semibold text-black/50 disabled:opacity-40">Cancel</button>
              <button
                type="button"
                disabled={busy || !combineName.trim() || !combinePrimaryId}
                onClick={() => { void combineSelected(); }}
                className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-3 py-2 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Layers2 className="size-3.5" />}
                Combine
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={importTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1412]/7 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[24px] border border-white/10 bg-[#16131f] text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e4dffc] text-[#6354d4]">
                  {modalMode === "create" ? <PenLine className="size-4" /> : modalMode === "upload" ? <ImagePlus className="size-4" /> : <Workflow className="size-4" />}
                </div>
                <div>
                  <h2 id={importTitleId} className="text-lg font-semibold">{modalTitle}</h2>
                  <p className="mt-1 text-xs leading-5 text-white/45">{modalDescription}</p>
                </div>
              </div>
              <button type="button" onClick={closeModal} disabled={busy} aria-label="Close" className="flex size-9 items-center justify-center rounded-xl border border-white/10 text-white/55 disabled:opacity-40">
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {modalMode === "choose" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => { setModalMode("import"); setModalError(null); }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-[#a594f5]/40 hover:bg-white/8"
                  >
                    <Workflow className="size-4 text-[#a594f5]" />
                    <p className="mt-3 text-sm font-semibold">Import from Figma</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/45">Pull frames from an existing Figma file via API or plugin.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModalMode("upload"); setModalError(null); setUploadName(""); setUploadFiles([]); if (uploadInputRef.current) uploadInputRef.current.value = ""; }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-[#a594f5]/40 hover:bg-white/8"
                  >
                    <ImagePlus className="size-4 text-[#a594f5]" />
                    <p className="mt-3 text-sm font-semibold">Import images</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/45">Upload screenshots or exports when you don’t have a Figma file.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setModalMode("create"); setModalError(null); setCreateName(""); }}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-[#a594f5]/40 hover:bg-white/8 sm:col-span-2"
                  >
                    <PenLine className="size-4 text-[#a594f5]" />
                    <p className="mt-3 text-sm font-semibold">Create blank file</p>
                    <p className="mt-1 text-[10px] leading-4 text-white/45">Start a blank Pass-Off file and add Figma or image screens later.</p>
                  </button>
                </div>
              )}

              {modalMode === "import" && (
                !status?.configured ? (
                  <p className="rounded-xl bg-white/8 p-4 text-xs text-white/60">Add the Figma OAuth environment variables before importing.</p>
                ) : !status.connected ? (
                  <a href="/api/integrations/figma/connect" className="flex items-center justify-center gap-2 rounded-xl bg-[#e4dffc] px-5 py-3 text-xs font-semibold text-[#6354d4]">
                    Connect Figma <ArrowRight className="size-4" />
                  </a>
                ) : (
                  <form onSubmit={importFile} className="space-y-4">
                    <label htmlFor="dashboard-figma-url" className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">Figma file URL</label>
                    <input
                      id="dashboard-figma-url"
                      value={fileUrl}
                      onChange={(event) => setFileUrl(event.target.value)}
                      disabled={busy}
                      required
                      placeholder="https://www.figma.com/design/FILE_KEY/Project"
                      className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none ring-[#7c6cf0]/40 placeholder:text-white/25 focus:ring-2 disabled:opacity-50"
                    />
                    {importProgress && (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-[10px] text-white/55">
                          <span>{importProgress.message}</span>
                          <span>{importProgress.percent}%</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-[#7c6cf0] transition-all" style={{ width: `${importProgress.percent}%` }} />
                        </div>
                      </div>
                    )}
                    {modalError && <p role="alert" className="text-xs text-[#a594f5]">{modalError}</p>}
                    {rateLimit && (
                      <div className="rounded-xl border border-[#a594f5]/30 bg-[#2e2654]/40 p-3 text-[10px] leading-4 text-[#e4dffc]">
                        <p>Figma rate limit reached{rateLimit.retryAfterSeconds ? ` · retry in ~${rateLimit.retryAfterSeconds}s` : ""}.</p>
                        {rateLimit.upgradeUrl && (
                          <a href={rateLimit.upgradeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-[#e4dffc] underline">
                            Review Figma plan or seat <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    )}
                    {status.pluginConfigured && (
                      <p className="text-[10px] text-white/35">
                        Prefer the local plugin to avoid REST limits. Paste this project key in the plugin: <code className="text-white/55">{projectKey}</code>
                      </p>
                    )}
                    <div className="flex justify-between gap-2">
                      <button type="button" disabled={busy} onClick={() => setModalMode("choose")} className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-semibold text-white/55 disabled:opacity-40">Back</button>
                      <button type="submit" disabled={busy || !fileUrl.trim()} className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40">
                        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                        Import file
                      </button>
                    </div>
                  </form>
                )
              )}

              {modalMode === "create" && (
                <form onSubmit={createFile} className="space-y-4">
                  <label htmlFor="dashboard-create-name" className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">File name</label>
                  <input
                    id="dashboard-create-name"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    disabled={busy}
                    required
                    maxLength={200}
                    placeholder="Homepage explorations"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none ring-[#7c6cf0]/40 placeholder:text-white/25 focus:ring-2 disabled:opacity-50"
                  />
                  {modalError && <p role="alert" className="text-xs text-[#a594f5]">{modalError}</p>}
                  <div className="flex justify-between gap-2">
                    <button type="button" disabled={busy} onClick={() => setModalMode("choose")} className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-semibold text-white/55 disabled:opacity-40">Back</button>
                    <button type="submit" disabled={busy || !createName.trim()} className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40">
                      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                      Create file
                    </button>
                  </div>
                </form>
              )}

              {modalMode === "upload" && (
                <form onSubmit={uploadImages} className="space-y-4">
                  <label htmlFor="dashboard-upload-name" className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">File name (optional)</label>
                  <input
                    id="dashboard-upload-name"
                    value={uploadName}
                    onChange={(event) => setUploadName(event.target.value)}
                    disabled={busy}
                    maxLength={200}
                    placeholder="Marketing screens"
                    className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none ring-[#7c6cf0]/40 placeholder:text-white/25 focus:ring-2 disabled:opacity-50"
                  />
                  <div>
                    <label htmlFor="dashboard-upload-files" className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">Images</label>
                    <input
                      ref={uploadInputRef}
                      id="dashboard-upload-files"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      disabled={busy}
                      onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                      className="mt-2 block w-full text-xs text-white/55 file:mr-3 file:rounded-lg file:border-0 file:bg-[#e4dffc] file:px-3 file:py-2 file:text-[10px] file:font-semibold file:text-[#6354d4] disabled:opacity-50"
                    />
                    {uploadFiles.length > 0 && (
                      <p className="mt-2 text-[10px] text-white/40">
                        {uploadFiles.length} image{uploadFiles.length === 1 ? "" : "s"} selected
                        {uploadFiles.length <= 3 ? ` · ${uploadFiles.map((file) => file.name).join(", ")}` : ""}
                      </p>
                    )}
                  </div>
                  {modalError && <p role="alert" className="text-xs text-[#a594f5]">{modalError}</p>}
                  <div className="flex justify-between gap-2">
                    <button type="button" disabled={busy} onClick={() => setModalMode("choose")} className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-semibold text-white/55 disabled:opacity-40">Back</button>
                    <button type="submit" disabled={busy || !uploadFiles.length} className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40">
                      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      Import images
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteSelectedOpen} onOpenChange={(open) => { if (!open && !busy) setDeleteSelectedOpen(false); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-[#fff1eb] text-[#a14428]">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {`Delete ${selectedDesigns.length} design${selectedDesigns.length === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedDesigns.length === 1
                ? `“${selectedDesigns[0]?.name}” will be removed from this project, including its preview${selectedDesigns[0]?.isCombined ? "s and breakpoint group" : ""}. This cannot be undone.`
                : `The ${selectedDesigns.length} selected designs will be removed from this project, including previews and any breakpoint groups. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => { void deleteSelectedDesigns(); }}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Delete selected
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {handoffLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1412]/55 backdrop-blur-sm">
          <LoaderCircle className="size-7 animate-spin text-[#e4dffc]" aria-label="Opening design" />
        </div>
      )}

      {handoff && (() => {
        const activeScreen = handoff.result.screens.find((screen) => screen.id === handoff.screenId);
        if (!activeScreen) return null;
        const siblingScreens = handoff.siblingIds
          .map((id) => handoff.result.screens.find((screen) => screen.id === id))
          .filter((screen): screen is NonNullable<typeof screen> => Boolean(screen));
        return (
          <HandoffWorkspace
            result={handoff.result}
            screen={activeScreen}
            siblingScreens={siblingScreens.length > 0 ? siblingScreens : [activeScreen]}
            onClose={() => setHandoff(null)}
            onNavigate={(screenId) => {
              setHandoff((current) => {
                if (!current) return null;
                const target = current.result.screens.find((screen) => screen.id === screenId);
                if (!target) return current;
                if (current.siblingIds.includes(screenId)) {
                  return { ...current, screenId };
                }
                const groupId = target.breakpointGroupId;
                const siblingIds = groupId
                  ? current.result.screens
                    .filter((screen) => screen.breakpointGroupId === groupId)
                    .map((screen) => screen.id)
                  : [screenId];
                return { ...current, screenId, siblingIds };
              });
            }}
            onSelectSibling={(screenId) => {
              setHandoff((current) => (current ? { ...current, screenId } : null));
            }}
          />
        );
      })()}

      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => { if (!open && !busy) setDeleteAllOpen(false); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-[#fff1eb] text-[#a14428]">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete all project files?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This removes ${Math.max(imports.length, fileCount)} file${Math.max(imports.length, fileCount) === 1 ? "" : "s"} and ${designs.length} design${designs.length === 1 ? "" : "s"} from this project, including breakpoint groups and previews. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => { void deleteAllFiles(); }}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
