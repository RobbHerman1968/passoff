"use client";

import { BookOpenText, GitBranch, LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { InteractiveScreenCanvas } from "@/app/projects/[key]/project-files/[fileKey]/handoff/interactive-canvas";
import { FIGMA_EXPLANATION_CATEGORY_LABELS } from "@/lib/figma/explanation-contract";
import type {
  FigmaExplanationCategory,
  FigmaExplanationRecord,
  FigmaImportResult,
  FigmaInteraction,
  FigmaScreen,
} from "@/lib/figma/types";

type PublicSnapshot = {
  version: number;
  project: { name: string; clientName: string };
  approvedRevision: {
    number: number;
    approvedAt: string;
    approverDisplayName: string;
  } | null;
  publishedByDisplayName: string;
  publishedAt: string;
  file: {
    key: string;
    name: string;
    figmaVersion: string;
    figmaLastModified: string;
    mainScreenId: string | null;
    breakpointGroups: Array<{
      id: string;
      name: string;
      primaryScreenId: string;
      memberScreenIds: string[];
    }>;
    screens: Array<{
      id: string;
      name: string;
      type: string;
      width: number | null;
      height: number | null;
      x: number | null;
      y: number | null;
      sortOrder: number;
      breakpointGroupId: string | null;
      preview: { url: string } | null;
      explanations: Array<{
        id: string;
        authorDisplayName: string;
        figmaNodeId: string | null;
        figmaNodeName: string | null;
        xBasisPoints: number;
        yBasisPoints: number;
        selectionWidthBasisPoints?: number | null;
        selectionHeightBasisPoints?: number | null;
        category: string;
        title: string;
        body: string;
        publishedAt: string;
      }>;
    }>;
    interactions: Array<{
      id: string;
      sourceNodeId: string;
      sourceNodeName: string;
      sourceScreenId: string;
      destinationNodeId: string | null;
      destinationScreenId: string | null;
      trigger: string;
      actions: unknown;
      sourceBounds: { x: number | null; y: number | null; width: number | null; height: number | null };
      sortOrder: number;
    }>;
  };
};

function isCategory(value: string): value is FigmaExplanationCategory {
  return value in FIGMA_EXPLANATION_CATEGORY_LABELS;
}

function unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f2f3ef] px-5 text-center text-[#17221f]">
      <div className="max-w-md rounded-[24px] border border-black/8 bg-white p-8 shadow-sm">
        <ShieldCheck className="mx-auto size-7 text-black/25" />
        <h1 className="mt-4 text-xl font-semibold">Developer handoff unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-black/50">This secure link is invalid, expired, or revoked. Ask the designer for a current link.</p>
      </div>
    </main>
  );
}

export function DeveloperHandoffViewer({ token }: { token: string }) {
  const [snapshot, setSnapshot] = useState<PublicSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedInteraction, setSelectedInteraction] = useState<FigmaInteraction | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/developer-handoff/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { snapshot?: PublicSnapshot };
        if (!response.ok || !payload.snapshot) throw new Error("Unavailable");
        return payload.snapshot;
      })
      .then((value) => {
        if (cancelled) return;
        setSnapshot(value);
        setSelectedId(value.file.mainScreenId ?? value.file.screens[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const result = useMemo<FigmaImportResult | null>(() => {
    if (!snapshot) return null;
    const groupById = new Map(snapshot.file.breakpointGroups.map((group) => [group.id, group]));
    const screens: FigmaScreen[] = snapshot.file.screens.map((screen) => {
      const group = screen.breakpointGroupId ? groupById.get(screen.breakpointGroupId) : null;
      return {
        id: screen.id,
        name: screen.name,
        type: screen.type,
        imageUrl: screen.preview?.url ?? null,
        width: screen.width,
        height: screen.height,
        x: screen.x,
        y: screen.y,
        interactionCount: snapshot.file.interactions.filter((item) => item.sourceScreenId === screen.id).length,
        isMain: snapshot.file.mainScreenId === screen.id,
        breakpointGroupId: screen.breakpointGroupId,
        breakpointGroupName: group?.name ?? null,
        isGroupPrimary: group?.primaryScreenId === screen.id,
      };
    });
    const interactions: FigmaInteraction[] = snapshot.file.interactions.map((item) => {
      const bounds = item.sourceBounds;
      const completeBounds =
        typeof bounds.x === "number"
        && typeof bounds.y === "number"
        && typeof bounds.width === "number"
        && typeof bounds.height === "number"
          ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
          : null;
      return {
        sourceNodeId: item.sourceNodeId,
        sourceNodeName: item.sourceNodeName,
        sourceScreenId: item.sourceScreenId,
        destinationNodeId: item.destinationNodeId,
        destinationScreenId: item.destinationScreenId,
        trigger: item.trigger,
        actions: Array.isArray(item.actions)
          ? item.actions.filter((action): action is string => typeof action === "string")
          : [],
        sourceBounds: completeBounds,
      };
    });
    return {
      file: {
        key: snapshot.file.key,
        name: snapshot.file.name,
        version: snapshot.file.figmaVersion,
        lastModified: snapshot.file.figmaLastModified,
        thumbnailUrl: null,
        mainScreenId: snapshot.file.mainScreenId,
      },
      screens,
      interactions,
      warnings: [],
    };
  }, [snapshot]);

  const selected = result?.screens.find((screen) => screen.id === selectedId) ?? result?.screens[0] ?? null;
  const explanations = useMemo<FigmaExplanationRecord[]>(() => {
    if (!snapshot || !selected) return [];
    const source = snapshot.file.screens.find((screen) => screen.id === selected.id);
    return (source?.explanations ?? []).map((item) => ({
      id: item.id,
      screenId: selected.id,
      screenName: selected.name,
      figmaNodeId: item.figmaNodeId,
      figmaNodeName: item.figmaNodeName,
      x: item.xBasisPoints / 100,
      y: item.yBasisPoints / 100,
      selectionWidth: item.selectionWidthBasisPoints == null ? null : item.selectionWidthBasisPoints / 100,
      selectionHeight: item.selectionHeightBasisPoints == null ? null : item.selectionHeightBasisPoints / 100,
      category: isCategory(item.category) ? item.category : "developer_note",
      title: item.title,
      body: item.body,
      status: "published",
      authorName: item.authorDisplayName,
      authorUserId: null,
      canEdit: false,
      canMoveToDraft: false,
      createdAt: item.publishedAt,
      updatedAt: item.publishedAt,
    }));
  }, [selected, snapshot]);
  const outgoing = useMemo(
    () => result?.interactions.filter((item) => item.sourceScreenId === selected?.id) ?? [],
    [result, selected?.id],
  );

  if (failed) return unavailable();
  if (!snapshot || !result) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f2f3ef]"><LoaderCircle className="size-6 animate-spin text-[#16857a]" /></main>;
  }
  if (!selected) return unavailable();

  const groupedIds = new Set(snapshot.file.breakpointGroups.flatMap((group) => group.memberScreenIds));
  const navigationGroups = [
    ...snapshot.file.breakpointGroups.map((group) => ({
      id: group.id,
      name: group.name,
      screens: group.memberScreenIds
        .map((id) => result.screens.find((screen) => screen.id === id))
        .filter((screen): screen is FigmaScreen => Boolean(screen)),
    })),
    {
      id: "ungrouped",
      name: "Screens",
      screens: result.screens.filter((screen) => !groupedIds.has(screen.id)),
    },
  ].filter((group) => group.screens.length > 0);

  return (
    <main className="flex min-h-screen flex-col bg-[#e9ece7] text-[#17221f]">
      <header className="border-b border-black/8 bg-[#faf8ff] px-4 py-4">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#16857a]">Developer handoff · Version {snapshot.version}</p>
            <h1 className="mt-1 text-xl font-semibold">{snapshot.project.name}</h1>
            <p className="mt-0.5 text-xs text-black/45">{snapshot.file.name} · Figma {snapshot.file.figmaVersion}</p>
          </div>
          <div className="text-right">
            <span className={`inline-flex rounded-lg px-2.5 py-1 text-[9px] font-bold ${snapshot.approvedRevision ? "bg-[#dff3ef] text-[#0f665d]" : "bg-black/5 text-black/45"}`}>
              {snapshot.approvedRevision ? `Approved revision ${snapshot.approvedRevision.number}` : "Not tied to client approval"}
            </span>
            <p className="mt-1.5 text-[9px] text-black/35">Published {new Date(snapshot.publishedAt).toLocaleString()} by {snapshot.publishedByDisplayName}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <nav aria-label="Handoff screens" className="border-b border-black/8 bg-white p-3 lg:border-b-0 lg:border-r">
          <div className="flex gap-4 overflow-auto lg:block lg:space-y-5">
            {navigationGroups.map((group) => (
              <section key={group.id} className="min-w-44">
                <h2 className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[0.14em] text-black/30">{group.name}</h2>
                <div className="space-y-1">
                  {group.screens.map((screen) => (
                    <button
                      type="button"
                      key={screen.id}
                      onClick={() => {
                        setSelectedId(screen.id);
                        setSelectedInteraction(null);
                      }}
                      className={`w-full rounded-xl px-3 py-2 text-left text-[10px] font-semibold ${screen.id === selected.id ? "bg-[#16857a] text-white" : "text-black/55 hover:bg-black/[0.04]"}`}
                    >
                      <span className="block truncate">{screen.name}</span>
                      <span className={`mt-0.5 block text-[8px] ${screen.id === selected.id ? "text-white/60" : "text-black/30"}`}>
                        {screen.width && screen.height ? `${screen.width} × ${screen.height}` : screen.type}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <section className="min-h-[560px] bg-[#dfe2dc]">
          <InteractiveScreenCanvas
            projectKey=""
            file={result.file}
            screen={selected}
            outgoing={outgoing}
            screens={result.screens}
            onNavigate={(screenId) => {
              if (result.screens.some((screen) => screen.id === screenId)) setSelectedId(screenId);
            }}
            onSelectHotspot={(_index, interaction) => setSelectedInteraction(interaction)}
            readOnly
            initialExplanations={explanations}
          />
        </section>

        <aside className="border-t border-white/10 bg-[#17221f] text-white lg:border-l lg:border-t-0">
          <section className="border-b border-white/10 p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#71d0c6]">
              <BookOpenText className="size-4" /> Published explanations
            </div>
            <h2 className="mt-2 text-sm font-semibold">{selected.name}</h2>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">
              {explanations.length ? explanations.map((item, index) => (
                <article key={item.id} className="rounded-xl bg-white/6 p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-[#16857a] text-[9px] font-bold">{index + 1}</span>
                    <div>
                      <p className="text-[8px] font-bold uppercase tracking-wide text-[#71d0c6]">{FIGMA_EXPLANATION_CATEGORY_LABELS[item.category]}</p>
                      <h3 className="mt-1 text-[11px] font-semibold">{item.title}</h3>
                      <p className="mt-1 whitespace-pre-wrap text-[10px] leading-4 text-white/60">{item.body}</p>
                      <p className="mt-2 text-[8px] text-white/30">{item.authorName}</p>
                    </div>
                  </div>
                </article>
              )) : <p className="text-[10px] leading-4 text-white/35">No published explanations on this screen.</p>}
            </div>
          </section>
          <section className="p-4">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a594f5]">
              <GitBranch className="size-4" /> Interaction flow
            </div>
            {selectedInteraction ? (
              <div className="mt-3 space-y-2 text-[10px]">
                <p className="rounded-xl bg-white/6 p-3"><span className="text-white/35">Trigger</span><strong className="mt-1 block">{selectedInteraction.trigger}</strong></p>
                <p className="rounded-xl bg-white/6 p-3"><span className="text-white/35">Action</span><strong className="mt-1 block">{selectedInteraction.actions.join(", ") || "Unnamed"}</strong></p>
                <p className="rounded-xl bg-white/6 p-3"><span className="text-white/35">Destination</span><strong className="mt-1 block">{result.screens.find((screen) => screen.id === selectedInteraction.destinationScreenId)?.name ?? "None"}</strong></p>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {outgoing.length ? outgoing.map((item, index) => (
                  <button key={`${item.sourceNodeId}-${index}`} type="button" onClick={() => setSelectedInteraction(item)} className="block w-full rounded-xl bg-white/6 p-3 text-left text-[10px] text-white/65 hover:bg-white/10">
                    <strong className="block text-white">{item.sourceNodeName}</strong>
                    <span className="mt-1 block">{item.trigger} → {result.screens.find((screen) => screen.id === item.destinationScreenId)?.name ?? "No destination"}</span>
                  </button>
                )) : <p className="text-[10px] leading-4 text-white/35">No outgoing prototype interactions.</p>}
              </div>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
