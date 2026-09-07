"use client";

import { ArrowLeft, Check, FileImage, ImagePlus, Layers2, LoaderCircle, Maximize2, Search, Star, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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
import type { FigmaImportResult, FigmaScreen } from "@/lib/figma/types";
import { commonDesignName, deriveBreakpointLabel } from "@/lib/figma/breakpoints";

import { HandoffWorkspace } from "./handoff/handoff-workspace";

type DesignGroup = {
  key: string;
  name: string;
  screens: FigmaScreen[];
  cover: FigmaScreen;
  isCombined: boolean;
  groupId: string | null;
};

type FilterMode = "all" | "ungrouped" | "combined" | "mobile" | "tablet" | "desktop";

function designImageUnoptimized(src: string) {
  return src.startsWith("data:") || src.startsWith("/api/") || src.includes("figma.com") || src.includes("amazonaws.com");
}

function DesignImage({
  src,
  alt,
  className,
  fill,
  width,
  height,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
}) {
  const unoptimized = designImageUnoptimized(src);
  if (fill) {
    return <Image src={src} alt={alt} fill className={className} sizes={sizes} unoptimized={unoptimized} priority={priority} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 1200}
      height={height ?? 800}
      className={className}
      sizes={sizes}
      unoptimized={unoptimized}
      priority={priority}
    />
  );
}

function buildGroups(screens: FigmaScreen[]): DesignGroup[] {
  const byGroup = new Map<string, FigmaScreen[]>();
  const singles: FigmaScreen[] = [];

  for (const screen of screens) {
    if (screen.breakpointGroupId) {
      const current = byGroup.get(screen.breakpointGroupId) ?? [];
      current.push(screen);
      byGroup.set(screen.breakpointGroupId, current);
    } else {
      singles.push(screen);
    }
  }

  const groups: DesignGroup[] = [];
  for (const [key, members] of byGroup) {
    // One card per set — only the primary cover is shown; other breakpoints stay hidden in the grid.
    if (members.length < 2) {
      singles.push(...members);
      continue;
    }
    const ordered = [...members].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const cover = ordered.find((screen) => screen.isGroupPrimary)
      ?? ordered.find((screen) => screen.isMain)
      ?? ordered[0];
    groups.push({
      key,
      groupId: key,
      name: cover.breakpointGroupName || commonDesignName(ordered.map((screen) => screen.name)),
      screens: ordered,
      cover,
      isCombined: true,
    });
  }
  for (const screen of singles) {
    groups.push({
      key: screen.id,
      groupId: null,
      name: screen.name,
      screens: [screen],
      cover: screen,
      isCombined: false,
    });
  }

  return groups.sort((a, b) => {
    if (a.cover.isMain && !b.cover.isMain) return -1;
    if (!a.cover.isMain && b.cover.isMain) return 1;
    return a.name.localeCompare(b.name);
  });
}

function screenBreakpoint(screen: FigmaScreen) {
  return deriveBreakpointLabel(screen.width, screen.name);
}

function matchesFilter(group: DesignGroup, filter: FilterMode, query: string) {
  const q = query.trim().toLowerCase();
  if (q) {
    const haystack = [
      group.name,
      ...group.screens.map((screen) => `${screen.name} ${screenBreakpoint(screen)}`),
    ].join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (filter === "all") return true;
  if (filter === "ungrouped") return !group.isCombined;
  if (filter === "combined") return group.isCombined;
  return group.screens.some((screen) => screenBreakpoint(screen).toLowerCase() === filter);
}

export function ProjectDesigns({
  projectKey,
  fileKey,
  initialScreen = null,
}: {
  projectKey: string;
  fileKey: string;
  initialScreen?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const screenParam = searchParams.get("screen") ?? initialScreen;

  const [result, setResult] = useState<FigmaImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(screenParam);
  const [activeBreakpointId, setActiveBreakpointId] = useState<string | null>(screenParam);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [hideGrouped, setHideGrouped] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);
  const [combineName, setCombineName] = useState("");
  const [combinePrimaryId, setCombinePrimaryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id?: string; groupId?: string; name: string; breakpointCount: number } | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [renamingProject, setRenamingProject] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  function screenHref(screenId: string) {
    return `${pathname}?screen=${encodeURIComponent(screenId)}`;
  }

  function openScreen(screenId: string) {
    router.push(screenHref(screenId));
  }

  function closeHandoff() {
    setActiveId(null);
    setActiveBreakpointId(null);
    router.replace(pathname);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/integrations/figma/import?fileKey=${encodeURIComponent(fileKey)}&projectKey=${encodeURIComponent(projectKey)}`,
          { cache: "no-store" },
        );
        const payload = await response.json() as FigmaImportResult | { error?: string };
        if (!response.ok || !("file" in payload)) {
          throw new Error("error" in payload && payload.error ? payload.error : "Unable to open this project.");
        }
        if (!cancelled) {
          setResult(payload);
          setProjectNameDraft(payload.file.name);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to open this project.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [fileKey, projectKey]);

  useEffect(() => {
    if (!result) return;
    if (!screenParam) {
      setActiveId(null);
      setActiveBreakpointId(null);
      return;
    }
    if (!result.screens.some((screen) => screen.id === screenParam)) {
      setActiveId(null);
      setActiveBreakpointId(null);
      router.replace(pathname);
      return;
    }
    setActiveId(screenParam);
    setActiveBreakpointId(screenParam);
  }, [screenParam, result, pathname, router]);

  useEffect(() => {
    if (!activeId && !combineOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (combineOpen) {
          setCombineOpen(false);
          return;
        }
        setActiveId(null);
        setActiveBreakpointId(null);
        router.replace(pathname);
      }
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeId, combineOpen, pathname, router]);

  const designs = result?.screens ?? [];
  const groups = useMemo(() => buildGroups(designs), [designs]);
  const visibleGroups = useMemo(
    () => groups.filter((group) => {
      if (hideGrouped && group.screens.length > 1) return false;
      return matchesFilter(group, filter, query);
    }),
    [groups, filter, query, hideGrouped],
  );
  const selectedScreens = designs.filter((screen) => selected.has(screen.id));
  const activeGroup = groups.find((group) => group.screens.some((screen) => screen.id === activeId)) ?? null;
  const active = activeGroup?.screens.find((screen) => screen.id === (activeBreakpointId || activeId)) ?? activeGroup?.cover ?? null;
  const groupedDesignCount = groups.filter((group) => group.screens.length > 1).length;
  const groupedFrameCount = groups.reduce((total, group) => total + (group.screens.length > 1 ? group.screens.length : 0), 0);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/figma/screens", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey, projectKey, ...body }),
      });
      const payload = await response.json() as FigmaImportResult | { error?: string };
      if (!response.ok || !("file" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to update designs.");
      setResult(payload);
      setSelected(new Set());
      setCombineOpen(false);
      return payload;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update designs.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function deleteDesign(target: { id?: string; groupId?: string }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ fileKey, projectKey });
      if (target.groupId) params.set("groupId", target.groupId);
      else if (target.id) params.set("screenId", target.id);
      else throw new Error("Nothing to delete.");

      const response = await fetch(`/api/integrations/figma/screens?${params.toString()}`, {
        method: "DELETE",
      });
      const payload = await response.json() as FigmaImportResult | { error?: string };
      if (!response.ok || !("file" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to delete the design.");
      setResult(payload);
      setSelected(new Set());
      setDeleteTarget(null);
      if (activeId || screenParam) closeHandoff();
      else {
        setActiveId(null);
        setActiveBreakpointId(null);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete the design.");
    } finally {
      setBusy(false);
    }
  }

  function requestDelete(group: DesignGroup) {
    setDeleteTarget({
      id: group.isCombined ? undefined : group.cover.id,
      groupId: group.groupId || undefined,
      name: group.name,
      breakpointCount: group.screens.length,
    });
  }

  function requestDeleteScreen(screen: FigmaScreen) {
    setDeleteTarget({
      id: screen.id,
      name: screen.name,
      breakpointCount: 1,
    });
  }
  async function saveProjectName(nextNameRaw?: string) {
    if (!result || renamingProject) return;
    const nextName = (nextNameRaw ?? projectNameDraft).trim();
    if (!nextName || nextName === result.file.name) {
      setProjectNameDraft(result.file.name);
      return;
    }
    setRenamingProject(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/figma/import", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey, name: nextName, projectKey }),
      });
      const payload = await response.json() as { fileName?: string; error?: string };
      if (!response.ok || !payload.fileName) throw new Error(payload.error || "Unable to rename the project.");
      setResult((current) => current ? { ...current, file: { ...current.file, name: payload.fileName! } } : current);
      setProjectNameDraft(payload.fileName);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to rename the project.");
      setProjectNameDraft(result.file.name);
    } finally {
      setRenamingProject(false);
    }
  }

  function toggleSelected(screenId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(screenId)) next.delete(screenId);
      else next.add(screenId);
      return next;
    });
  }

  function openCombine() {
    const screens = designs.filter((screen) => selected.has(screen.id));
    if (screens.length < 2) return;
    const widest = [...screens].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    setCombineName(commonDesignName(screens.map((screen) => screen.name)));
    setCombinePrimaryId(widest?.id ?? screens[0].id);
    setCombineOpen(true);
  }

  function openGroup(group: DesignGroup) {
    openScreen(group.cover.id);
  }

  async function uploadImages(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("projectKey", projectKey);
      body.set("fileKey", fileKey);
      for (const file of files) body.append("images", file);
      const response = await fetch("/api/integrations/figma/image-import", {
        method: "POST",
        body,
      });
      const payload = await response.json() as FigmaImportResult | { error?: string };
      if (!response.ok || !("file" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to import images.");
      }
      setResult(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import images.");
    } finally {
      setBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  const filters: Array<{ id: FilterMode; label: string }> = [
    { id: "all", label: "All" },
    { id: "ungrouped", label: "Ungrouped" },
    { id: "combined", label: "Combined" },
    { id: "desktop", label: "Desktop" },
    { id: "tablet", label: "Tablet" },
    { id: "mobile", label: "Mobile" },
  ];

  const handoffOpen = Boolean(active && activeGroup && result);
  const openingHandoff = Boolean(screenParam) && !handoffOpen;

  return (
    <main className="min-h-screen bg-[#f1f2ed] text-[#17221f]">
      <div className="sticky top-0 z-40 border-b border-black/8 bg-[#faf8ff]/95 backdrop-blur-md">
        <header>
          <div className="flex h-14 items-center gap-4 px-4 lg:px-5">
            <Link href={`/projects/${encodeURIComponent(projectKey)}`} aria-label="Back to Projects" className="flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55 transition hover:bg-black/5">
              <ArrowLeft className="size-4" />
            </Link>
            <div className="min-w-0 flex-1">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveProjectName();
                }}
                className="flex min-w-0 items-center gap-2"
              >
                <input
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onBlur={() => { void saveProjectName(); }}
                  disabled={loading || renamingProject || !result}
                  aria-label="Project name"
                  className="min-w-0 flex-1 truncate rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold outline-none hover:border-black/10 focus:border-black/15 focus:bg-white disabled:opacity-60"
                />
                {renamingProject && <LoaderCircle className="size-3.5 shrink-0 animate-spin text-[#7c6cf0]" />}
              </form>
              <p className="mt-0.5 text-[10px] text-black/40">
                {openingHandoff
                  ? "Opening design…"
                  : loading
                    ? "Loading designs…"
                    : `${designs.length} frame${designs.length === 1 ? "" : "s"} · ${groups.length} design${groups.length === 1 ? "" : "s"}${groupedDesignCount > 0 ? ` · ${groupedDesignCount} grouped (${groupedFrameCount} files)` : ""}`}
              </p>
            </div>
            {!screenParam && (
              <>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="sr-only"
                  onChange={(event) => { void uploadImages(event.target.files); }}
                />
                <button
                  type="button"
                  disabled={busy || loading}
                  onClick={() => uploadInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/60 transition hover:bg-black/[0.03] disabled:opacity-40"
                >
                  {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                  Upload Images
                </button>
              </>
            )}
            {!screenParam && selected.size >= 2 && (
              <button
                type="button"
                disabled={busy}
                onClick={openCombine}
                className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-3 py-2 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
              >
                <Layers2 className="size-3.5" />
                Combine Breakpoints ({selected.size})
              </button>
            )}
          </div>
        </header>

        {!loading && !screenParam && designs.length > 0 && (
          <div className="flex flex-col gap-2 px-4 pb-3 pt-1 lg:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative block min-w-0 flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-black/30" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by name or breakpoint…"
                  className="h-9 w-full rounded-xl border border-black/10 bg-white pl-9 pr-9 text-xs outline-none ring-[#7c6cf0]/30 placeholder:text-black/30 focus:ring-2"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear Filter"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-black/35 transition hover:bg-black/[0.05] hover:text-black/60"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {filters.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFilter(item.id)}
                    className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition ${filter === item.id ? "bg-[#6354d4] text-[#e4dffc]" : "bg-white text-black/45 ring-1 ring-black/8 hover:bg-black/[0.03]"}`}
                  >
                    {item.label}
                  </button>
                ))}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/8 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-black/55">
                  <input
                    type="checkbox"
                    checked={hideGrouped}
                    onChange={(event) => setHideGrouped(event.target.checked)}
                    className="size-3.5 rounded border-black/20 accent-[#6354d4]"
                  />
                  Hide grouped
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl px-5 py-5 lg:px-8">
        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-[#e6a44c]/35 bg-[#fff4d8] px-4 py-3 text-xs text-[#76500b]">{error}</div>
        )}

        {openingHandoff ? (
          <div className="flex justify-center py-24">
            <LoaderCircle className="size-6 animate-spin text-[#7c6cf0]" aria-label="Opening design" />
          </div>
        ) : loading ? (
          <div className="flex justify-center py-24">
            <LoaderCircle className="size-6 animate-spin text-[#7c6cf0]" aria-label="Loading designs" />
          </div>
        ) : visibleGroups.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleGroups.map((group) => (
              <DesignGroupCard
                key={group.key}
                group={group}
                selectedIds={selected}
                busy={busy}
                onToggleSelect={toggleSelected}
                onOpen={() => openGroup(group)}
                onSetMain={() => mutate({ action: "set-main", screenId: group.cover.id })}
                onDelete={() => requestDelete(group)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[22px] border border-dashed border-black/15 bg-white/45 px-6 py-16 text-center">
            <FileImage className="mx-auto size-8 text-black/20" />
            <p className="mt-4 text-sm font-semibold text-black/55">{designs.length ? "No designs match this filter" : "No designs yet"}</p>
            <p className="mt-1 text-xs text-black/35">
              {designs.length
                ? "Try another search or clear filters."
                : "Upload Images or import frames from Figma to see them here."}
            </p>
            {!designs.length && (
              <button
                type="button"
                disabled={busy}
                onClick={() => uploadInputRef.current?.click()}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Upload Images
              </button>
            )}
          </div>
        )}
      </div>

      {combineOpen && selectedScreens.length >= 2 && (
        <div role="dialog" aria-modal="true" aria-label="Combine Breakpoints" className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1412]/75 p-4 backdrop-blur-sm" onClick={() => setCombineOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-[22px] border border-white/10 bg-[#f4f5f1] shadow-2xl" onClick={(event) => event.stopPropagation()}>
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
                  {selectedScreens
                    .slice()
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
                            {screenBreakpoint(screen)}
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
              <button type="button" onClick={() => setCombineOpen(false)} className="rounded-xl border border-black/10 px-3 py-2 text-[10px] font-semibold text-black/50">Cancel</button>
              <button
                type="button"
                disabled={busy || !combineName.trim() || !combinePrimaryId}
                onClick={() => mutate({ action: "combine", screenIds: [...selected], name: combineName.trim(), primaryScreenId: combinePrimaryId })}
                className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-3 py-2 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
              >
                {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Layers2 className="size-3.5" />}
                Combine
              </button>
            </div>
          </div>
        </div>
      )}

      {active && activeGroup && result && (
        <HandoffWorkspace
          result={result}
          screen={active}
          siblingScreens={activeGroup.screens}
          onClose={closeHandoff}
          onNavigate={(screenId) => {
            const target = result.screens.find((item) => item.id === screenId);
            if (!target) return;
            openScreen(screenId);
          }}
          onSelectSibling={(screenId) => {
            setActiveBreakpointId(screenId);
            router.replace(screenHref(screenId));
          }}
        />
      )}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !busy) setDeleteTarget(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-[#fff1eb] text-[#a14428]">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete this design?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? deleteTarget.breakpointCount > 1
                  ? `“${deleteTarget.name}” and its ${deleteTarget.breakpointCount} breakpoints will be removed from this project. This cannot be undone.`
                  : `“${deleteTarget.name}” will be removed from this project. This cannot be undone.`
                : "This design will be removed from this project."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy || !deleteTarget}
              onClick={() => {
                if (deleteTarget) void deleteDesign(deleteTarget);
              }}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function DesignGroupCard({
  group,
  selectedIds,
  busy,
  onToggleSelect,
  onOpen,
  onSetMain,
  onDelete,
}: {
  group: DesignGroup;
  selectedIds: Set<string>;
  busy: boolean;
  onToggleSelect: (screenId: string) => void;
  onOpen: () => void;
  onSetMain: () => void;
  onDelete: () => void;
}) {
  const selectedCount = group.screens.filter((screen) => selectedIds.has(screen.id)).length;
  const allSelected = selectedCount === group.screens.length;

  return (
    <div className={`group overflow-hidden rounded-[22px] border bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl ${group.cover.isMain ? "border-[#7c6cf0]/45 ring-2 ring-[#7c6cf0]/15" : group.screens.length > 1 ? "border-[#a594f5]/55" : "border-black/8"}`}>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="relative block w-full aspect-[16/10] overflow-hidden bg-[#dfe4de] text-left"
        >
          {group.cover.imageUrl ? (
            <DesignImage
              src={group.cover.imageUrl}
              alt=""
              fill
              className="object-cover object-top"
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <FileImage className="size-6 text-black/20" />
            </div>
          )}
          {group.cover.isMain && (
            <span className="absolute left-2 top-2 rounded-lg bg-[#6354d4] px-2 py-1 text-[8px] font-bold text-[#ffd7a8] shadow-sm">PROJECT MAIN</span>
          )}
          {group.screens.length > 1 && (
            <span className="absolute left-2 bottom-2 flex items-center gap-1 rounded-lg bg-[#6354d4] px-2 py-1 text-[8px] font-bold text-[#e4dffc] shadow-sm">
              <Layers2 className="size-2.5" />
              {group.screens.length} grouped
            </span>
          )}
          <span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-white/90 text-black/55 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
            <Maximize2 className="size-3.5" />
          </span>
        </button>
        <button
          type="button"
          aria-pressed={allSelected}
          aria-label={allSelected ? "Deselect design" : "Select design"}
          onClick={() => {
            if (group.isCombined) {
              for (const screen of group.screens) onToggleSelect(screen.id);
            } else {
              onToggleSelect(group.cover.id);
            }
          }}
          className={`absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-lg border shadow-sm transition ${allSelected ? "border-[#6354d4] bg-[#6354d4] text-[#e4dffc]" : "border-black/10 bg-white/95 text-black/35"}`}
        >
          <Check className="size-3.5" />
        </button>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-xs font-semibold">{group.name}</p>
          {group.screens.length > 1 && (
            <span className="shrink-0 rounded-md bg-[#e4dffc] px-1.5 py-0.5 text-[8px] font-bold text-[#6354d4]">
              {group.screens.length}
            </span>
          )}
        </div>
        <p className="mt-1 text-[9px] text-black/35">
          {group.screens.length > 1
            ? `${group.screens.length} files grouped · Primary ${screenBreakpoint(group.cover)}${group.cover.width ? ` · ${Math.round(group.cover.width)}px` : ""}`
            : group.cover.width && group.cover.height
              ? `${screenBreakpoint(group.cover)} · ${Math.round(group.cover.width)} × ${Math.round(group.cover.height)}`
              : group.cover.type}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || Boolean(group.cover.isMain)}
            onClick={onSetMain}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-black/8 bg-black/[0.02] px-2 py-1.5 text-[9px] font-semibold text-black/55 transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="size-3 animate-spin" /> : <Star className={`size-3 ${group.cover.isMain ? "fill-current text-[#7c6cf0]" : ""}`} />}
            {group.cover.isMain ? "Project Main" : "Set Project Main"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            aria-label={`Delete ${group.name}`}
            className="flex size-8 items-center justify-center rounded-lg border border-black/8 text-black/40 transition hover:border-[#c45c3a]/30 hover:bg-[#fff1eb] hover:text-[#a14428] disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
