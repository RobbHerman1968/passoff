"use client";

import {
  AlertTriangle,
  ArrowRight,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  MousePointer2,
  Route,
  Sparkles,
  Workflow,
} from "lucide-react";

import type { FigmaImportResult, FigmaInteraction, FigmaScreen } from "@/lib/figma/types";

export function ProcessMapView({
  result,
  screenId,
  onSelect,
}: {
  result: FigmaImportResult;
  screenId: string;
  onSelect: (screenId: string) => void;
}) {
  const screens = result.screens.filter((screen) => screen.imageUrl || result.interactions.some((item) => item.sourceScreenId === screen.id || item.destinationScreenId === screen.id));
  const list = screens.length ? screens : result.screens;
  const gaps = result.interactions.filter((item) => !item.destinationScreenId).length;

  return (
    <div className="min-h-[480px] overflow-auto bg-[#f3f3ef] p-5 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">Process map</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{result.file.name}</h2>
            <p className="mt-2 text-sm text-black/45">Paths from imported Figma prototype interactions.</p>
          </div>
          <div className="rounded-xl border border-black/8 bg-white px-3 py-2 text-[10px] text-black/45">
            <span className="font-semibold text-black/70">{list.length}</span> screens ·{" "}
            <span className="font-semibold text-[#b37200]">{gaps}</span> open ends
          </div>
        </div>
        <div className="mt-10 flex flex-wrap gap-3">
          {list.map((screen) => {
            const outgoing = result.interactions.filter((item) => item.sourceScreenId === screen.id).length;
            const selected = screen.id === screenId;
            return (
              <button
                type="button"
                key={screen.id}
                onClick={() => onSelect(screen.id)}
                className={`min-h-36 w-44 rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 ${selected ? "border-[#7c6cf0] bg-[#ebe6fa] ring-4 ring-[#7c6cf0]/8" : "border-black/10 bg-white"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-black/30">{screen.type}</span>
                  {outgoing > 0 ? <CheckCircle2 className="size-4 text-[#6354d4]" /> : <AlertTriangle className="size-4 text-[#c48713]" />}
                </div>
                <p className="mt-6 truncate text-xs font-semibold">{screen.name}</p>
                <p className="mt-2 text-[9px] text-black/45">{outgoing} outbound · {screen.width && screen.height ? `${Math.round(screen.width)}×${Math.round(screen.height)}` : "size n/a"}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-10 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-black/35">Transitions</p>
          {result.interactions.length ? result.interactions.slice(0, 40).map((interaction, index) => {
            const dest = result.screens.find((item) => item.id === interaction.destinationScreenId);
            return (
              <button
                type="button"
                key={`${interaction.sourceNodeId}-${index}`}
                onClick={() => onSelect(interaction.sourceScreenId)}
                className="flex w-full items-center gap-3 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-left text-[10px] transition hover:border-[#7c6cf0]/30"
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{interaction.sourceNodeName}</span>
                <span className="rounded-md bg-[#ebe6fa] px-2 py-1 font-semibold text-[#6354d4]">{interaction.trigger}</span>
                <ArrowRight className="size-3.5 shrink-0 text-[#7c6cf0]" />
                <span className="min-w-0 flex-1 truncate font-semibold">{dest?.name || interaction.destinationScreenId || "No destination"}</span>
              </button>
            );
          }) : (
            <p className="rounded-xl border border-dashed border-black/15 bg-white/50 px-4 py-8 text-center text-xs text-black/40">No prototype interactions imported.</p>
          )}
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          <Stat icon={Workflow} label="Imported interactions" value={`${result.interactions.length}`} />
          <Stat icon={Sparkles} label="Screens with previews" value={`${result.screens.filter((s) => s.imageUrl).length}`} />
          <Stat icon={AlertTriangle} label="Missing destinations" value={`${gaps}`} />
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Workflow; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white p-4">
      <div className="flex size-9 items-center justify-center rounded-xl bg-[#ebe6fa] text-[#6354d4]"><Icon className="size-4" /></div>
      <div>
        <p className="text-[10px] text-black/40">{label}</p>
        <p className="mt-0.5 text-xs font-semibold">{value}</p>
      </div>
    </div>
  );
}

export function ScreenSpecView({
  result,
  screen,
  outgoing,
  incoming,
}: {
  result: FigmaImportResult;
  screen: FigmaScreen;
  outgoing: FigmaInteraction[];
  incoming: FigmaInteraction[];
}) {
  const nodeId = screen.id.replace(":", "-");
  return (
    <div className="min-h-[480px] overflow-auto bg-[#f7f7f4] p-6 sm:p-8">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">Screen specification</p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">{screen.name}</h2>
            <p className="mt-2 text-sm text-black/45">
              {screen.type} · Node {screen.id}
              {screen.width && screen.height ? ` · ${Math.round(screen.width)} × ${Math.round(screen.height)}` : ""}
            </p>
          </div>
          <a
            href={`https://www.figma.com/design/${result.file.key}?node-id=${encodeURIComponent(nodeId)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold shadow-sm"
          >
            <ExternalLink className="size-3.5" /> Open in Figma
          </a>
        </div>
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/8 bg-white p-5">
            <h3 className="text-sm font-semibold">Outbound interactions</h3>
            {outgoing.length ? outgoing.map((interaction, index) => {
              const dest = result.screens.find((item) => item.id === interaction.destinationScreenId);
              return (
                <div key={`${interaction.sourceNodeId}-${index}`} className="mt-4 border-t border-black/6 pt-4">
                  <SpecRow label="Trigger" value={interaction.trigger} icon={MousePointer2} />
                  <SpecRow label="Source" value={interaction.sourceNodeName} icon={Braces} />
                  <SpecRow label="Destination" value={dest?.name || interaction.destinationScreenId || "Missing"} icon={Route} warning={!dest} />
                  <SpecRow label="Actions" value={interaction.actions.join(", ") || "Unnamed"} icon={Check} />
                </div>
              );
            }) : (
              <p className="mt-4 text-xs text-black/40">No outbound prototype paths on this screen.</p>
            )}
          </div>
          <div className="rounded-2xl border border-black/8 bg-white p-5">
            <h3 className="text-sm font-semibold">Inbound · {incoming.length}</h3>
            <div className="mt-4 space-y-2">
              {incoming.length ? incoming.map((interaction, index) => (
                <div key={`${interaction.sourceNodeId}-in-${index}`} className="rounded-xl bg-black/[0.025] px-3 py-2.5 text-[11px]">
                  <p className="font-semibold">{interaction.sourceNodeName}</p>
                  <p className="mt-1 text-black/45">{interaction.trigger}</p>
                </div>
              )) : (
                <p className="text-xs text-black/40">Nothing navigates here yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpecRow({
  label,
  value,
  icon: Icon,
  warning,
}: {
  label: string;
  value: string;
  icon: typeof MousePointer2;
  warning?: boolean;
}) {
  return (
    <div className="mt-3 flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.035] text-black/45"><Icon className="size-3.5" /></div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-black/35">{label}</p>
        <p className={`mt-1 text-xs font-medium ${warning ? "text-[#ae7410]" : "text-black/75"}`}>{value}</p>
      </div>
    </div>
  );
}

export function DeveloperContractView({
  result,
  screen,
  outgoing,
}: {
  result: FigmaImportResult;
  screen: FigmaScreen;
  outgoing: FigmaInteraction[];
}) {
  const lines = [
    `// Auto-derived from ${result.file.name}`,
    `export const screenContract = {`,
    `  id: ${JSON.stringify(screen.id)},`,
    `  name: ${JSON.stringify(screen.name)},`,
    `  size: ${screen.width && screen.height ? `{ width: ${Math.round(screen.width)}, height: ${Math.round(screen.height)} }` : "null"},`,
    `  interactions: [`,
    ...outgoing.flatMap((interaction, index) => [
      `    {`,
      `      id: ${JSON.stringify(`${interaction.sourceNodeId}-${index}`)},`,
      `      trigger: ${JSON.stringify(interaction.trigger)},`,
      `      source: ${JSON.stringify(interaction.sourceNodeName)},`,
      `      destination: ${JSON.stringify(interaction.destinationScreenId)},`,
      `      actions: ${JSON.stringify(interaction.actions)},`,
      `      // TODO: document loading, error, and empty states`,
      `      // TODO: document data dependencies / API effects`,
      `    },`,
    ]),
    `  ],`,
    `} as const;`,
  ];

  return (
    <div className="min-h-[480px] overflow-auto bg-[#111c19] p-6 sm:p-8 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]">
          <Code2 className="size-4" /> Developer contract
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{screen.name}</h2>
        <p className="mt-2 text-sm text-white/45">Read-only checklist derived from imported interactions. Editable approval contracts come later.</p>
        <pre className="mt-6 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[11px] leading-5 text-[#a594f5]/90">
          {lines.join("\n")}
        </pre>
        <ul className="mt-6 space-y-2 text-[11px] text-white/55">
          <li className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-[#7c6cf0]" /> Prototype triggers and destinations imported from Figma.</li>
          <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#efc779]" /> Loading, permission, and failure states still need product owners.</li>
          <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[#efc779]" /> Data effects and API contracts are not inferred yet.</li>
        </ul>
      </div>
    </div>
  );
}
