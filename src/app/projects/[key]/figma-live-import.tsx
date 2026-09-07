"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Check,
  ExternalLink,
  GitBranch,
  LoaderCircle,
  LogOut,
  Maximize2,
  MessageCircleQuestion,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Plus,
  PlugZap,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FigmaImportClientError, streamFigmaImport } from "@/lib/figma/import-client";
import type { FigmaCommentRecord, FigmaConnectionStatus, FigmaImportProgress, FigmaImportResult, FigmaQuestionRecord, FigmaRateLimitDetails, FigmaSavedImportSummary, FigmaScreen } from "@/lib/figma/types";

const setupVariables = [
  "FIGMA_CLIENT_ID",
  "FIGMA_CLIENT_SECRET",
  "FIGMA_REDIRECT_URI",
  "FIGMA_TOKEN_ENCRYPTION_KEY",
];

const commentsUpdatedEvent = "passoff:figma-comments-updated";
const focusCommentEvent = "passoff:figma-comment-focus";

function notifyCommentsUpdated(fileKey: string, screenId: string) {
  window.dispatchEvent(new CustomEvent(commentsUpdatedEvent, { detail: { fileKey, screenId } }));
}

export function FigmaLiveImport({ initialFileKey }: { initialFileKey?: string | null }) {
  const [status, setStatus] = useState<FigmaConnectionStatus | null>(null);
  const [savedImports, setSavedImports] = useState<FigmaSavedImportSummary[]>([]);
  const [fileUrl, setFileUrl] = useState("");
  const [result, setResult] = useState<FigmaImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<FigmaImportProgress | null>(null);
  const [rateLimit, setRateLimit] = useState<FigmaRateLimitDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const queryError = new URLSearchParams(window.location.search).get("figma_error");
    async function initialize() {
      try {
        const statusResponse = await fetch("/api/integrations/figma/status", { cache: "no-store" });
        if (!statusResponse.ok) throw new Error("Unable to read the Figma connection status.");
        const nextStatus = await statusResponse.json() as FigmaConnectionStatus;
        setStatus(nextStatus);
        if (queryError) setError(queryError);

        // Saved files come from plugin or API imports and must load even when OAuth is disconnected.
        const importsResponse = await fetch("/api/integrations/figma/import", { cache: "no-store" });
        const importsPayload = await importsResponse.json() as { imports?: FigmaSavedImportSummary[]; error?: string };
        if (!importsResponse.ok) throw new Error(importsPayload.error || "Unable to load saved imports.");
        const imports = importsPayload.imports ?? [];
        setSavedImports(imports);
        const fileKey = initialFileKey || imports[0]?.fileKey;
        if (fileKey) {
          setLoading(true);
          try {
            await openSavedImport(fileKey);
          } finally {
            setLoading(false);
          }
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load Figma status.");
        setLoading(false);
      }
    }
    void initialize();
  }, [initialFileKey]);

  async function refreshSavedImports() {
    const response = await fetch("/api/integrations/figma/import", { cache: "no-store" });
    const payload = await response.json() as { imports?: FigmaSavedImportSummary[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load saved imports.");
    setSavedImports(payload.imports ?? []);
  }

  async function openSavedImport(fileKey: string) {
    const response = await fetch(`/api/integrations/figma/import?fileKey=${encodeURIComponent(fileKey)}`, { cache: "no-store" });
    const payload = await response.json() as FigmaImportResult | { error?: string };
    if (!response.ok || !("file" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to open saved import.");
    setResult(payload);
    setFileUrl(`https://www.figma.com/design/${payload.file.key}`);
  }

  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setRateLimit(null);
    setImportProgress({ stage: "connecting", message: "Starting import", percent: 1 });
    setResult(null);
    try {
      const payload = await streamFigmaImport(fileUrl, setImportProgress);
      setResult(payload);
      await refreshSavedImports();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Figma import failed.");
      if (reason instanceof FigmaImportClientError) setRateLimit(reason.rateLimit);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/figma/disconnect", { method: "POST" });
      if (!response.ok) throw new Error("Unable to disconnect Figma.");
      setResult(null);
      setStatus((current) => current ? { ...current, connected: false, figmaUserId: null, expiresAt: null } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to disconnect Figma.");
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return <div className="flex min-h-[calc(100vh-10.5rem)] items-center justify-center bg-[#f3f3ef]"><LoaderCircle className="size-6 animate-spin text-[#7c6cf0]" aria-label="Loading Figma connection" /></div>;
  }

  return (
    <div className="min-h-[calc(100vh-10.5rem)] overflow-auto bg-[#f3f3ef] p-4 sm:p-7">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]"><Workflow className="size-4" /> Live Figma API</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em]">Import the real prototype graph</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-black/45">Pass-Off reads top-level frames, renders previews, and converts Figma prototype interactions into screen-to-screen relationships.</p>
          </div>
          {status.connected && <button type="button" onClick={disconnect} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/55 shadow-sm disabled:opacity-50"><LogOut className="size-3.5" />Disconnect</button>}
        </div>

        {!status.configured ? <SetupState /> : !status.connected ? <ConnectState error={error} /> : <>
          <div className="mt-7 rounded-2xl border border-black/8 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#7c6cf0]"><CheckCircle2 className="size-4" />Figma connected</div><div className="text-right"><p className="text-[10px] font-semibold text-black/60">{status.tenant?.userName || `Figma user ${status.figmaUserId}`}</p>{status.tenant && <p className="mt-0.5 text-[9px] text-black/35">{status.tenant.organizationName} · {status.tenant.workspaceName} · {status.tenant.projectName}</p>}</div></div>
            <form onSubmit={importFile} className="flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="figma-file-url">Figma file or prototype URL</label>
              <input id="figma-file-url" value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} required type="url" placeholder="https://www.figma.com/design/FILE_KEY/Project…" className="min-w-0 flex-1 rounded-xl border border-black/10 bg-[#faf8ff] px-4 py-3 text-sm outline-none transition placeholder:text-black/30 focus:border-[#7c6cf0]/50 focus:ring-4 focus:ring-[#7c6cf0]/8" />
              <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-5 py-3 text-xs font-semibold text-white shadow-sm disabled:opacity-50">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}{loading ? "Importing…" : "Import File"}</button>
            </form>
            {loading && importProgress && <div className="mt-4 rounded-xl border border-[#7c6cf0]/10 bg-[#f3f0ff] p-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-semibold text-[#5b4cc4]">{importProgress.message}</p><span className="text-[10px] font-bold tabular-nums text-[#7c6cf0]">{importProgress.percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#7c6cf0]/10"><div className="h-full rounded-full bg-[#7c6cf0] transition-[width] duration-300" style={{ width: `${importProgress.percent}%` }} /></div>{importProgress.current !== undefined && importProgress.total !== undefined && <p className="mt-2 text-[9px] text-black/35">{importProgress.current} of {importProgress.total}</p>}</div>}
            <p className="mt-3 text-[10px] leading-4 text-black/40">One file request plus one batched image request per import. Pass-Off does not poll Figma automatically.</p>
            {savedImports.length > 0 && <div className="mt-4 border-t border-black/8 pt-4"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">Saved project files</p><span className="text-[9px] text-black/30">{savedImports.length} file{savedImports.length === 1 ? "" : "s"}</span></div><div className="flex gap-2 overflow-auto pb-1">{savedImports.map((item) => <button type="button" key={item.id} onClick={() => { setLoading(true); setError(null); openSavedImport(item.fileKey).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Unable to open saved import.")).finally(() => setLoading(false)); }} className={`min-w-52 rounded-xl border p-3 text-left transition ${result?.file.key === item.fileKey ? "border-[#7c6cf0]/35 bg-[#ebe6fa]" : "border-black/8 bg-[#faf8ff] hover:border-black/15"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold">{item.fileName}</p><span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-bold ${item.importSource === "plugin" ? "bg-[#6354d4] text-[#ffd7a8]" : "bg-[#e4dffc] text-[#6354d4]"}`}>{item.importSource === "plugin" ? "PLUGIN" : "API"}</span></div><p className="mt-1 text-[9px] text-black/35">{item.previewCount} previews · {item.interactionCount} interactions</p></button>)}</div></div>}
          </div>
          {error && <ErrorNotice message={error} rateLimit={rateLimit} />}
          {result && <ImportResults key={`${result.file.key}:${result.file.version}`} result={result} />}
          {!result && !error && <EmptyState />}
        </>}
      </div>
    </div>
  );
}

function SetupState() {
  return <div className="mt-8 grid gap-5 2xl:grid-cols-[1fr_.9fr]"><div className="min-w-0 rounded-2xl border border-[#e4b751]/35 bg-[#fff8e5] p-6"><div className="flex size-11 items-center justify-center rounded-xl bg-[#ffe8a9] text-[#946207]"><AlertTriangle className="size-5" /></div><h3 className="mt-5 text-lg font-semibold">Figma OAuth needs credentials</h3><p className="mt-2 text-sm leading-6 text-black/50">Create a Figma OAuth app, set its callback URL to the value below, then copy the four server-only variables into <code className="rounded bg-black/5 px-1 py-0.5">.env</code>.</p><div className="mt-5 break-all rounded-xl border border-black/8 bg-white/70 p-3 font-mono text-[11px] text-black/60">http://localhost:3000/api/integrations/figma/callback</div></div><div className="min-w-0 rounded-2xl border border-black/8 bg-white p-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">Required environment</p><div className="mt-4 space-y-2">{setupVariables.map((variable) => <div key={variable} className="flex min-w-0 items-center gap-2 rounded-xl bg-black/[0.025] px-3 py-2.5 font-mono text-[11px]"><span className="size-1.5 shrink-0 rounded-full bg-[#7350da]" /><span className="min-w-0 break-all">{variable}</span></div>)}</div><p className="mt-4 text-[11px] leading-5 text-black/45">Generate the encryption key with <code className="break-all rounded bg-black/5 px-1 py-0.5">openssl rand -base64 32</code>. Tokens are encrypted with AES-256-GCM before storage.</p></div></div>;
}

function ConnectState({ error }: { error: string | null }) {
  return <div className="mt-8"><div className="rounded-2xl border border-black/8 bg-white p-7 text-center shadow-sm"><div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-[#ebe6fa] text-[#7c6cf0]"><PlugZap className="size-5" /></div><h3 className="mt-5 text-xl font-semibold">Authorize a Figma workspace</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-black/45">The connection requests only <code className="rounded bg-black/5 px-1 py-0.5">file_content:read</code>. Pass-Off cannot edit or delete Figma files.</p><a href="/api/integrations/figma/connect" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-5 py-3 text-xs font-semibold text-white shadow-sm">Connect Figma <ArrowRight className="size-4" /></a></div>{error && <ErrorNotice message={error} />}</div>;
}

function EmptyState() {
  return <div className="mt-6 rounded-2xl border border-dashed border-black/15 bg-white/45 px-6 py-14 text-center"><GitBranch className="mx-auto size-7 text-black/25" /><p className="mt-4 text-sm font-semibold text-black/65">No live file imported yet</p><p className="mt-1 text-xs text-black/40">Paste a Figma design, file, or prototype URL above.</p></div>;
}

function ErrorNotice({ message, rateLimit }: { message: string; rateLimit?: FigmaRateLimitDetails | null }) {
  return <div role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-[#e6a44c]/35 bg-[#fff4d8] p-4 text-xs leading-5 text-[#76500b]"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div><p>{message}</p>{rateLimit && <p className="mt-2 text-[10px] text-[#76500b]/70">Plan: {rateLimit.planTier || "unknown"} · Rate-limit class: {rateLimit.rateLimitType || "unknown"}{rateLimit.retryAt ? ` · Retry after ${new Date(rateLimit.retryAt).toLocaleString()}` : ""}</p>}{rateLimit?.upgradeUrl && <a href={rateLimit.upgradeUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold underline">Review Figma plan or seat <ExternalLink className="size-3" /></a>}</div></div>;
}

function ImportResults({ result }: { result: FigmaImportResult }) {
  const previewScreens = result.screens.filter((screen) => Boolean(screen.imageUrl));
  const hiddenScreenCount = result.screens.length - previewScreens.length;
  const screensPerPage = 12;
  const [screenPage, setScreenPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(previewScreens.length / screensPerPage));
  const paginatedScreens = previewScreens.slice((screenPage - 1) * screensPerPage, screenPage * screensPerPage);
  const [selectedId, setSelectedId] = useState(previewScreens[0]?.id ?? null);
  const [questions, setQuestions] = useState<FigmaQuestionRecord[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [drilldownId, setDrilldownId] = useState<string | null>(null);
  const selected = previewScreens.find((screen) => screen.id === selectedId) ?? previewScreens[0] ?? null;
  const drilldown = previewScreens.find((screen) => screen.id === drilldownId) ?? null;

  useEffect(() => {
    fetch(`/api/integrations/figma/ask?fileKey=${encodeURIComponent(result.file.key)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { questions?: FigmaQuestionRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load saved questions.");
        return payload.questions ?? [];
      })
      .then(setQuestions)
      .catch((reason: unknown) => setQuestionError(reason instanceof Error ? reason.message : "Unable to load saved questions."));
  }, [result.file.key]);

  useEffect(() => {
    if (!drilldownId) return;
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDrilldownId(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [drilldownId]);

  async function ask(value: string) {
    const nextQuestion = value.trim();
    if (!selected || !nextQuestion || asking) return;
    setAsking(true);
    setQuestionError(null);
    try {
      const response = await fetch("/api/integrations/figma/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, fileKey: result.file.key, fileName: result.file.name, screen: selected, screens: result.screens, interactions: result.interactions }),
      });
      const payload = await response.json() as FigmaQuestionRecord | { error?: string };
      if (!response.ok || !("answer" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to analyze this screen.");
      setQuestions((current) => [...current, payload]);
      setQuestion("");
    } catch (reason) {
      setQuestionError(reason instanceof Error ? reason.message : "Unable to analyze this screen.");
    } finally {
      setAsking(false);
    }
  }

  const importSource = result.importSource === "plugin" || result.file.version.startsWith("plugin-") ? "plugin" : "api";
  return <div className="mt-6 space-y-5"><div className="flex flex-col justify-between gap-3 rounded-2xl border border-black/8 bg-white p-5 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">Imported file</p><span className={`rounded-md px-2 py-0.5 text-[9px] font-bold ${importSource === "plugin" ? "bg-[#6354d4] text-[#ffd7a8]" : "bg-[#e4dffc] text-[#6354d4]"}`}>{importSource === "plugin" ? "PLUGIN" : "API"}</span></div><h3 className="mt-1 text-lg font-semibold">{result.file.name}</h3><p className="mt-1 text-[10px] text-black/40">{importSource === "plugin" ? "Local Figma plugin" : "Figma REST API"} · Version {result.file.version.slice(0, 10)} · Updated {new Date(result.file.lastModified).toLocaleString()}</p></div><a href={`https://www.figma.com/design/${result.file.key}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-semibold text-[#7c6cf0]">Open in Figma <ExternalLink className="size-3.5" /></a></div>
    {result.warnings.map((warning) => <ErrorNotice key={warning} message={warning} />)}
    <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-w-0 space-y-5"><div><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Open a screen</h3><p className="mt-1 text-[10px] text-black/40">Click a frame to inspect it, trace its paths, and ask contextual questions.</p></div><div className="text-right"><span className="text-[10px] text-black/40">{previewScreens.length} preview{previewScreens.length === 1 ? "" : "s"}</span>{hiddenScreenCount > 0 && <p className="mt-0.5 text-[9px] text-black/30">{hiddenScreenCount} without previews hidden</p>}</div></div>{paginatedScreens.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{paginatedScreens.map((screen) => <ScreenCard key={screen.id} screen={screen} selected={screen.id === selected?.id} onSelect={() => { setSelectedId(screen.id); setDrilldownId(screen.id); }} />)}</div> : <div className="rounded-2xl border border-dashed border-black/15 bg-white/45 px-6 py-12 text-center"><Maximize2 className="mx-auto size-6 text-black/20" /><p className="mt-3 text-xs font-semibold text-black/55">No screen previews available</p><p className="mt-1 text-[10px] text-black/35">Frames without a rendered Figma preview are hidden.</p></div>}{pageCount > 1 && <div className="mt-4 flex items-center justify-between rounded-xl border border-black/8 bg-white px-3 py-2"><button type="button" disabled={screenPage === 1} onClick={() => setScreenPage((page) => Math.max(1, page - 1))} className="rounded-lg px-3 py-1.5 text-[10px] font-semibold text-black/55 hover:bg-black/5 disabled:opacity-30">Previous</button><span className="text-[10px] font-semibold text-black/40">Page {screenPage} of {pageCount}</span><button type="button" disabled={screenPage === pageCount} onClick={() => setScreenPage((page) => Math.min(pageCount, page + 1))} className="rounded-lg px-3 py-1.5 text-[10px] font-semibold text-black/55 hover:bg-black/5 disabled:opacity-30">Next</button></div>}</div>
      <div className="rounded-2xl border border-black/8 bg-white p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Prototype relationships</h3><span className="text-[10px] text-black/40">{result.interactions.length} interactions</span></div><div className="mt-4 max-h-80 space-y-2 overflow-auto">{result.interactions.length ? result.interactions.map((interaction, index) => { const sourceHasPreview = previewScreens.some((screen) => screen.id === interaction.sourceScreenId); return <button type="button" disabled={!sourceHasPreview} onClick={() => sourceHasPreview && setSelectedId(interaction.sourceScreenId)} key={`${interaction.sourceNodeId}-${index}`} className={`grid w-full gap-2 rounded-xl px-3 py-3 text-left text-[10px] transition disabled:cursor-default disabled:opacity-45 sm:grid-cols-[1fr_auto_1fr] sm:items-center ${selected?.id === interaction.sourceScreenId ? "bg-[#ebe6fa] ring-1 ring-[#7c6cf0]/20" : "bg-black/[0.025] hover:bg-black/[0.045]"}`}><div><p className="font-semibold">{interaction.sourceNodeName}</p><p className="mt-0.5 font-mono text-black/35">{interaction.sourceScreenId}</p></div><div className="flex items-center gap-2 text-[#7c6cf0]"><span className="rounded-md bg-white/70 px-2 py-1 font-semibold">{interaction.trigger}</span><ArrowRight className="size-3.5" /></div><div><p className="font-semibold">{interaction.destinationScreenId || "No destination"}</p><p className="mt-0.5 text-black/35">{sourceHasPreview ? interaction.actions.join(", ") || "Action not named" : "Source preview unavailable"}</p></div></button>; }) : <p className="py-7 text-center text-xs text-black/40">No connected prototype interactions were returned.</p>}</div></div></div>
      <QuestionPanel inputId="figma-question-sidebar" result={result} selected={selected} questions={questions} question={question} setQuestion={setQuestion} asking={asking} error={questionError} onAsk={ask} />
    </div>
    {drilldown && <ScreenDrilldown result={result} screen={drilldown} questions={questions} question={question} setQuestion={setQuestion} asking={asking} error={questionError} onAsk={ask} onClose={() => setDrilldownId(null)} onNavigate={(screenId) => { setSelectedId(screenId); setDrilldownId(screenId); }} />}
  </div>;
}

function ScreenCard({ screen, selected, onSelect }: { screen: FigmaScreen; selected: boolean; onSelect: () => void }) {
  return <button type="button" onClick={onSelect} aria-pressed={selected} className={`group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 ${selected ? "border-[#7c6cf0]/55 ring-4 ring-[#7c6cf0]/10" : "border-black/8"}`}><div className="relative aspect-[16/10] bg-[#e7e8e4] bg-contain bg-center bg-no-repeat" style={screen.imageUrl ? { backgroundImage: `url(${JSON.stringify(screen.imageUrl).slice(1, -1)})` } : undefined}>{!screen.imageUrl && <div className="flex h-full items-center justify-center text-[10px] text-black/30">Preview unavailable</div>}<span className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg bg-white/90 text-black/55 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100"><Maximize2 className="size-3.5" /></span></div><div className="p-3"><div className="flex items-start justify-between gap-2"><p className="truncate text-xs font-semibold">{screen.name}</p><span className="shrink-0 rounded-md bg-[#e4dffc] px-1.5 py-0.5 text-[9px] font-bold text-[#6354d4]">{screen.interactionCount} links</span></div><p className="mt-1 font-mono text-[9px] text-black/35">{screen.id}{screen.width && screen.height ? ` · ${Math.round(screen.width)}×${Math.round(screen.height)}` : ""}</p><p className="mt-2 flex items-center gap-1 text-[9px] font-semibold text-[#7c6cf0]">Open screen <ArrowRight className="size-3" /></p></div></button>;
}

function ScreenDrilldown({ result, screen, questions, question, setQuestion, asking, error, onAsk, onClose, onNavigate }: { result: FigmaImportResult; screen: FigmaScreen; questions: FigmaQuestionRecord[]; question: string; setQuestion: (value: string) => void; asking: boolean; error: string | null; onAsk: (value: string) => void; onClose: () => void; onNavigate: (screenId: string) => void }) {
  const outgoing = result.interactions.filter((interaction) => interaction.sourceScreenId === screen.id);
  const incoming = result.interactions.filter((interaction) => interaction.destinationScreenId === screen.id);
  const nodeId = screen.id.replace(":", "-");
  const related = [...outgoing.map((interaction) => ({ direction: "Outgoing", interaction })), ...incoming.map((interaction) => ({ direction: "Incoming", interaction }))];
  return <div role="dialog" aria-modal="true" aria-labelledby="screen-detail-title" onWheel={(event) => event.stopPropagation()} className="fixed inset-0 z-50 flex overscroll-none bg-[#0c1412]/75 p-2 backdrop-blur-sm sm:p-5"><div className="m-auto flex max-h-full w-full max-w-[1440px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#f4f5f1] shadow-2xl"><header className="flex items-center justify-between border-b border-black/8 bg-white px-4 py-3 sm:px-5"><div className="min-w-0"><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">Screen detail · {result.file.name}</p><h2 id="screen-detail-title" className="mt-1 truncate text-lg font-semibold">{screen.name}</h2></div><div className="flex items-center gap-2"><a href={`https://www.figma.com/design/${result.file.key}?node-id=${encodeURIComponent(nodeId)}`} target="_blank" rel="noreferrer" className="hidden items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs font-semibold sm:flex">Open node in Figma <ExternalLink className="size-3.5" /></a><button type="button" onClick={onClose} aria-label="Close screen detail" className="flex size-9 items-center justify-center rounded-xl border border-black/10 bg-white text-black/55"><X className="size-4" /></button></div></header><div className="grid min-h-0 flex-1 overflow-auto overscroll-contain xl:grid-cols-[minmax(0,1fr)_380px]"><div className="min-w-0 p-3 sm:p-5"><InteractiveScreenCanvas key={screen.id} file={result.file} screen={screen} outgoing={outgoing} screens={result.screens} onNavigate={onNavigate} /><div className="mt-4 grid gap-3 sm:grid-cols-4"><DetailStat label="Figma node" value={screen.id} mono /><DetailStat label="Type" value={screen.type} /><DetailStat label="Dimensions" value={screen.width && screen.height ? `${Math.round(screen.width)} × ${Math.round(screen.height)}` : "Unknown"} /><DetailStat label="Relationships" value={`${incoming.length} in · ${outgoing.length} out`} /></div><div className="mt-4 rounded-2xl border border-black/8 bg-white p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Connected paths</h3><span className="text-[10px] text-black/40">{related.length} relationships</span></div><div className="mt-3 space-y-2">{related.length ? related.map(({ direction, interaction }, index) => { const otherId = direction === "Outgoing" ? interaction.destinationScreenId : interaction.sourceScreenId; const otherScreen = result.screens.find((item) => item.id === otherId); return <button type="button" disabled={!otherScreen} onClick={() => otherScreen && onNavigate(otherScreen.id)} key={`${direction}-${interaction.sourceNodeId}-${index}`} className="grid w-full gap-2 rounded-xl bg-black/[0.025] px-3 py-3 text-left text-[10px] transition hover:bg-black/[0.05] disabled:cursor-default sm:grid-cols-[80px_1fr_auto]"><span className={`w-fit rounded-md px-2 py-1 font-semibold ${direction === "Outgoing" ? "bg-[#e4dffc] text-[#6354d4]" : "bg-[#ebe6fa] text-[#7c6cf0]"}`}>{direction}</span><span><strong>{interaction.sourceNodeName}</strong><br /><span className="text-black/40">{interaction.trigger} · {interaction.actions.join(", ") || "Unnamed action"}</span></span><span className="flex items-center gap-1 font-semibold text-black/55">{otherScreen?.name || otherId || "No destination"}{otherScreen && <ArrowRight className="size-3" />}</span></button>; }) : <p className="py-5 text-center text-xs text-black/40">This screen has no imported prototype paths.</p>}</div></div></div><DrilldownSidebar result={result} screen={screen} questions={questions} question={question} setQuestion={setQuestion} asking={asking} error={error} onAsk={onAsk} /></div></div></div>;
}

function InteractiveScreenCanvas({ file, screen, outgoing, screens, onNavigate }: { file: FigmaImportResult["file"]; screen: FigmaScreen; outgoing: FigmaImportResult["interactions"]; screens: FigmaScreen[]; onNavigate: (screenId: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [commentMode, setCommentMode] = useState(false);
  const [comments, setComments] = useState<FigmaCommentRecord[]>([]);
  const [draftPosition, setDraftPosition] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const drag = useRef<{ pointerId: number; x: number; y: number; startX: number; startY: number } | null>(null);
  const width = screen.width || 16;
  const height = screen.height || 10;
  const portrait = height > width;
  const clampZoom = (value: number) => Math.min(4, Math.max(0.5, value));
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  useEffect(() => {
    const query = new URLSearchParams({ fileKey: file.key, screenId: screen.id });
    fetch(`/api/integrations/figma/comments?${query}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { comments?: FigmaCommentRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load comments.");
        return payload.comments ?? [];
      })
      .then(setComments)
      .catch((reason: unknown) => setCommentError(reason instanceof Error ? reason.message : "Unable to load comments."));
  }, [file.key, screen.id]);

  useEffect(() => {
    function focusComment(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string; commentId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id && detail.commentId) {
        setDraftPosition(null);
        setActiveCommentId(detail.commentId);
      }
    }
    window.addEventListener(focusCommentEvent, focusComment);
    return () => window.removeEventListener(focusCommentEvent, focusComment);
  }, [file.key, screen.id]);

  function changeZoom(nextZoom: number) {
    setZoom(clampZoom(nextZoom));
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    changeZoom(zoom * (event.deltaY < 0 ? 1.12 : 0.89));
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (commentMode) return;
    if ((event.target as HTMLElement).closest("[data-hotspot], [data-viewer-control]")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, x: pan.x, y: pan.y, startX: event.clientX, startY: event.clientY };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    setPan({ x: drag.current.x + event.clientX - drag.current.startX, y: drag.current.y + event.clientY - drag.current.startY });
  }

  function stopDragging(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function placeComment(event: React.MouseEvent<HTMLDivElement>) {
    if (!commentMode || (event.target as HTMLElement).closest("[data-comment-pin], [data-comment-composer]")) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setDraftPosition({ x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)) });
    setDraft("");
    setActiveCommentId(null);
    setCommentError(null);
  }

  async function saveComment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draftPosition || !draft.trim() || savingComment) return;
    setSavingComment(true);
    setCommentError(null);
    try {
      const response = await fetch("/api/integrations/figma/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileKey: file.key, fileName: file.name, screenId: screen.id, screenName: screen.name, x: draftPosition.x, y: draftPosition.y, body: draft }) });
      const payload = await response.json() as FigmaCommentRecord | { error?: string };
      if (!response.ok || !("body" in payload)) throw new Error("error" in payload && payload.error ? payload.error : "Unable to save comment.");
      setComments((current) => [...current, payload]);
      setDraftPosition(null);
      setDraft("");
      setActiveCommentId(null);
      notifyCommentsUpdated(file.key, screen.id);
    } catch (reason) {
      setCommentError(reason instanceof Error ? reason.message : "Unable to save comment.");
    } finally {
      setSavingComment(false);
    }
  }

  async function setCommentStatus(comment: FigmaCommentRecord, status: "open" | "resolved") {
    setCommentError(null);
    const response = await fetch("/api/integrations/figma/comments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: comment.id, status }) });
    const payload = await response.json() as FigmaCommentRecord | { error?: string };
    if (!response.ok || !("body" in payload)) return setCommentError("error" in payload && payload.error ? payload.error : "Unable to update comment.");
    setComments((current) => current.map((item) => item.id === payload.id ? payload : item));
    notifyCommentsUpdated(file.key, screen.id);
  }

  async function deleteComment(comment: FigmaCommentRecord) {
    setCommentError(null);
    const response = await fetch("/api/integrations/figma/comments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: comment.id }) });
    const payload = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok) return setCommentError(payload.error || "Unable to delete comment.");
    setComments((current) => current.filter((item) => item.id !== comment.id));
    setActiveCommentId(null);
    notifyCommentsUpdated(file.key, screen.id);
  }

  return <div className="relative flex min-h-[420px] touch-none select-none items-center justify-center overflow-hidden overscroll-none rounded-2xl border border-black/10 bg-[#dfe2dc] sm:min-h-[620px]" onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopDragging} onPointerCancel={stopDragging}>
    <div data-viewer-control className="absolute left-3 top-3 z-30 flex items-center gap-1 rounded-xl border border-black/10 bg-white/95 p-1 shadow-lg backdrop-blur">
      <button type="button" aria-label="Zoom Out" onClick={() => changeZoom(zoom / 1.2)} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><Minus className="size-4" /></button>
      <span className="w-12 text-center text-[10px] font-semibold tabular-nums text-black/60">{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in" onClick={() => changeZoom(zoom * 1.2)} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><Plus className="size-4" /></button>
      <button type="button" aria-label="Reset View" onClick={reset} className="flex size-8 items-center justify-center rounded-lg text-black/60 hover:bg-black/5"><RotateCcw className="size-3.5" /></button>
      <span className="mx-1 h-5 w-px bg-black/10" />
      <button type="button" aria-pressed={commentMode} onClick={() => { setCommentMode((current) => !current); setDraftPosition(null); setActiveCommentId(null); }} className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold transition ${commentMode ? "bg-[#7c6cf0] text-white" : "text-black/60 hover:bg-black/5"}`}><MessageSquarePlus className="size-3.5" />Comment</button>
      <span className="rounded-md bg-black/5 px-1.5 py-1 text-[9px] font-bold text-black/45">{comments.filter((item) => item.status === "open").length}</span>
    </div>
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[9px] font-medium text-white/80 backdrop-blur"><MousePointer2 className="size-3" />{commentMode ? "Click the design to place a comment" : "Scroll to zoom · drag to pan · click purple hotspots"}</div>
    {commentError && <div data-viewer-control role="alert" className="absolute right-3 top-3 z-40 max-w-xs rounded-xl bg-[#2e2654] px-3 py-2 text-[10px] text-white shadow-lg">{commentError}</div>}
    {screen.imageUrl ? <div role="img" aria-label={`Interactive preview of ${screen.name}`} onClick={placeComment} className={`relative shrink-0 bg-white bg-[length:100%_100%] bg-center bg-no-repeat shadow-xl ${commentMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`} style={{ aspectRatio: `${width} / ${height}`, backgroundImage: `url(${JSON.stringify(screen.imageUrl).slice(1, -1)})`, width: portrait ? "auto" : "min(88%, 1100px)", height: portrait ? "min(72vh, 760px)" : "auto", transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center" }}>
      {outgoing.map((interaction, index) => {
        const bounds = interaction.sourceBounds;
        if (!bounds || screen.x === null || screen.y === null || !screen.width || !screen.height) return null;
        const left = Math.max(0, Math.min(100, ((bounds.x - screen.x) / screen.width) * 100));
        const top = Math.max(0, Math.min(100, ((bounds.y - screen.y) / screen.height) * 100));
        const hotspotWidth = Math.max(2.5, Math.min(100 - left, (bounds.width / screen.width) * 100));
        const hotspotHeight = Math.max(2.5, Math.min(100 - top, (bounds.height / screen.height) * 100));
        const destination = screens.find((item) => item.id === interaction.destinationScreenId);
        return <button data-hotspot type="button" disabled={!destination || commentMode} key={`${interaction.sourceNodeId}-${index}`} title={`${interaction.sourceNodeName} → ${destination?.name || interaction.destinationScreenId || "No destination"}`} onClick={(event) => { event.stopPropagation(); if (destination) onNavigate(destination.id); }} className={`group absolute z-20 min-h-6 min-w-6 cursor-pointer rounded border-2 border-[#8057ef] bg-[#8057ef]/15 shadow-[0_0_0_2px_rgba(255,255,255,.65)] transition hover:bg-[#8057ef]/35 disabled:cursor-not-allowed ${commentMode ? "pointer-events-none opacity-35" : ""}`} style={{ left: `${left}%`, top: `${top}%`, width: `${hotspotWidth}%`, height: `${hotspotHeight}%` }}><span className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-[#7c6cf0] text-[9px] font-bold text-white shadow">{index + 1}</span><span className="pointer-events-none absolute left-1/2 top-full mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/85 px-2 py-1 text-[9px] font-semibold text-white shadow-lg group-hover:block">{destination?.name || "Destination unavailable"}</span></button>;
      })}
      {comments.map((comment, index) => <div data-comment-pin key={comment.id} className="absolute z-40" style={{ left: `${comment.x}%`, top: `${comment.y}%`, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}><button type="button" aria-label={`Open comment ${index + 1}`} onClick={(event) => { event.stopPropagation(); setDraftPosition(null); setActiveCommentId((current) => current === comment.id ? null : comment.id); }} className={`flex size-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold text-white shadow-lg ${comment.status === "resolved" ? "bg-[#63706c]" : "bg-[#ef5da8]"}`}>{index + 1}</button>{activeCommentId === comment.id && <div className="absolute left-9 top-0 w-64 rounded-2xl border border-black/10 bg-white p-3 text-left text-black shadow-2xl"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-semibold">{comment.authorName}</p><p className="mt-0.5 text-[9px] text-black/35">{new Date(comment.createdAt).toLocaleString()}</p></div><span className={`rounded-md px-1.5 py-1 text-[8px] font-bold uppercase ${comment.status === "resolved" ? "bg-[#e4dffc] text-[#6354d4]" : "bg-[#ffe8f4] text-[#a52b69]"}`}>{comment.status}</span></div><p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-black/70">{comment.body}</p><div className="mt-3 flex gap-2 border-t border-black/8 pt-2"><button type="button" onClick={() => setCommentStatus(comment, comment.status === "open" ? "resolved" : "open")} className="flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[9px] font-semibold"><Check className="size-3" />{comment.status === "open" ? "Resolve" : "Reopen"}</button><button type="button" aria-label="Delete Comment" onClick={() => deleteComment(comment)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-semibold text-[#b23b35] hover:bg-[#fff0ee]"><Trash2 className="size-3" />Delete</button></div></div>}</div>)}
      {draftPosition && <form data-comment-composer onSubmit={saveComment} onClick={(event) => event.stopPropagation()} className="absolute z-50 w-64 rounded-2xl border border-black/10 bg-white p-3 text-black shadow-2xl" style={{ left: `${draftPosition.x}%`, top: `${draftPosition.y}%`, transform: `translate(12px, 12px) scale(${1 / zoom})`, transformOrigin: "top left" }}><label htmlFor="new-screen-comment" className="text-[10px] font-semibold">Add a comment</label><textarea id="new-screen-comment" autoFocus rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="What should change or be clarified?" className="mt-2 w-full resize-none rounded-xl border border-black/10 bg-[#f7f7f4] px-3 py-2 text-[11px] leading-5 outline-none focus:border-[#ef5da8]/60" /><div className="mt-2 flex justify-end gap-2"><button type="button" onClick={() => setDraftPosition(null)} className="rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-black/45">Cancel</button><button type="submit" disabled={!draft.trim() || savingComment} className="rounded-lg bg-[#ef5da8] px-3 py-1.5 text-[9px] font-semibold text-white disabled:opacity-40">{savingComment ? "Saving…" : "Post Comment"}</button></div></form>}
    </div> : <p className="text-sm text-black/35">Preview unavailable</p>}
  </div>;
}

function DrilldownSidebar({ result, screen, questions, question, setQuestion, asking, error, onAsk }: { result: FigmaImportResult; screen: FigmaScreen; questions: FigmaQuestionRecord[]; question: string; setQuestion: (value: string) => void; asking: boolean; error: string | null; onAsk: (value: string) => void }) {
  const [tab, setTab] = useState<"ask" | "comments">("ask");
  return <div className="min-w-0 bg-[#17221f] text-white xl:border-l xl:border-white/8">
    <div role="tablist" aria-label="Screen review tools" className="grid grid-cols-2 border-b border-white/10 bg-[#111c19] p-2">
      <button type="button" role="tab" aria-selected={tab === "ask"} onClick={() => setTab("ask")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-semibold transition ${tab === "ask" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"}`}><Sparkles className="size-3.5" />Ask Pass-Off</button>
      <button type="button" role="tab" aria-selected={tab === "comments"} onClick={() => setTab("comments")} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-semibold transition ${tab === "comments" ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"}`}><MessageSquarePlus className="size-3.5" />Comments</button>
    </div>
    {tab === "ask" ? <QuestionPanel inputId="figma-question-drilldown" result={result} selected={screen} questions={questions} question={question} setQuestion={setQuestion} asking={asking} error={error} onAsk={onAsk} /> : <ScreenCommentsPanel file={result.file} screen={screen} />}
  </div>;
}

function ScreenCommentsPanel({ file, screen }: { file: FigmaImportResult["file"]; screen: FigmaScreen }) {
  const [comments, setComments] = useState<FigmaCommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadComments() {
      try {
        const query = new URLSearchParams({ fileKey: file.key, screenId: screen.id });
        const response = await fetch(`/api/integrations/figma/comments?${query}`, { cache: "no-store" });
        const payload = await response.json() as { comments?: FigmaCommentRecord[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load comments.");
        if (active) { setComments(payload.comments ?? []); setError(null); }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Unable to load comments.");
      } finally {
        if (active) setLoading(false);
      }
    }
    function commentsChanged(event: Event) {
      const detail = (event as CustomEvent<{ fileKey?: string; screenId?: string }>).detail;
      if (detail?.fileKey === file.key && detail.screenId === screen.id) void loadComments();
    }
    void loadComments();
    window.addEventListener(commentsUpdatedEvent, commentsChanged);
    return () => { active = false; window.removeEventListener(commentsUpdatedEvent, commentsChanged); };
  }, [file.key, screen.id]);

  const openCount = comments.filter((item) => item.status === "open").length;
  return <aside className="min-w-0 text-white"><div className="border-b border-white/10 p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#f59bc8]"><MessageSquarePlus className="size-4" /> Screen comments</div><h3 className="mt-2 truncate text-lg font-semibold">{screen.name}</h3></div><span className="rounded-lg bg-white/8 px-2 py-1 text-[9px] font-bold text-white/55">{openCount} open</span></div><p className="mt-2 text-[10px] leading-4 text-white/40">Select a comment to open its numbered pin. Use Comment above the design to place another.</p></div>
    <div className="max-h-[650px] space-y-2 overflow-auto p-4">{loading ? <div className="flex justify-center py-12"><LoaderCircle className="size-5 animate-spin text-white/35" /></div> : error ? <p role="alert" className="rounded-xl bg-[#2e2654]/70 p-3 text-[10px] leading-4 text-white">{error}</p> : comments.length ? comments.map((comment, index) => <button type="button" key={comment.id} onClick={() => window.dispatchEvent(new CustomEvent(focusCommentEvent, { detail: { fileKey: file.key, screenId: screen.id, commentId: comment.id } }))} className="flex w-full items-start gap-3 rounded-2xl border border-white/8 bg-white/5 p-3 text-left transition hover:border-[#ef5da8]/40 hover:bg-white/8"><span className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[10px] font-bold text-white ${comment.status === "resolved" ? "bg-[#63706c]" : "bg-[#ef5da8]"}`}>{index + 1}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-[10px]">{comment.authorName}</strong><span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${comment.status === "resolved" ? "bg-[#5b4cc4] text-[#a594f5]" : "bg-[#5f2745] text-[#f7a7d0]"}`}>{comment.status}</span></span><span className="mt-1.5 line-clamp-3 block whitespace-pre-wrap text-[10px] leading-4 text-white/60">{comment.body}</span><span className="mt-2 block text-[8px] text-white/25">{new Date(comment.createdAt).toLocaleString()}</span></span></button>) : <div className="py-12 text-center"><MessageSquarePlus className="mx-auto size-6 text-white/25" /><p className="mt-3 text-xs font-semibold text-white/65">No comments on this screen</p><p className="mx-auto mt-1 max-w-[240px] text-[10px] leading-4 text-white/35">Choose Comment above the design, then click the exact spot you want to discuss.</p></div>}</div>
  </aside>;
}

function DetailStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-black/8 bg-white p-3"><p className="text-[9px] font-semibold uppercase tracking-wider text-black/35">{label}</p><p className={`mt-1 truncate text-xs font-semibold text-black/70 ${mono ? "font-mono" : ""}`}>{value}</p></div>;
}

function QuestionPanel({ inputId, result, selected, questions, question, setQuestion, asking, error, onAsk }: { inputId: string; result: FigmaImportResult; selected: FigmaScreen | null; questions: FigmaQuestionRecord[]; question: string; setQuestion: (value: string) => void; asking: boolean; error: string | null; onAsk: (value: string) => void }) {
  const selectedQuestions = questions.filter((item) => item.screenId === selected?.id);
  const suggestions = ["What happens after this screen?", "Which states are missing?", "What data and API behavior are needed?"];
  return <aside className="min-w-0 overflow-hidden rounded-2xl border border-black/8 bg-[#17221f] text-white shadow-sm 2xl:sticky 2xl:top-4"><div className="border-b border-white/10 p-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a594f5]"><MessageCircleQuestion className="size-4" /> Ask Pass-Off</div><h3 className="mt-2 truncate text-lg font-semibold">{selected?.name || "Select a screen"}</h3><p className="mt-1 text-[10px] text-white/40">Answers use {result.interactions.length} imported prototype relationships and are saved to this file.</p></div>
    <div className="max-h-[430px] space-y-4 overflow-auto p-4">{selectedQuestions.length ? selectedQuestions.map((item) => <div key={item.id} className="space-y-2"><div className="ml-8 rounded-2xl rounded-tr-sm bg-[#7c6cf0] px-3 py-2.5 text-xs leading-5">{item.question}</div><div className="mr-4 rounded-2xl rounded-tl-sm bg-white/8 px-3 py-3"><p className="text-xs leading-5 text-white/80">{item.answer}</p>{item.gaps.length > 0 && <div className="mt-3 border-t border-white/10 pt-2"><p className="text-[9px] font-bold uppercase tracking-wider text-[#efc779]">Handoff gaps</p>{item.gaps.map((gap) => <p key={gap} className="mt-1 text-[10px] leading-4 text-white/50">• {gap}</p>)}</div>}</div></div>) : <div className="py-5 text-center"><Sparkles className="mx-auto size-6 text-[#a594f5]" /><p className="mt-3 text-xs font-semibold">Ask about this screen</p><p className="mt-1 text-[10px] leading-4 text-white/40">Transitions, missing states, data contracts, and disconnected flows are available now.</p></div>}</div>
    <div className="border-t border-white/10 p-4"><div className="mb-3 flex flex-wrap gap-1.5">{suggestions.map((suggestion) => <button type="button" disabled={!selected || asking} onClick={() => onAsk(suggestion)} key={suggestion} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[9px] text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-40">{suggestion}</button>)}</div>{error && <p role="alert" className="mb-2 text-[10px] leading-4 text-[#f3c56f]">{error}</p>}<form onSubmit={(event) => { event.preventDefault(); onAsk(question); }} className="flex gap-2"><label className="sr-only" htmlFor={inputId}>Ask a question about the selected Figma screen</label><textarea id={inputId} rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} disabled={!selected || asking} placeholder="Ask what the design does not explain…" className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-[#a594f5]/50" /><button type="submit" aria-label="Ask Question" disabled={!selected || !question.trim() || asking} className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-[#a594f5] text-[#17221f] disabled:opacity-35">{asking ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}</button></form></div>
  </aside>;
}
