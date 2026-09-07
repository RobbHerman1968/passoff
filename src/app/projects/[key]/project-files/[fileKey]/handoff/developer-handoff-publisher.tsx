"use client";

import {
  Check,
  ClipboardCopy,
  LoaderCircle,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Summary = {
  project: { id: string; name: string };
  file: {
    key: string;
    name: string;
    screenCount: number;
    interactionCount: number;
    publishedExplanationCount: number;
    draftExplanationCount: number;
  };
  currentApprovedRevision: {
    id: string;
    number: number;
    approvedAt: string;
    approverDisplayName: string;
  } | null;
  snapshots: Array<{
    id: string;
    version: number;
    approvedRevisionNumber: number | null;
    contentSha256: string;
    publishedByDisplayName: string;
    publishedAt: string;
  }>;
  links: Array<{
    id: string;
    snapshotId: string;
    status: string;
    expiresAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }>;
};

type CreatedLink = { id: string; snapshotId: string; token: string };
type RecoverableLink = CreatedLink & { url: string };
type RevokeTarget = { snapshotId: string; version: number; linkCount: number };

function publicUrl(token: string) {
  return `${window.location.origin}/developer-handoff/${encodeURIComponent(token)}`;
}

export function DeveloperHandoffPublisher({
  projectId,
  fileKey,
}: {
  projectId: string;
  fileKey: string;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [recoverableLink, setRecoverableLink] = useState<RecoverableLink | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<RevokeTarget | null>(null);
  const endpoint = `/api/projects/${encodeURIComponent(projectId)}/developer-handoff`;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${endpoint}?fileKey=${encodeURIComponent(fileKey)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as Summary | { error?: string };
      if (!response.ok || !("snapshots" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Unable to load handoff versions.");
      }
      setSummary(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load handoff versions.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, fileKey, projectId]);

  const linksBySnapshot = useMemo(() => {
    const grouped = new Map<string, Summary["links"]>();
    for (const link of summary?.links ?? []) {
      const current = grouped.get(link.snapshotId) ?? [];
      current.push(link);
      grouped.set(link.snapshotId, current);
    }
    return grouped;
  }, [summary]);

  async function copyLink(url: string, snapshotId: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(snapshotId);
      window.setTimeout(() => setCopied((current) => current === snapshotId ? null : current), 1800);
      return true;
    } catch {
      return false;
    }
  }

  async function publish() {
    if (busy) return;
    setBusy("publish");
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKey }),
      });
      const payload = await response.json() as { link?: CreatedLink; error?: string };
      if (!response.ok || !payload.link) throw new Error(payload.error || "Unable to publish developer handoff.");
      const link = { ...payload.link, url: publicUrl(payload.link.token) };
      setRecoverableLink(link);
      await load();
      if (!(await copyLink(link.url, link.snapshotId))) {
        setError("The handoff was published, but clipboard access was blocked. Copy the secure URL shown below.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to publish developer handoff.");
    } finally {
      setBusy(null);
    }
  }

  async function createAndCopy(snapshotId: string) {
    if (busy) return;
    setBusy(`copy:${snapshotId}`);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const payload = await response.json() as CreatedLink & { error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || "Unable to create a secure link.");
      const link = { ...payload, url: publicUrl(payload.token) };
      setRecoverableLink(link);
      await load();
      if (!(await copyLink(link.url, link.snapshotId))) {
        setError("The secure link was created, but clipboard access was blocked. Copy the URL shown below.");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create a secure link.");
    } finally {
      setBusy(null);
    }
  }

  async function revokeSnapshotLinks(snapshotId: string) {
    const active = (linksBySnapshot.get(snapshotId) ?? []).filter(
      (link) => link.status === "ACTIVE" && !link.revokedAt,
    );
    if (!active.length || busy) return;
    setBusy(`revoke:${snapshotId}`);
    setError(null);
    try {
      for (const link of active) {
        const response = await fetch(
          `${endpoint}/links/${encodeURIComponent(link.id)}`,
          { method: "DELETE" },
        );
        const payload = await response.json() as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to revoke the secure link.");
      }
      setRecoverableLink((current) => current?.snapshotId === snapshotId ? null : current);
      setRevokeTarget(null);
      setOpen(true);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke the secure link.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl bg-[#16857a] px-3 py-2 text-[10px] font-semibold text-white shadow-sm"
      >
        <Send className="size-3.5" />
        <span className="hidden sm:inline">Publish developer handoff</span>
        <span className="sm:hidden">Publish</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Publish developer handoff"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0c1412]/75 p-4 backdrop-blur-sm"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[24px] border border-white/10 bg-[#f5f6f2] text-[#17221f] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-black/8 bg-white px-5 py-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#16857a]">Immutable release</p>
                <h2 className="mt-1 text-lg font-semibold">Publish developer handoff</h2>
                <p className="mt-1 text-xs text-black/45">Creates a permanent snapshot and a new secure read-only link.</p>
              </div>
              <button type="button" disabled={Boolean(busy)} onClick={() => setOpen(false)} aria-label="Close" className="flex size-9 items-center justify-center rounded-xl border border-black/10 text-black/45 disabled:opacity-40">
                <X className="size-4" />
              </button>
            </header>

            <div className="space-y-5 p-5">
              {loading && !summary ? (
                <div className="flex justify-center py-12"><LoaderCircle className="size-5 animate-spin text-[#16857a]" /></div>
              ) : summary ? (
                <>
                  <section className="rounded-2xl border border-black/8 bg-white p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-[#16857a]" />
                      <h3 className="text-sm font-semibold">{summary.file.name}</h3>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        ["Screens", summary.file.screenCount],
                        ["Interactions", summary.file.interactionCount],
                        ["Published notes", summary.file.publishedExplanationCount],
                        ["Drafts excluded", summary.file.draftExplanationCount],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-xl bg-[#f2f3ef] p-3">
                          <dt className="text-[9px] font-semibold uppercase tracking-wide text-black/35">{label}</dt>
                          <dd className="mt-1 text-xl font-semibold">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-3 text-[10px] leading-4 text-black/45">
                      {summary.currentApprovedRevision
                        ? `Tied to approved revision ${summary.currentApprovedRevision.number}, approved by ${summary.currentApprovedRevision.approverDisplayName}.`
                        : "Not tied to client approval."}
                    </p>
                    {summary.file.draftExplanationCount > 0 && (
                      <p className="mt-2 rounded-xl bg-[#fff4d8] px-3 py-2 text-[10px] font-medium text-[#76500b]">
                        {summary.file.draftExplanationCount} draft explanation{summary.file.draftExplanationCount === 1 ? "" : "s"} will be excluded.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={Boolean(busy) || summary.file.screenCount === 0}
                      onClick={() => void publish()}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#16857a] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {busy === "publish" ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
                      Publish version {Math.max(0, ...summary.snapshots.map((item) => item.version)) + 1}
                    </button>
                    {recoverableLink && (
                      <div className="mt-3 rounded-xl border border-[#16857a]/20 bg-[#edf8f5] p-3">
                        <label htmlFor="latest-developer-handoff-link" className="text-[9px] font-bold uppercase tracking-wide text-[#0f665d]">
                          Latest secure link
                        </label>
                        <div className="mt-2 flex gap-2">
                          <input
                            id="latest-developer-handoff-link"
                            readOnly
                            value={recoverableLink.url}
                            onFocus={(event) => event.currentTarget.select()}
                            className="min-w-0 flex-1 rounded-lg border border-black/10 bg-white px-2.5 py-2 font-mono text-[9px] text-black/60 outline-none focus:border-[#16857a]/50"
                          />
                          <button
                            type="button"
                            onClick={() => void copyLink(recoverableLink.url, recoverableLink.snapshotId).then((ok) => {
                              if (!ok) setError("Clipboard access is still blocked. Select and copy the secure URL manually.");
                            })}
                            className="flex items-center gap-1.5 rounded-lg bg-[#16857a] px-3 py-2 text-[9px] font-semibold text-white"
                          >
                            {copied === recoverableLink.snapshotId ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
                            {copied === recoverableLink.snapshotId ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <p className="mt-2 text-[9px] leading-4 text-[#0f665d]/70">For security, this URL is only recoverable while this panel remains open.</p>
                      </div>
                    )}
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-black/40">Published versions</h3>
                    <div className="mt-2 space-y-2">
                      {summary.snapshots.length ? summary.snapshots.map((snapshot) => {
                        const links = linksBySnapshot.get(snapshot.id) ?? [];
                        const active = links.filter((link) => link.status === "ACTIVE" && !link.revokedAt);
                        const usable = active.filter((link) => !link.expiresAt || new Date(link.expiresAt).getTime() > Date.now());
                        const state = usable.length ? "Active" : active.length ? "Expired" : "Revoked";
                        return (
                          <article key={snapshot.id} className="rounded-2xl border border-black/8 bg-white p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <strong className="text-sm">Version {snapshot.version}</strong>
                                  <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase ${usable.length ? "bg-[#dff3ef] text-[#0f665d]" : "bg-black/5 text-black/40"}`}>
                                    {state}
                                  </span>
                                </div>
                                <p className="mt-1 text-[10px] text-black/40">
                                  {new Date(snapshot.publishedAt).toLocaleString()} · {snapshot.publishedByDisplayName}
                                </p>
                                <p className="mt-1 text-[10px] text-black/40">
                                  {snapshot.approvedRevisionNumber
                                    ? `Approved revision ${snapshot.approvedRevisionNumber}`
                                    : "Not tied to client approval"}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={Boolean(busy)}
                                  onClick={() => void createAndCopy(snapshot.id)}
                                  className="flex items-center gap-1.5 rounded-lg border border-black/10 px-2.5 py-1.5 text-[9px] font-semibold disabled:opacity-40"
                                >
                                  {busy === `copy:${snapshot.id}` ? <LoaderCircle className="size-3 animate-spin" /> : copied === snapshot.id ? <Check className="size-3" /> : <ClipboardCopy className="size-3" />}
                                  {copied === snapshot.id ? "Copied" : "Create link"}
                                </button>
                                {usable.length > 0 && (
                                  <button
                                    type="button"
                                    disabled={Boolean(busy)}
                                    onClick={() => {
                                      setOpen(false);
                                      setRevokeTarget({
                                        snapshotId: snapshot.id,
                                        version: snapshot.version,
                                        linkCount: active.length,
                                      });
                                    }}
                                    className="rounded-lg px-2.5 py-1.5 text-[9px] font-semibold text-[#a14428] disabled:opacity-40"
                                  >
                                    {busy === `revoke:${snapshot.id}` ? "Revoking…" : "Revoke"}
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="mt-2 truncate font-mono text-[8px] text-black/25">SHA-256 {snapshot.contentSha256}</p>
                          </article>
                        );
                      }) : (
                        <p className="rounded-2xl border border-dashed border-black/12 px-4 py-8 text-center text-xs text-black/35">No developer handoff versions yet.</p>
                      )}
                    </div>
                  </section>
                </>
              ) : null}
              {error && <p role="alert" className="rounded-xl bg-[#fff0ee] px-3 py-2 text-xs text-[#9f312d]">{error}</p>}
            </div>
          </div>
        </div>
      )}
      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !busy) {
            setRevokeTarget(null);
            setOpen(true);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke developer handoff access?</AlertDialogTitle>
            <AlertDialogDescription>
              This disables {revokeTarget?.linkCount ?? 0} active secure link{revokeTarget?.linkCount === 1 ? "" : "s"} for version {revokeTarget?.version}. The immutable snapshot remains available so you can create a new link later.
              {error && <span className="mt-2 block text-destructive">{error}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(busy)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(busy) || !revokeTarget}
              onClick={() => {
                if (revokeTarget) void revokeSnapshotLinks(revokeTarget.snapshotId);
              }}
            >
              {busy?.startsWith("revoke:") ? "Revoking…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
