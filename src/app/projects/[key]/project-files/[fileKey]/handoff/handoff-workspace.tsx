"use client";

import {
  Code2,
  ExternalLink,
  FileImage,
  GitBranch,
  Layers3,
  Play,
  Ruler,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { InspectNode } from "@/lib/figma/inspect";
import type {
  FigmaImportResult,
  FigmaInteraction,
  FigmaQuestionRecord,
  FigmaScreen,
} from "@/lib/figma/types";
import { deriveBreakpointLabel } from "@/lib/figma/breakpoints";

import { InteractiveScreenCanvas } from "./interactive-canvas";
import { DeveloperHandoffPublisher } from "./developer-handoff-publisher";
import { HandoffRail } from "./panels";
import { DeveloperContractView, ProcessMapView, ScreenSpecView } from "./views";

type View = "prototype" | "map" | "spec" | "contract";
type RailTab = "inspect" | "comments" | "notes" | "ask" | "assets" | "behavior";

const viewItems: { id: View; label: string; icon: typeof Play }[] = [
  { id: "prototype", label: "Prototype", icon: Play },
  { id: "map", label: "Process Map", icon: GitBranch },
  { id: "spec", label: "Screen Spec", icon: Layers3 },
  { id: "contract", label: "Contract", icon: Code2 },
];

function designImageUnoptimized(src: string) {
  return src.startsWith("data:") || src.startsWith("/api/") || src.includes("figma.com") || src.includes("amazonaws.com");
}

export function HandoffWorkspace({
  projectKey,
  result,
  screen,
  siblingScreens,
  onClose,
  onNavigate,
  onSelectSibling,
}: {
  projectKey: string;
  result: FigmaImportResult;
  screen: FigmaScreen;
  siblingScreens: FigmaScreen[];
  onClose: () => void;
  onNavigate: (screenId: string) => void;
  onSelectSibling: (screenId: string) => void;
}) {
  const [view, setView] = useState<View>("prototype");
  const [railTab, setRailTab] = useState<RailTab>("inspect");
  const [inspectMode, setInspectMode] = useState(true);
  const [questions, setQuestions] = useState<FigmaQuestionRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [inspectTree, setInspectTree] = useState<InspectNode | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedHotspotIndex, setSelectedHotspotIndex] = useState<number | null>(null);
  const [selectedInteraction, setSelectedInteraction] = useState<FigmaInteraction | null>(null);

  const outgoing = useMemo(
    () => result.interactions.filter((interaction) => interaction.sourceScreenId === screen.id),
    [result.interactions, screen.id],
  );
  const incoming = useMemo(
    () => result.interactions.filter((interaction) => interaction.destinationScreenId === screen.id),
    [result.interactions, screen.id],
  );
  const nodeId = screen.id.replace(":", "-");

  useEffect(() => {
    setSelectedNodeId(null);
    setSelectedHotspotIndex(null);
    setSelectedInteraction(null);
    setInspectTree(null);
    setInspectError(null);
  }, [screen.id]);

  useEffect(() => {
    if (!result.designVersionId) return;
    let cancelled = false;
    async function loadQuestions() {
      const params = new URLSearchParams({
        fileKey: result.file.key,
        projectKey,
        designVersionId: result.designVersionId!,
      });
      const response = await fetch(`/api/integrations/figma/ask?${params}`, { cache: "no-store" });
      const payload = await response.json() as { questions?: FigmaQuestionRecord[] };
      if (!cancelled && response.ok) setQuestions(payload.questions ?? []);
    }
    void loadQuestions();
    return () => {
      cancelled = true;
    };
  }, [projectKey, result.designVersionId, result.file.key]);

  useEffect(() => {
    if (!result.designVersionId) return;
    let cancelled = false;
    async function loadTree() {
      setInspectLoading(true);
      setInspectError(null);
      try {
        const params = new URLSearchParams({
          fileKey: result.file.key,
          screenId: screen.id,
          projectKey,
          designVersionId: result.designVersionId!,
        });
        const response = await fetch(`/api/integrations/figma/nodes?${params}`, { cache: "no-store" });
        const payload = await response.json() as { tree?: InspectNode | null; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load inspect tree.");
        if (!cancelled) {
          setInspectTree(payload.tree ?? null);
          if (!payload.tree && payload.error) setInspectError(payload.error);
        }
      } catch (reason) {
        if (!cancelled) setInspectError(reason instanceof Error ? reason.message : "Unable to load inspect tree.");
      } finally {
        if (!cancelled) setInspectLoading(false);
      }
    }
    void loadTree();
    return () => {
      cancelled = true;
    };
  }, [projectKey, result.designVersionId, result.file.key, screen.id]);

  async function ask(value: string) {
    const trimmed = value.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      const response = await fetch("/api/integrations/figma/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey,
          designVersionId: result.designVersionId,
          fileKey: result.file.key,
          fileName: result.file.name,
          screenId: screen.id,
          screenName: screen.name,
          question: trimmed,
        }),
      });
      const payload = await response.json() as FigmaQuestionRecord | { error?: string };
      if (!response.ok || !("answer" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to analyze this screen.");
      }
      setQuestions((current) => [payload, ...current]);
      setQuestion("");
    } catch (reason) {
      setAskError(reason instanceof Error ? reason.message : "Unable to analyze this screen.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Handoff · ${screen.name}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#0c1412]/80 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-[#faf8ff] px-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">Handoff · {result.file.name}</p>
          <h2 className="truncate text-sm font-semibold text-[#17221f]">{screen.name}</h2>
        </div>
        <div className="hidden items-center gap-1 rounded-xl bg-black/[0.045] p-1 md:flex">
          {viewItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setView(item.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition ${view === item.id ? "bg-white text-black shadow-sm" : "text-black/45 hover:text-black/70"}`}
              >
                <Icon className="size-3.5" />{item.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={inspectMode}
          onClick={() => {
            setInspectMode((value) => !value);
            setRailTab("inspect");
          }}
          className={`hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold sm:flex ${inspectMode ? "border-[#7c6cf0]/30 bg-[#ebe6fa] text-[#6354d4]" : "border-black/10 bg-white text-black/55"}`}
        >
          <Ruler className="size-3.5" />Inspect
        </button>
        <a
          href={`https://www.figma.com/design/${result.file.key}?node-id=${encodeURIComponent(nodeId)}`}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1.5 rounded-xl border border-black/10 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-black/55 sm:flex"
        >
          <ExternalLink className="size-3.5" />Figma
        </a>
        <DeveloperHandoffPublisher projectId={projectKey} fileKey={result.file.key} />
        <button type="button" onClick={onClose} aria-label="Close Handoff" className="flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55">
          <X className="size-4" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        {siblingScreens.length > 1 && (
          <aside className="flex max-h-36 shrink-0 gap-2 overflow-auto border-b border-black/8 bg-white p-2 xl:h-full xl:max-h-none xl:w-48 xl:flex-col xl:border-b-0 xl:border-r">
            {siblingScreens.map((sibling) => {
              const selected = sibling.id === screen.id;
              return (
                <button
                  key={sibling.id}
                  type="button"
                  onClick={() => onSelectSibling(sibling.id)}
                  className={`min-w-[8.5rem] overflow-hidden rounded-xl border text-left xl:min-w-0 ${selected ? "border-[#7c6cf0]/45 bg-[#ebe6fa]" : "border-black/8 bg-[#faf8ff]"}`}
                >
                  <div className="relative aspect-[16/10] bg-[#e7e8e4]">
                    {sibling.imageUrl ? (
                      <Image
                        src={sibling.imageUrl}
                        alt=""
                        fill
                        className="object-cover object-top"
                        sizes="160px"
                        unoptimized={designImageUnoptimized(sibling.imageUrl)}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center"><FileImage className="size-4 text-black/20" /></div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="truncate text-[10px] font-semibold">{sibling.name}</p>
                    <p className="text-[9px] text-black/40">{deriveBreakpointLabel(sibling.width, sibling.name)}</p>
                  </div>
                </button>
              );
            })}
          </aside>
        )}

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#efeaf8]">
          <div className="shrink-0 border-b border-black/8 bg-white px-3 py-2 md:hidden">
            <select
              value={view}
              onChange={(event) => setView(event.target.value as View)}
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {viewItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>
          {view === "prototype" && (
            <div className="flex min-h-0 flex-1 flex-col p-0">
              <InteractiveScreenCanvas
                key={screen.id}
                projectKey={projectKey}
                designId={result.designId}
                designVersionId={result.designVersionId}
                file={result.file}
                screen={screen}
                outgoing={outgoing}
                screens={result.screens}
                onNavigate={onNavigate}
                inspectMode={inspectMode}
                inspectTree={inspectTree}
                selectedNodeId={selectedNodeId}
                onSelectNode={(node) => {
                  setSelectedNodeId(node?.id ?? null);
                  setRailTab("inspect");
                }}
                selectedHotspotIndex={selectedHotspotIndex}
                onSelectHotspot={(index, interaction) => {
                  setSelectedHotspotIndex(index);
                  setSelectedInteraction(interaction);
                  setRailTab("behavior");
                }}
              />
            </div>
          )}
          {view === "map" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <ProcessMapView
                result={result}
                screenId={screen.id}
                onSelect={onNavigate}
              />
            </div>
          )}
          {view === "spec" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <ScreenSpecView result={result} screen={screen} outgoing={outgoing} incoming={incoming} />
            </div>
          )}
          {view === "contract" && (
            <div className="min-h-0 flex-1 overflow-auto">
              <DeveloperContractView result={result} screen={screen} outgoing={outgoing} />
            </div>
          )}
        </section>

        <div className="min-h-[320px] shrink-0 xl:h-full xl:w-[340px] xl:min-h-0">
          <HandoffRail
            projectKey={projectKey}
            tab={railTab}
            setTab={setRailTab}
            result={result}
            screen={screen}
            questions={questions}
            question={question}
            setQuestion={setQuestion}
            asking={asking}
            askError={askError}
            onAsk={ask}
            interaction={selectedInteraction}
            inspectTree={inspectTree}
            inspectLoading={inspectLoading}
            inspectError={inspectError}
            selectedNodeId={selectedNodeId}
            onSelectNode={(node) => setSelectedNodeId(node?.id ?? null)}
          />
        </div>
      </div>
    </div>
  );
}
