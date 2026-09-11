"use client";

import {
  BookOpenText,
  Check,
  ClipboardCopy,
  Download,
  LoaderCircle,
  MessageCircleQuestion,
  Send,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  buildFigmaExplanationsUrl,
  FIGMA_EXPLANATION_CATEGORY_LABELS,
} from "@/lib/figma/explanation-contract";
import {
  flattenInspectNodes,
  inspectNodeToCss,
  type InspectNode,
} from "@/lib/figma/inspect";
import type {
  FigmaImportResult,
  FigmaInteraction,
  FigmaExplanationRecord,
  FigmaQuestionRecord,
  FigmaScreen,
} from "@/lib/figma/types";

import { ScreenCommentsPanel } from "./interactive-canvas";
import { explanationsUpdatedEvent, focusExplanationEvent } from "./events";

export function AskPanel({
  inputId,
  result,
  selected,
  questions,
  question,
  setQuestion,
  asking,
  error,
  onAsk,
}: {
  inputId: string;
  result: FigmaImportResult;
  selected: FigmaScreen | null;
  questions: FigmaQuestionRecord[];
  question: string;
  setQuestion: (value: string) => void;
  asking: boolean;
  error: string | null;
  onAsk: (value: string) => void;
}) {
  const selectedQuestions = questions.filter((item) => item.screenId === selected?.id);
  const suggestions = ["What happens after this screen?", "Which states are missing?", "What data and API behavior are needed?"];
  return (
    <div className="min-w-0 text-white">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">
          <MessageCircleQuestion className="size-4" /> Ask Pass-Off
        </div>
        <h3 className="mt-2 truncate text-sm font-semibold">{selected?.name || "Select a screen"}</h3>
        <p className="mt-1 text-[10px] text-white/40">Answers use {result.interactions.length} imported prototype relationships.</p>
      </div>
      <div className="max-h-[360px] space-y-3 overflow-auto p-3">
        {selectedQuestions.length ? selectedQuestions.map((item) => (
          <div key={item.id} className="space-y-2">
            <div className="ml-6 rounded-2xl rounded-tr-sm bg-[#7c6cf0] px-3 py-2 text-[11px] leading-5">{item.question}</div>
            <div className="mr-3 rounded-2xl rounded-tl-sm bg-white/8 px-3 py-2.5">
              <p className="text-[11px] leading-5 text-white/80">{item.answer}</p>
              {item.gaps.length > 0 && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-[#efc779]">Handoff gaps</p>
                  {item.gaps.map((gap) => <p key={gap} className="mt-1 text-[10px] leading-4 text-white/50">• {gap}</p>)}
                </div>
              )}
            </div>
          </div>
        )) : (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto size-6 text-[#a594f5]" />
            <p className="mt-3 text-xs font-semibold">Ask about this screen</p>
            <p className="mt-1 text-[10px] leading-4 text-white/40">Transitions, missing states, and data contracts.</p>
          </div>
        )}
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              type="button"
              disabled={!selected || asking}
              onClick={() => onAsk(suggestion)}
              key={suggestion}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[9px] text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              {suggestion}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mb-2 text-[10px] leading-4 text-[#f3c56f]">{error}</p>}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onAsk(question);
          }}
          className="flex gap-2"
        >
          <label className="sr-only" htmlFor={inputId}>Ask a question</label>
          <textarea
            id={inputId}
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            disabled={!selected || asking}
            placeholder="Ask what the design does not explain…"
            className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-[#a594f5]/50"
          />
          <button type="submit" aria-label="Ask Question" disabled={!selected || !question.trim() || asking} className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-[#a594f5] text-[#17221f] disabled:opacity-35">
            {asking ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}

export function BehaviorPanel({
  screen,
  interaction,
  destinationName,
}: {
  screen: FigmaScreen;
  interaction: FigmaInteraction | null;
  destinationName: string | null;
}) {
  return (
    <div className="space-y-3 p-4 text-white">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">Behavior</p>
        <h3 className="mt-1 text-sm font-semibold">{interaction?.sourceNodeName || screen.name}</h3>
      </div>
      {interaction ? (
        <div className="space-y-2 text-[11px]">
          <Row label="Trigger" value={interaction.trigger} />
          <Row label="Actions" value={interaction.actions.join(", ") || "Unnamed"} />
          <Row label="Destination" value={destinationName || interaction.destinationScreenId || "None"} />
          {interaction.sourceBounds && (
            <Row
              label="Hotspot"
              value={`${Math.round(interaction.sourceBounds.width)} × ${Math.round(interaction.sourceBounds.height)}`}
            />
          )}
        </div>
      ) : (
        <p className="text-[11px] leading-5 text-white/45">Select a purple hotspot on the prototype to inspect its trigger and destination.</p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-white/35">{label}</p>
      <p className="mt-1 font-medium text-white/80">{value}</p>
    </div>
  );
}

export function InspectPanel({
  tree,
  loading,
  error,
  selectedNodeId,
  onSelectNode,
}: {
  tree: InspectNode | null;
  loading: boolean;
  error: string | null;
  selectedNodeId: string | null;
  onSelectNode: (node: InspectNode | null) => void;
}) {
  const [copied, setCopied] = useState(false);
  const layers = useMemo(() => (tree ? flattenInspectNodes(tree).slice(0, 200) : []), [tree]);
  const selected = tree && selectedNodeId ? layers.find((node) => node.id === selectedNodeId) ?? null : null;
  const css = selected ? inspectNodeToCss(selected) : "";

  async function copyCss() {
    if (!css) return;
    await navigator.clipboard.writeText(css);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="min-w-0 text-white">
      <div className="border-b border-white/10 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">Inspect</p>
        <h3 className="mt-1 text-sm font-semibold">{selected?.name || "Select a layer"}</h3>
        {selected && <p className="mt-0.5 font-mono text-[9px] text-white/35">{selected.type} · {selected.id}</p>}
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><LoaderCircle className="size-5 animate-spin text-white/35" /></div>
      ) : error ? (
        <p role="alert" className="m-3 rounded-xl bg-[#2e2654]/70 p-3 text-[10px] leading-4">{error}</p>
      ) : !tree ? (
        <p className="p-4 text-[11px] leading-5 text-white/45">No inspect tree for this screen yet. Re-import via the plugin or connect Figma to backfill.</p>
      ) : (
        <>
          {selected && (
            <div className="space-y-2 border-b border-white/10 p-3 text-[11px]">
              <Row label="Size" value={`${Math.round(selected.width)} × ${Math.round(selected.height)}`} />
              <Row label="Position" value={`${Math.round(selected.x)}, ${Math.round(selected.y)}`} />
              {selected.padding && (
                <Row
                  label="Padding"
                  value={`${selected.padding.top}/${selected.padding.right}/${selected.padding.bottom}/${selected.padding.left}`}
                />
              )}
              {selected.fills[0]?.color && (
                <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
                  <span className="size-5 rounded border border-white/20" style={{ background: selected.fills[0].color }} />
                  <div>
                    <p className="text-[9px] uppercase tracking-wide text-white/35">Fill</p>
                    <p className="font-mono text-[10px]">{selected.fills[0].color}</p>
                  </div>
                </div>
              )}
              {selected.text && (
                <Row
                  label="Type"
                  value={[selected.text.fontFamily, selected.text.fontSize ? `${selected.text.fontSize}px` : null, selected.text.fontWeight].filter(Boolean).join(" · ")}
                />
              )}
              <button
                type="button"
                onClick={() => void copyCss()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2 text-[10px] font-semibold hover:bg-white/12"
              >
                {copied ? <Check className="size-3.5 text-[#a594f5]" /> : <ClipboardCopy className="size-3.5" />}
                {copied ? "Copied CSS" : "Copy CSS"}
              </button>
              <pre className="overflow-auto rounded-xl bg-black/30 p-2 font-mono text-[9px] leading-4 text-white/70">{css}</pre>
            </div>
          )}
          <div className="max-h-[280px] overflow-auto p-2">
            <p className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-white/35">Layers</p>
            {layers.map((node) => (
              <button
                type="button"
                key={node.id}
                onClick={() => onSelectNode(node)}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] transition ${selectedNodeId === node.id ? "bg-[#7c6cf0]/25 text-white" : "text-white/65 hover:bg-white/8"}`}
              >
                <span className="min-w-0 truncate font-medium">{node.name}</span>
                <span className="shrink-0 font-mono text-[8px] text-white/30">{node.type}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AssetsPanel({
  projectKey,
  fileKey,
  screen,
  selectedNode,
}: {
  projectKey: string;
  fileKey: string;
  screen: FigmaScreen;
  selectedNode: InspectNode | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nodeId = selectedNode?.id || screen.id;

  async function download(format: "png" | "svg", scale: 1 | 2 = 1) {
    setBusy(`${format}-${scale}`);
    setError(null);
    try {
      const params = new URLSearchParams({ projectKey, fileKey, nodeId, format, scale: String(scale) });
      const response = await fetch(`/api/integrations/figma/assets?${params}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "Export failed.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${(selectedNode?.name || screen.name).replace(/[^\w.-]+/g, "-")}.${format}`;
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to export.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 p-4 text-white">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">Assets</p>
        <h3 className="mt-1 truncate text-sm font-semibold">{selectedNode?.name || screen.name}</h3>
        <p className="mt-1 text-[10px] text-white/40">Exports use the connected Figma account.</p>
      </div>
      {error && <p role="alert" className="rounded-xl bg-[#2e2654]/70 p-2 text-[10px]">{error}</p>}
      <div className="grid gap-2">
        <ExportButton label="PNG @1x" busy={busy === "png-1"} onClick={() => void download("png", 1)} />
        <ExportButton label="PNG @2x" busy={busy === "png-2"} onClick={() => void download("png", 2)} />
        <ExportButton label="SVG" busy={busy === "svg-1"} onClick={() => void download("svg", 1)} />
        {screen.imageUrl && (
          <a
            href={screen.imageUrl}
            download={`${screen.name.replace(/[^\w.-]+/g, "-")}.png`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-[10px] font-semibold hover:bg-white/12"
          >
            <Download className="size-3.5" />Screen preview PNG
          </a>
        )}
      </div>
    </div>
  );
}

function ExportButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-[10px] font-semibold hover:bg-white/12 disabled:opacity-50"
    >
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {label}
    </button>
  );
}

export function ScreenExplanationsPanel({
  projectKey,
  designVersionId,
  file,
  screen,
}: {
  projectKey: string;
  designVersionId: string;
  file: FigmaImportResult["file"];
  screen: FigmaScreen;
}) {
  const [explanations, setExplanations] = useState<FigmaExplanationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadExplanations() {
      try {
        const response = await fetch(
          buildFigmaExplanationsUrl(projectKey, file.key, screen.id, designVersionId),
          { cache: "no-store" },
        );
        const payload = await response.json() as { explanations?: FigmaExplanationRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load explanations.");
        if (active) {
          setExplanations(payload.explanations ?? []);
          setError(null);
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load explanations.");
      } finally {
        if (active) setLoading(false);
      }
    }
    function explanationsChanged(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id) void loadExplanations();
    }
    void loadExplanations();
    window.addEventListener(explanationsUpdatedEvent, explanationsChanged);
    return () => {
      active = false;
      window.removeEventListener(explanationsUpdatedEvent, explanationsChanged);
    };
  }, [designVersionId, file.key, projectKey, screen.id]);

  const published = explanations.filter((item) => item.status === "published");
  const drafts = explanations.filter((item) => item.status === "draft");

  function focus(explanationId: string) {
    window.dispatchEvent(new CustomEvent(focusExplanationEvent, {
      detail: { fileKey: file.key, screenId: screen.id, explanationId },
    }));
  }

  function group(label: string, items: FigmaExplanationRecord[]) {
    if (!items.length) return null;
    return (
      <section>
        <p className="mb-2 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/35">{label}</p>
        <div className="space-y-2">
          {items.map((explanation) => {
            const pinNumber = explanations.findIndex((item) => item.id === explanation.id) + 1;
            return (
              <button
                type="button"
                key={explanation.id}
                onClick={() => focus(explanation.id)}
                className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 text-left transition hover:border-[#4ab7ac]/45 hover:bg-white/8"
              >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg border-2 border-white/70 text-[10px] font-bold text-white ${explanation.status === "draft" ? "bg-[#52706b] ring-1 ring-[#f3c56f]" : "bg-[#16857a]"}`}>{pinNumber}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[8px] font-bold uppercase tracking-wide text-[#71d0c6]">{FIGMA_EXPLANATION_CATEGORY_LABELS[explanation.category]}</span>
                  <strong className="mt-1 block truncate text-[10px]">{explanation.title}</strong>
                  <span className="mt-1 line-clamp-3 block whitespace-pre-wrap text-[10px] leading-4 text-white/55">{explanation.body}</span>
                  <span className="mt-1.5 block text-[8px] text-white/30">{explanation.authorName}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="min-w-0 text-white">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#71d0c6]">
          <BookOpenText className="size-4" /> Design notes
        </div>
        <h3 className="mt-2 truncate text-sm font-semibold">{screen.name}</h3>
        <p className="mt-1 text-[10px] leading-4 text-white/40">Explanations document durable design and implementation intent. Comments request changes or start a conversation.</p>
      </div>
      <div className="max-h-[560px] space-y-5 overflow-auto p-3">
        {loading ? (
          <div className="flex justify-center py-12"><LoaderCircle className="size-5 animate-spin text-white/35" /></div>
        ) : error ? (
          <p role="alert" className="rounded-xl bg-[#2e2654]/70 p-3 text-[10px] leading-4">{error}</p>
        ) : explanations.length ? (
          <>
            {group("Published", published)}
            {group("Your drafts", drafts)}
          </>
        ) : (
          <div className="py-10 text-center">
            <BookOpenText className="mx-auto size-6 text-white/25" />
            <p className="mt-3 text-xs font-semibold text-white/65">No design notes yet</p>
            <p className="mx-auto mt-1 max-w-[230px] text-[10px] leading-4 text-white/35">Use Explain on the canvas for durable intent. Use Comment when you want a change or reply.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function HandoffRail({
  projectKey,
  tab,
  setTab,
  result,
  screen,
  questions,
  question,
  setQuestion,
  asking,
  askError,
  onAsk,
  interaction,
  inspectTree,
  inspectLoading,
  inspectError,
  selectedNodeId,
  onSelectNode,
}: {
  projectKey: string;
  tab: "inspect" | "comments" | "notes" | "ask" | "assets" | "behavior";
  setTab: (tab: "inspect" | "comments" | "notes" | "ask" | "assets" | "behavior") => void;
  result: FigmaImportResult;
  screen: FigmaScreen;
  questions: FigmaQuestionRecord[];
  question: string;
  setQuestion: (value: string) => void;
  asking: boolean;
  askError: string | null;
  onAsk: (value: string) => void;
  interaction: FigmaInteraction | null;
  inspectTree: InspectNode | null;
  inspectLoading: boolean;
  inspectError: string | null;
  selectedNodeId: string | null;
  onSelectNode: (node: InspectNode | null) => void;
}) {
  const destination = interaction?.destinationScreenId
    ? result.screens.find((item) => item.id === interaction.destinationScreenId)?.name ?? null
    : null;
  const selectedNode = inspectTree && selectedNodeId
    ? flattenInspectNodes(inspectTree).find((node) => node.id === selectedNodeId) ?? null
    : null;

  const tabs = [
    { id: "inspect" as const, label: "Inspect" },
    { id: "behavior" as const, label: "Behavior" },
    { id: "comments" as const, label: "Comments" },
    { id: "notes" as const, label: "Notes" },
    { id: "ask" as const, label: "Ask" },
    { id: "assets" as const, label: "Assets" },
  ];

  return (
    <aside className="flex h-full min-h-0 flex-col bg-[#17221f] text-white xl:border-l xl:border-white/8">
      <div role="tablist" aria-label="Handoff tools" className="grid grid-cols-6 gap-1 border-b border-white/10 bg-[#111c19] p-1.5">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`rounded-lg px-1 py-2 text-[9px] font-semibold transition ${tab === item.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/70"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "inspect" && (
          <InspectPanel
            tree={inspectTree}
            loading={inspectLoading}
            error={inspectError}
            selectedNodeId={selectedNodeId}
            onSelectNode={onSelectNode}
          />
        )}
        {tab === "behavior" && <BehaviorPanel screen={screen} interaction={interaction} destinationName={destination} />}
        {tab === "comments" && result.designVersionId && <ScreenCommentsPanel projectKey={projectKey} designVersionId={result.designVersionId} file={result.file} screen={screen} />}
        {tab === "notes" && result.designVersionId && <ScreenExplanationsPanel projectKey={projectKey} designVersionId={result.designVersionId} file={result.file} screen={screen} />}
        {tab === "ask" && (
          <AskPanel
            inputId="handoff-ask"
            result={result}
            selected={screen}
            questions={questions}
            question={question}
            setQuestion={setQuestion}
            asking={asking}
            error={askError}
            onAsk={onAsk}
          />
        )}
        {tab === "assets" && <AssetsPanel projectKey={projectKey} fileKey={result.file.key} screen={screen} selectedNode={selectedNode} />}
      </div>
    </aside>
  );
}
