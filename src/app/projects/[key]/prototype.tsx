"use client";

import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Braces, Check, CheckCircle2,
  ChevronDown, CircleDashed, Code2, ExternalLink, FileCode2,
  GitBranch, Layers3, LoaderCircle, MessageSquareText, MousePointer2,
  PanelRightClose, Play, Plus, RefreshCw, Route, ShieldCheck, Sparkles, Workflow, X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { FigmaLiveImport } from "./figma-live-import";

type View = "prototype" | "map" | "spec" | "contract" | "figma";
type StepId = "review" | "approve" | "confirm" | "complete";
type Step = {
  id: StepId; number: string; label: string; frame: string; node: string;
  action: string; status: "documented" | "incomplete"; description: string;
};

const steps: Step[] = [
  { id: "review", number: "01", label: "Review Revision", frame: "Client review / Desktop", node: "48:102", action: "Reviewer opens magic link", status: "documented", description: "The current revision loads with feedback pins and an approval action." },
  { id: "approve", number: "02", label: "Start Approval", frame: "Client review / Desktop", node: "48:219", action: "Click Approve Revision", status: "incomplete", description: "The approval button opens a confirmation overlay." },
  { id: "confirm", number: "03", label: "Confirm Decision", frame: "Approval confirmation", node: "52:014", action: "Click Confirm Approval", status: "incomplete", description: "The reviewer confirms the exact revision and acceptance statement." },
  { id: "complete", number: "04", label: "Approval Complete", frame: "Approval recorded", node: "55:308", action: "System records approval", status: "documented", description: "The approved revision is locked and a handoff can be generated." },
];

const viewItems: { id: View; label: string; icon: typeof Play }[] = [
  { id: "prototype", label: "Prototype", icon: Play },
  { id: "map", label: "Process Map", icon: GitBranch },
  { id: "spec", label: "Screen Spec", icon: Layers3 },
  { id: "contract", label: "Developer Contract", icon: Code2 },
  { id: "figma", label: "Live Figma", icon: Workflow },
];

export function FigmaProcessPrototype({ initialFigmaFileKey }: { initialFigmaFileKey?: string | null }) {
  const [view, setView] = useState<View>(initialFigmaFileKey ? "figma" : "prototype");
  const [selectedId, setSelectedId] = useState<StepId>("approve");
  const [panelOpen, setPanelOpen] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const selectedIndex = steps.findIndex((step) => step.id === selectedId);
  const selected = steps[selectedIndex];
  const completion = useMemo(() => Math.round((steps.filter((step) => step.status === "documented").length / steps.length) * 100), []);

  function chooseStep(id: StepId) { setSelectedId(id); setToast(null); }
  function move(direction: -1 | 1) {
    const next = Math.min(Math.max(selectedIndex + direction, 0), steps.length - 1);
    setSelectedId(steps[next].id);
  }
  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }

  return (
    <main className="min-h-screen bg-[#efeaf8] text-[#17221f]">
      <header className="flex h-16 items-center border-b border-black/10 bg-[#faf8ff] px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link href="/prototypes" aria-label="Back to Prototypes" className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55 transition hover:bg-black/5"><ArrowLeft className="size-4" /></Link>
          <div className="hidden h-6 w-px bg-black/10 sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold">Acme website launch</span><span className="rounded-md bg-[#fff1c7] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#805f00]">Prototype</span></div>
            <p className="truncate text-xs text-black/40">Client approval process · Figma import</p>
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-xl bg-black/[0.045] p-1 md:flex">
          {viewItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => setView(item.id)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition ${view === item.id ? "bg-white text-black shadow-sm" : "text-black/45 hover:text-black/70"}`}><Icon className="size-3.5" />{item.label}</button>;
          })}
        </div>
        <div className="ml-4 flex flex-1 items-center justify-end gap-2">
          <button type="button" onClick={() => notify("Share link copied")} className="hidden rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-semibold shadow-sm transition hover:bg-black/[0.025] sm:block">Share Prototype</button>
          <button type="button" onClick={() => setPanelOpen((value) => !value)} aria-label="Toggle details panel" className={`flex size-9 items-center justify-center rounded-xl border transition ${panelOpen ? "border-[#1b806e]/20 bg-[#dff4ed] text-[#116b5c]" : "border-black/10 bg-white text-black/50"}`}><PanelRightClose className="size-4" /></button>
        </div>
      </header>

      <div className={`grid min-h-[calc(100vh-4rem)] grid-cols-1 ${panelOpen && view !== "figma" ? "xl:grid-cols-[252px_minmax(0,1fr)_340px]" : "xl:grid-cols-[252px_minmax(0,1fr)]"}`}>
        <aside className="border-r border-black/10 bg-[#f3f0ff] p-4 max-xl:hidden">
          <div className="mb-5 flex items-center justify-between px-1"><div><p className="text-xs font-semibold">Process steps</p><p className="mt-0.5 text-[11px] text-black/40">4 screens · 3 transitions</p></div><button type="button" aria-label="Add Process Step" className="flex size-7 items-center justify-center rounded-lg border border-black/10 bg-white text-black/50"><Plus className="size-3.5" /></button></div>
          <div className="space-y-1.5">
            {steps.map((step) => <button type="button" key={step.id} onClick={() => chooseStep(step.id)} className={`group w-full rounded-xl border p-3 text-left transition ${selectedId === step.id ? "border-[#7c6cf0]/25 bg-[#ebe6fa] shadow-[0_4px_16px_rgba(25,97,82,0.06)]" : "border-transparent hover:border-black/5 hover:bg-white"}`}><div className="flex items-start gap-3"><span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${selectedId === step.id ? "bg-[#6354d4] text-white" : "bg-black/5 text-black/40"}`}>{step.number}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{step.label}</p>{step.status === "incomplete" ? <CircleDashed className="size-3.5 shrink-0 text-[#c48713]" /> : <Check className="size-3.5 shrink-0 text-[#7c6cf0]" />}</div><p className="mt-1 truncate text-[10px] text-black/40">{step.frame}</p></div></div></button>)}
          </div>
          <div className="mt-6 rounded-2xl border border-black/8 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold">Documentation</p><span className="text-xs font-bold text-[#7c6cf0]">{completion}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#7c6cf0]" style={{ width: `${completion}%` }} /></div><p className="mt-3 text-[11px] leading-5 text-black/45">6 implementation decisions still need an owner.</p></div>
        </aside>

        <section className="min-w-0 p-3 sm:p-5">
          <div className="mb-3 flex items-center justify-between xl:hidden"><select value={view} onChange={(event) => setView(event.target.value as View)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">{viewItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><span className="text-xs text-black/45">Step {selectedIndex + 1} of {steps.length}</span></div>
          <div className="min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-[22px] border border-black/10 bg-[#fcfbff] shadow-[0_12px_40px_rgba(31,42,38,0.06)]">
            <WorkspaceToolbar onImport={() => notify("Figma prototype refreshed · 4 frames found")} onReset={() => setSelectedId("review")} view={view} />
            {view === "prototype" && <PrototypeCanvas selected={selected} onSelect={chooseStep} onMove={move} />}
            {view === "map" && <ProcessMap selectedId={selectedId} onSelect={chooseStep} />}
            {view === "spec" && <ScreenSpecification selected={selected} />}
            {view === "contract" && <DeveloperContract selected={selected} />}
            {view === "figma" && <FigmaLiveImport initialFileKey={initialFigmaFileKey} />}
          </div>
        </section>
        {panelOpen && view !== "figma" && <aside className="border-l border-black/10 bg-[#faf8ff] max-xl:border-t xl:min-h-[calc(100vh-4rem)]"><Inspector selected={selected} onNotify={notify} /></aside>}
      </div>
      {toast && <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#17221f] px-4 py-3 text-xs font-medium text-white shadow-2xl"><CheckCircle2 className="size-4 text-[#a594f5]" />{toast}</div>}
    </main>
  );
}

function WorkspaceToolbar({ onImport, onReset, view }: { onImport: () => void; onReset: () => void; view: View }) {
  return <div className="flex h-12 items-center justify-between border-b border-black/8 px-3 sm:px-4"><div className="flex items-center gap-2 text-xs text-black/45"><span className="font-semibold capitalize text-black/75">{view === "map" ? "Process Map" : view === "figma" ? "Live Figma" : view}</span><span>/</span><span className="hidden sm:inline">{view === "figma" ? "OAuth + REST API" : "Client approval flow"}</span></div>{view !== "figma" && <div className="flex items-center gap-2"><button type="button" onClick={onReset} className="flex size-8 items-center justify-center rounded-lg text-black/40 transition hover:bg-black/5" aria-label="Restart Flow"><RefreshCw className="size-3.5" /></button><button type="button" onClick={onImport} className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition hover:bg-black/[0.02]"><Workflow className="size-3.5" />Refresh Import</button></div>}</div>;
}

function PrototypeCanvas({ selected, onSelect, onMove }: { selected: Step; onSelect: (id: StepId) => void; onMove: (direction: -1 | 1) => void }) {
  return <div className="relative flex min-h-[calc(100vh-10.5rem)] flex-col bg-[#e7e9e5] p-4 sm:p-8">
    <div className="mx-auto mb-4 flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 text-[10px] font-medium text-black/50 shadow-sm backdrop-blur"><Workflow className="size-3 text-[#7551e8]" />Imported frame · {selected.frame}<span className="size-1 rounded-full bg-black/20" />Node {selected.node}</div>
    <div className="m-auto w-full max-w-[760px] overflow-hidden rounded-[18px] border border-black/15 bg-white shadow-[0_28px_80px_rgba(31,43,39,0.18)]">
      <MockBrowser />
      <div className="relative min-h-[455px] bg-[#f6f4ed] p-6 sm:p-10">
        <div className="mb-14 flex items-center justify-between"><div className="text-lg font-semibold tracking-[-0.04em]">Northstar</div><div className="flex items-center gap-5 text-[10px] font-medium text-black/45"><span>Overview</span><span>Feedback</span><span>Files</span><span className="rounded-full bg-[#6354d4] px-3 py-1.5 text-white">Review</span></div></div>
        {selected.id === "complete" ? <div className="mx-auto flex max-w-md flex-col items-center py-10 text-center"><div className="flex size-16 items-center justify-center rounded-full bg-[#e4dffc] text-[#6354d4]"><CheckCircle2 className="size-7" /></div><h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Approval recorded</h2><p className="mt-3 text-sm leading-6 text-black/50">Homepage revision 4 is now locked. The project team has been notified.</p><button type="button" className="mt-7 rounded-xl bg-[#6354d4] px-5 py-3 text-xs font-semibold text-white">View Project Handoff</button></div> : <>
          <div className="grid gap-8 sm:grid-cols-[1fr_240px]"><div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]"><span className="h-px w-5 bg-[#7c6cf0]" /> Homepage · Revision 4</div><h2 className="max-w-md text-4xl font-semibold leading-[1.03] tracking-[-0.055em]">Your clearest path to a confident launch.</h2><p className="mt-4 max-w-sm text-xs leading-5 text-black/45">A focused digital experience designed to turn complex decisions into measurable momentum.</p><div className="mt-6 flex gap-2"><span className="rounded-lg bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-white">Start a project</span><span className="rounded-lg border border-black/10 bg-white px-4 py-2.5 text-[10px] font-semibold">See our work</span></div></div><div className="relative min-h-52 overflow-hidden rounded-[18px] bg-[#ffd7a8] p-5"><div className="absolute -bottom-12 -right-10 size-40 rounded-full border-[24px] border-[#ef9f6d]" /><div className="absolute left-5 top-5 size-16 rounded-full bg-[#1c6256]" /><div className="absolute bottom-5 left-5 rounded-lg bg-white/85 px-3 py-2 text-[9px] font-semibold shadow-sm">Launch readiness +38%</div></div></div>
          <div className="mt-12 flex items-end justify-between border-t border-black/10 pt-5"><div><p className="text-[10px] text-black/35">2 of 2 comments resolved</p><div className="mt-2 flex -space-x-1.5"><Avatar text="RH" /><Avatar text="AC" /></div></div>{selected.id !== "confirm" && <button type="button" onClick={() => onSelect("confirm")} className={`relative flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-semibold text-white shadow-lg transition hover:-translate-y-0.5 ${selected.id === "approve" ? "bg-[#ea6e45]" : "bg-[#6354d4]"}`}>Approve Revision<ArrowRight className="size-3.5" />{selected.id === "approve" && <span className="absolute -inset-2 rounded-2xl border-2 border-[#ec754f]/50" />}</button>}</div>
        </>}
        {selected.id === "confirm" && <div className="absolute inset-0 flex items-center justify-center bg-[#17221f]/30 p-5 backdrop-blur-[2px]"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div className="flex size-10 items-center justify-center rounded-xl bg-[#e4dffc] text-[#6354d4]"><ShieldCheck className="size-5" /></div><button type="button" onClick={() => onSelect("approve")}><X className="size-4 text-black/35" /></button></div><h3 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Approve Revision 4?</h3><p className="mt-2 text-xs leading-5 text-black/50">I confirm this revision is approved for implementation and understand later changes require a new revision.</p><div className="mt-5 rounded-xl border border-black/8 bg-[#f3f0ff] p-3 text-[10px] text-black/50"><span className="font-semibold text-black/75">Approver</span><br />Alex Chen · alex@acme.co</div><button type="button" onClick={() => onSelect("complete")} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#ea6e45] px-4 py-3 text-xs font-semibold text-white">Confirm Approval <ArrowRight className="size-3.5" /></button></div></div>}
      </div>
    </div>
    <div className="mx-auto mt-5 flex items-center gap-2"><button type="button" onClick={() => onMove(-1)} className="flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55 shadow-sm"><ArrowLeft className="size-4" /></button><span className="min-w-24 text-center text-xs font-medium text-black/45">Step {steps.findIndex((item) => item.id === selected.id) + 1} of {steps.length}</span><button type="button" onClick={() => onMove(1)} className="flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55 shadow-sm"><ArrowRight className="size-4" /></button></div>
  </div>;
}

function MockBrowser() { return <div className="flex h-9 items-center gap-2 border-b border-black/8 bg-white px-3"><span className="size-2 rounded-full bg-[#ff786b]" /><span className="size-2 rounded-full bg-[#ffc65c]" /><span className="size-2 rounded-full bg-[#5dcf82]" /><div className="ml-3 flex h-5 flex-1 items-center rounded-md bg-black/[0.035] px-2 text-[8px] text-black/30">preview.passoff.dev/acme/homepage</div></div>; }
function Avatar({ text }: { text: string }) { return <span className="flex size-6 items-center justify-center rounded-full border-2 border-[#f6f4ed] bg-[#d8e5e0] text-[8px] font-bold text-[#31594f]">{text}</span>; }

function ProcessMap({ selectedId, onSelect }: { selectedId: StepId; onSelect: (id: StepId) => void }) {
  return <div className="min-h-[calc(100vh-10.5rem)] overflow-auto bg-[#f3f3ef] p-5 sm:p-6"><div className="mx-auto max-w-5xl"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">Imported flow 01</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">Client approval</h2><p className="mt-2 text-sm text-black/45">Solid paths came from Figma. Dashed paths need product decisions.</p></div><div className="rounded-xl border border-black/8 bg-white px-3 py-2 text-[10px] text-black/45"><span className="font-semibold text-black/70">4</span> screens · <span className="font-semibold text-[#b37200]">6</span> gaps</div></div>
    <div className="mt-14 grid min-w-[560px] grid-cols-[1fr_40px_1fr_40px_1fr_40px_1fr] items-center">{steps.map((step, index) => <div className="contents" key={step.id}><button type="button" onClick={() => onSelect(step.id)} className={`min-h-40 rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-1 ${selectedId === step.id ? "border-[#7c6cf0] bg-[#ebe6fa] ring-4 ring-[#7c6cf0]/8" : "border-black/10 bg-white"}`}><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-black/30">{step.number}</span>{step.status === "documented" ? <CheckCircle2 className="size-4 text-[#6354d4]" /> : <AlertTriangle className="size-4 text-[#c48713]" />}</div><p className="mt-7 text-xs font-semibold">{step.label}</p><p className="mt-2 text-[9px] leading-4 text-black/45">{step.description}</p></button>{index < steps.length - 1 && <div className="relative h-px bg-[#a594f5]"><ArrowRight className="absolute -right-1 -top-[7px] size-3.5 text-[#6354d4]" /></div>}</div>)}</div>
    <div className="mt-20 grid gap-4 sm:grid-cols-3"><MapStat icon={Workflow} label="Imported from Figma" value="9 interactions" tone="purple" /><MapStat icon={Sparkles} label="Pass-Off inferred" value="3 relationships" tone="green" /><MapStat icon={AlertTriangle} label="Needs definition" value="6 decisions" tone="amber" /></div></div></div>;
}

function MapStat({ icon: Icon, label, value, tone }: { icon: typeof Workflow; label: string; value: string; tone: "purple" | "green" | "amber" }) {
  const colors = { purple: "bg-[#ebe6fa] text-[#6354d4]", green: "bg-[#e4dffc] text-[#6354d4]", amber: "bg-[#fff0c9] text-[#9a6907]" };
  return <div className="flex items-center gap-3 rounded-2xl border border-black/8 bg-white p-4"><div className={`flex size-9 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="size-4" /></div><div><p className="text-[10px] text-black/40">{label}</p><p className="mt-0.5 text-xs font-semibold">{value}</p></div></div>;
}

function ScreenSpecification({ selected }: { selected: Step }) {
  const states = [["Default", "Linked", "figma"], ["Hover", "Linked", "figma"], ["Submitting", "Missing", "gap"], ["Success", selected.id === "complete" ? "Linked" : "Missing", selected.id === "complete" ? "figma" : "gap"], ["Permission denied", "Missing", "gap"], ["Expired link", "Missing", "gap"]];
  return <div className="min-h-[calc(100vh-10.5rem)] bg-[#f7f7f4] p-6 sm:p-10"><div className="mx-auto max-w-4xl"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">Screen Specification</p><div className="mt-3 flex items-end justify-between"><div><h2 className="text-3xl font-semibold tracking-[-0.045em]">{selected.label}</h2><p className="mt-2 text-sm text-black/45">{selected.frame} · Node {selected.node}</p></div><button type="button" className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold shadow-sm"><ExternalLink className="size-3.5" /> Open in Figma</button></div>
    <div className="mt-9 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="rounded-2xl border border-black/8 bg-white p-5"><h3 className="text-sm font-semibold">Interaction contract</h3><SpecRow label="Trigger" value={selected.action} icon={MousePointer2} /><SpecRow label="Destination" value={selected.id === "complete" ? "Developer handoff" : steps[Math.min(steps.findIndex((s) => s.id === selected.id) + 1, 3)].frame} icon={Route} /><SpecRow label="Actor" value={selected.id === "complete" ? "Pass-Off system" : "Client reviewer"} icon={ShieldCheck} /><SpecRow label="Data effect" value={selected.id === "complete" ? "Create approval + lock revision" : "Not documented"} icon={Braces} warning={selected.id !== "complete"} /></div>
    <div className="rounded-2xl border border-black/8 bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">UI states</h3><span className="text-[10px] text-black/35">2 of 6 linked</span></div><div className="mt-4 space-y-2">{states.map(([name, status, type]) => <div key={name} className="flex items-center justify-between rounded-xl bg-black/[0.025] px-3 py-2.5"><span className="text-xs font-medium">{name}</span><span className={`flex items-center gap-1 text-[10px] font-semibold ${type === "gap" ? "text-[#ae7410]" : "text-[#7c6cf0]"}`}>{type === "gap" ? <CircleDashed className="size-3" /> : <Check className="size-3" />}{status}</span></div>)}</div></div></div></div></div>;
}

function SpecRow({ label, value, icon: Icon, warning }: { label: string; value: string; icon: typeof MousePointer2; warning?: boolean }) { return <div className="mt-4 flex items-start gap-3 border-t border-black/6 pt-4"><div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.035] text-black/45"><Icon className="size-3.5" /></div><div><p className="text-[10px] font-medium uppercase tracking-wide text-black/35">{label}</p><p className={`mt-1 text-xs font-medium ${warning ? "text-[#ae7410]" : "text-black/75"}`}>{value}</p></div></div>; }

function DeveloperContract({ selected }: { selected: Step }) {
  return <div className="min-h-[calc(100vh-10.5rem)] bg-[#101714] p-5 text-[#eaf2ee] sm:p-8"><div className="mx-auto max-w-5xl"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#9b8cf5]">Generated implementation contract</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">{selected.label}</h2><p className="mt-2 font-mono text-xs text-white/35">figma://acme-launch/{selected.node}</p></div><span className="rounded-lg border border-[#efb450]/25 bg-[#efb450]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[#efc779]">DRAFT · 3 gaps</span></div>
    <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_.85fr]"><div className="overflow-hidden rounded-2xl border border-white/10 bg-[#17211d]"><div className="flex h-10 items-center gap-2 border-b border-white/8 px-4 text-[10px] text-white/40"><FileCode2 className="size-3.5" /> approval.contract.ts</div><pre className="overflow-auto p-5 font-mono text-[11px] leading-6 text-[#c8d8d1]"><code>{`transition: {
  from: "REVIEWABLE",
  to: "APPROVED",
  trigger: "${selected.action}",

  guards: [
    "share_link.active",
    "revision.is_current",
    // TODO: define approver identity rule
  ],

  writes: [
    "approvals.insert",
    "revisions.lock",
    "projects.update_status",
  ],

  sideEffects: [
    "notifications.send",
    // TODO: handoff generation timing
  ]
}`}</code></pre></div><div className="space-y-4"><ContractCard icon={CheckCircle2} title="Ready for implementation" items={["Source and destination frames", "Primary trigger", "Approved revision state"]} tone="green" /><ContractCard icon={AlertTriangle} title="Decisions required" items={["Expired-link behavior", "Concurrent approval handling", "Notification retry policy"]} tone="amber" /></div></div></div></div>;
}

function ContractCard({ icon: Icon, title, items, tone }: { icon: typeof CheckCircle2; title: string; items: string[]; tone: "green" | "amber" }) { return <div className="rounded-2xl border border-white/10 bg-[#17211d] p-4"><div className={`flex items-center gap-2 text-xs font-semibold ${tone === "green" ? "text-[#9b8cf5]" : "text-[#efc779]"}`}><Icon className="size-4" />{title}</div><div className="mt-4 space-y-2">{items.map((item) => <div key={item} className="flex items-start gap-2 text-[11px] leading-5 text-white/50"><span className={`mt-2 size-1 rounded-full ${tone === "green" ? "bg-[#9b8cf5]" : "bg-[#efc779]"}`} />{item}</div>)}</div></div>; }

function Inspector({ selected, onNotify }: { selected: Step; onNotify: (message: string) => void }) {
  const [searching, setSearching] = useState(false);
  return <div className="p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">Selected interaction</p><h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">{selected.label}</h2></div><span className="flex items-center gap-1 rounded-lg bg-[#ebe6fa] px-2 py-1 text-[9px] font-bold text-[#6546ca]"><Workflow className="size-3" /> IMPORTED</span></div><p className="mt-3 text-xs leading-5 text-black/45">{selected.description}</p>
    <div className="mt-5 rounded-xl border border-black/8 bg-white p-3"><div className="flex items-center justify-between"><span className="text-[10px] text-black/35">Figma node</span><span className="font-mono text-[10px] font-semibold">{selected.node}</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-black/35">Trigger</span><span className="text-[10px] font-semibold">On click</span></div><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-black/35">Transition</span><span className="text-[10px] font-semibold">Smart animate · 200ms</span></div></div>
    <div className="mt-6 flex items-center justify-between"><h3 className="text-xs font-semibold">Implementation details</h3><span className="text-[10px] text-[#b07408]">3 missing</span></div><div className="mt-3 space-y-2"><InspectorField label="Actor" value={selected.id === "complete" ? "Pass-Off system" : "Client reviewer"} complete /><InspectorField label="Preconditions" value="Revision is current and reviewable" complete /><InspectorField label="Data operation" value={selected.id === "complete" ? "Create approval and lock revision" : "Add Behavior"} complete={selected.id === "complete"} /><InspectorField label="Failure behavior" value="Add Behavior" /><InspectorField label="Analytics event" value="Add Event" /></div>
    <button type="button" onClick={() => { setSearching(true); window.setTimeout(() => { setSearching(false); onNotify("Pass-Off found 3 undocumented states"); }, 900); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#16131f] px-4 py-3 text-xs font-semibold text-white shadow-sm">{searching ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4 text-[#a594f5]" />}{searching ? "Analyzing Flow…" : "Find Missing Behavior"}</button>
    <div className="mt-6 border-t border-black/8 pt-5"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Open questions</h3><button type="button" className="text-[10px] font-semibold text-[#7c6cf0]">+ Add</button></div><div className="mt-3 rounded-xl border border-[#e8b659]/35 bg-[#fff5d9] p-3"><div className="flex gap-2"><MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-[#9c6b0b]" /><div><p className="text-[11px] font-semibold text-[#704c08]">What happens if another revision is published while this modal is open?</p><p className="mt-2 text-[9px] text-[#856424]">Unassigned · blocks approval API</p></div></div></div></div>
  </div>;
}

function InspectorField({ label, value, complete }: { label: string; value: string; complete?: boolean }) { return <button type="button" className="flex w-full items-center justify-between rounded-xl border border-black/7 bg-white px-3 py-2.5 text-left transition hover:border-black/15"><span className="text-[10px] text-black/40">{label}</span><span className={`flex items-center gap-1 text-[10px] font-semibold ${complete ? "text-black/70" : "text-[#ae7410]"}`}>{value}{complete ? <Check className="size-3 text-[#7c6cf0]" /> : <ChevronDown className="size-3" />}</span></button>; }
