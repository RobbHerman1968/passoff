"use client";

import { put } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { toast } from "@/components/ui/toast";
import { isFirstEvent } from "@/lib/analytics/client-flags";
import { track } from "@/lib/analytics/events";

type RoomAsset = {
  revisionAssetId: string;
  sortOrder: number;
  asset: {
    id: string;
    label: string;
    kind: string;
    mime: string | null;
    width: number | null;
    height: number | null;
    externalUrl: string | null;
    url: string | null;
  };
};

type RoomComment = {
  id: string;
  revisionAssetId: string;
  body: string;
  status: string;
  xPercent: string | number;
  yPercent: string | number;
};

type RoomBundle = {
  project: {
    id: string;
    name: string;
    clientName: string;
    status: string;
    handoffReleasedAt: string | Date | null;
  };
  draft: { id: string; number: number; status: string } | null;
  published: {
    id: string;
    number: number;
    status: string;
    contentDigest: string | null;
  } | null;
  membership: RoomAsset[];
  comments: RoomComment[];
  shareLink: { id: string; viewCount: number; lastViewedAt?: string | Date | null } | null;
  handoff: Array<{ id: string; label: string; category: string; notes: string | null; externalUrl: string | null }>;
  approvals: Array<{ id: string; decision: string; contentDigest: string; approvedAt: string | Date }>;
};

type Phase = "add" | "publish" | "share" | "review" | "handoff";
type PrimaryKind =
  | "upload"
  | "publish"
  | "share_create"
  | "share_copy"
  | "revise"
  | "handoff"
  | "none";
type RailTab = "ready" | "feedback" | "handoff";

type NextAction = {
  phase: Phase;
  completedThrough: Phase;
  primary: PrimaryKind;
  label: string;
  coach: string;
  busyLabel: string;
};

const PHASES: { id: Phase; label: string }[] = [
  { id: "add", label: "Add" },
  { id: "publish", label: "Publish" },
  { id: "share", label: "Share" },
  { id: "review", label: "Review" },
  { id: "handoff", label: "Handoff" },
];

const PHASE_ORDER: Phase[] = ["add", "publish", "share", "review", "handoff"];

function shareStorageKey(roomId: string) {
  return `passoff:shareUrl:${roomId}`;
}

function deriveNextAction(bundle: RoomBundle, shareUrl: string | null): NextAction {
  const status = bundle.project.status;
  const hasAssets = bundle.membership.length > 0;
  const hasPublished = Boolean(bundle.published);
  const hasDraftAssets = Boolean(bundle.draft) && hasAssets;
  const draftNeedsPublish =
    hasDraftAssets &&
    (!hasPublished || (bundle.draft && bundle.published && bundle.draft.number > bundle.published.number));
  const canPublish =
    hasAssets &&
    bundle.draft &&
    (status === "CHANGES_REQUESTED" ||
      status === "DRAFT" ||
      !hasPublished ||
      (bundle.draft.status === "DRAFT" && draftNeedsPublish) ||
      (bundle.draft && hasAssets && (!bundle.published || bundle.draft.id !== bundle.published.id)));

  const hasShare = Boolean(bundle.shareLink) || Boolean(shareUrl);
  const openComments = bundle.comments.filter((c) => c.status === "OPEN").length;
  const views = bundle.shareLink?.viewCount ?? 0;

  if (status === "ARCHIVED") {
    return {
      phase: hasPublished ? "review" : "add",
      completedThrough: bundle.handoff.length ? "handoff" : hasPublished ? "review" : "add",
      primary: "none",
      label: "",
      coach: "This room is archived.",
      busyLabel: "",
    };
  }

  if (!hasAssets) {
    return {
      phase: "add",
      completedThrough: "add",
      primary: "upload",
      label: "Add work",
      coach: "Add screenshots, a PDF, or a review URL.",
      busyLabel: "Uploading…",
    };
  }

  if (status === "APPROVED") {
    return {
      phase: "handoff",
      completedThrough: bundle.handoff.length ? "handoff" : "review",
      primary: "handoff",
      label: "Add handoff item",
      coach: "Approved. Add final files or notes for delivery.",
      busyLabel: "Saving…",
    };
  }

  if (status === "CHANGES_REQUESTED") {
    if (canPublish || (bundle.draft && hasAssets)) {
      return {
        phase: "publish",
        completedThrough: "review",
        primary: "publish",
        label: "Publish new revision",
        coach:
          openComments > 0
            ? `Client asked for changes (${openComments} open). Resolve what you can, then publish a new revision.`
            : "Client asked for changes. Fix the work, then publish a new revision.",
        busyLabel: "Publishing…",
      };
    }
    return {
      phase: "review",
      completedThrough: "review",
      primary: "revise",
      label: "Start new revision",
      coach: "Client asked for changes. Open a new draft, then upload fixes and publish.",
      busyLabel: "Starting…",
    };
  }

  if (canPublish || (status === "DRAFT" && hasAssets && !hasPublished)) {
    return {
      phase: "publish",
      completedThrough: "add",
      primary: "publish",
      label: "Publish revision",
      coach: "Publish when this set is ready for the client.",
      busyLabel: "Publishing…",
    };
  }

  if (bundle.draft && hasAssets && bundle.published && bundle.draft.number > bundle.published.number) {
    return {
      phase: "publish",
      completedThrough: "share",
      primary: "publish",
      label: "Publish revision",
      coach: "You have an unpublished draft. Publish when ready to send updates.",
      busyLabel: "Publishing…",
    };
  }

  if (hasPublished && !hasShare) {
    return {
      phase: "share",
      completedThrough: "publish",
      primary: "share_create",
      label: "Create & copy share link",
      coach: "Send this link — no client login required.",
      busyLabel: "Creating link…",
    };
  }

  if (hasPublished && hasShare && (status === "SENT" || status === "VIEWED" || status === "DRAFT")) {
    return {
      phase: "review",
      completedThrough: status === "VIEWED" ? "review" : "share",
      primary: shareUrl ? "share_copy" : "share_create",
      label: shareUrl ? "Copy share link" : "Create a copyable link",
      coach:
        status === "VIEWED"
          ? `${bundle.project.clientName} opened the link · ${views} view${views === 1 ? "" : "s"}. Waiting on a decision.`
          : `Waiting on ${bundle.project.clientName}. ${views} view${views === 1 ? "" : "s"}.`,
      busyLabel: shareUrl ? "Copying…" : "Creating link…",
    };
  }

  if (hasPublished && hasShare) {
    return {
      phase: "review",
      completedThrough: "share",
      primary: shareUrl ? "share_copy" : "share_create",
      label: shareUrl ? "Copy share link" : "Create a copyable link",
      coach: `Share link is active · ${views} view${views === 1 ? "" : "s"}.`,
      busyLabel: shareUrl ? "Copying…" : "Creating link…",
    };
  }

  return {
    phase: "add",
    completedThrough: "add",
    primary: "upload",
    label: "Add work",
    coach: "Add screenshots, a PDF, or a review URL.",
    busyLabel: "Uploading…",
  };
}

function phaseIndex(phase: Phase) {
  return PHASE_ORDER.indexOf(phase);
}

function defaultRailTab(phase: Phase, showFeedback: boolean, showHandoff: boolean): RailTab {
  if (phase === "handoff" && showHandoff) return "handoff";
  if (showFeedback && (phase === "review" || phase === "share" || phase === "publish")) return "feedback";
  if (showHandoff && !showFeedback) return "handoff";
  return "ready";
}

export function RoomWorkspace({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<RoomBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlLabel, setUrlLabel] = useState("");
  const [handoffLabel, setHandoffLabel] = useState("");
  const [handoffNotes, setHandoffNotes] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [assetMenuId, setAssetMenuId] = useState<string | null>(null);
  const [urlFormOpen, setUrlFormOpen] = useState(false);
  const [railTab, setRailTab] = useState<RailTab>("ready");
  const [railTabTouched, setRailTabTouched] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(shareStorageKey(roomId));
      if (stored) setShareUrl(stored);
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as RoomBundle & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Unable to load room.");
    setBundle(payload);
    setSelectedAssetId((current) => {
      if (current && payload.membership.some((m) => m.revisionAssetId === current)) return current;
      return payload.membership[0]?.revisionAssetId ?? null;
    });
  }, [roomId]);

  useEffect(() => {
    load().catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load."));
  }, [load]);

  const selected = useMemo(
    () => bundle?.membership.find((m) => m.revisionAssetId === selectedAssetId) || bundle?.membership[0],
    [bundle, selectedAssetId],
  );

  const next = useMemo(
    () => (bundle ? deriveNextAction(bundle, shareUrl) : null),
    [bundle, shareUrl],
  );

  useEffect(() => {
    if (!next || !bundle || railTabTouched) return;
    const showFeedback = Boolean(bundle.published);
    const showHandoff = bundle.project.status === "APPROVED" || bundle.handoff.length > 0;
    setRailTab(defaultRailTab(next.phase, showFeedback, showHandoff));
  }, [next, bundle, railTabTouched]);

  async function run(action: () => Promise<void>, label?: string) {
    setBusy(true);
    setBusyLabel(label || null);
    try {
      await action();
      await load();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  function persistShareUrl(url: string) {
    setShareUrl(url);
    try {
      sessionStorage.setItem(shareStorageKey(roomId), url);
    } catch {
      /* ignore */
    }
  }

  async function createShareLink(copy = true) {
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/share-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Share link failed.");
      }
      persistShareUrl(payload.url);
      if (isFirstEvent("share")) {
        track("first_review_link_created", { roomId });
      }
      if (copy) {
        await navigator.clipboard.writeText(payload.url).catch(() => undefined);
        toast.success("Share link copied to clipboard.");
      } else {
        toast.success("New share link created.");
      }
    }, "Creating link…");
  }

  async function copyShareLink() {
    if (!shareUrl) {
      await createShareLink(true);
      return;
    }
    setBusy(true);
    setBusyLabel("Copying…");
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Share link copied to clipboard.");
    } catch {
      toast.error("Could not copy — select the link and copy manually.");
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  async function onUpload(fileList: FileList | null) {
    if (!fileList?.length) return;
    await run(async () => {
      for (const file of Array.from(fileList)) {
        try {
          const prepare = await fetch(`/api/projects/${encodeURIComponent(roomId)}/uploads`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "prepare",
              fileName: file.name,
              contentType: file.type || "application/octet-stream",
              size: file.size,
            }),
          });
          const prepared = (await prepare.json()) as {
            pathname?: string;
            clientToken?: string;
            error?: string;
            fallback?: string;
          };
          if (prepare.status === 501 || prepared.fallback === "multipart") {
            throw new Error(prepared.error || "blob_unavailable");
          }
          if (!prepare.ok || !prepared.pathname || !prepared.clientToken) {
            throw new Error(prepared.error || "Upload authorization failed.");
          }
          await put(prepared.pathname, file, {
            access: "private",
            token: prepared.clientToken,
            multipart: file.size > 5 * 1024 * 1024,
          });
        } catch {
          const form = new FormData();
          form.set("file", file);
          const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/assets`, {
            method: "POST",
            body: form,
          });
          const payload = (await response.json()) as { error?: string };
          if (!response.ok) throw new Error(payload.error || "Upload failed.");
        }
      }
      toast.success(fileList.length > 1 ? "Files uploaded." : "File uploaded.");
    }, "Uploading…");
  }

  async function addReviewUrl() {
    if (!urlInput.trim() || !urlLabel.trim()) return;
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), label: urlLabel.trim() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "URL add failed.");
      setUrlInput("");
      setUrlLabel("");
      setUrlFormOpen(false);
      toast.success("Review URL added.");
    }, "Adding URL…");
  }

  async function removeAsset(revisionAssetId: string) {
    await run(async () => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(roomId)}/assets/${encodeURIComponent(revisionAssetId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to remove asset.");
      toast.success("Asset removed from draft.");
    }, "Removing…");
  }

  async function moveAsset(revisionAssetId: string, direction: -1 | 1) {
    if (!bundle) return;
    const ids = bundle.membership.map((m) => m.revisionAssetId);
    const index = ids.indexOf(revisionAssetId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const reordered = [...ids];
    const [item] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, item!);
    setBundle({
      ...bundle,
      membership: reordered.map((id, sortOrder) => {
        const row = bundle.membership.find((m) => m.revisionAssetId === id)!;
        return { ...row, sortOrder };
      }),
    });
    setAssetMenuId(null);
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedRevisionAssetIds: reordered }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Reorder failed.");
    }, "Reordering…");
  }

  async function renameAsset(revisionAssetId: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) {
      toast.error("Name is required.");
      return;
    }
    await run(async () => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(roomId)}/assets/${encodeURIComponent(revisionAssetId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: trimmed }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to rename.");
      setRenamingId(null);
      setRenameValue("");
      toast.success("Renamed.");
    }, "Renaming…");
  }

  function startRename(item: RoomAsset) {
    setSelectedAssetId(item.revisionAssetId);
    setRenamingId(item.revisionAssetId);
    setRenameValue(item.asset.label);
    setAssetMenuId(null);
  }

  async function publishRevision() {
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/publish`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Publish failed.");
      if (isFirstEvent("publish")) {
        track("first_revision_published", {
          roomId,
          revisionNumber: bundle?.draft?.number ?? bundle?.published?.number ?? 1,
        });
      }
      toast.success("Revision published. Create a share link to send it.");
    }, "Publishing…");
  }

  async function reopenRevision() {
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Reopen failed.");
      toast.success("New draft revision opened.");
    }, "Starting…");
  }

  async function archiveRoom() {
    await run(async () => {
      const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Archive failed.");
      toast.success("Room archived.");
    }, "Archiving…");
  }

  async function runPrimary() {
    if (!next) return;
    switch (next.primary) {
      case "publish":
        await publishRevision();
        break;
      case "share_create":
        await createShareLink(true);
        break;
      case "share_copy":
        await copyShareLink();
        break;
      case "revise":
        await reopenRevision();
        break;
      case "handoff":
        setRailTab("handoff");
        setRailTabTouched(true);
        window.setTimeout(() => document.getElementById("handoff-label")?.focus(), 50);
        break;
      case "upload":
        document.getElementById("room-upload-input")?.click();
        break;
      default:
        break;
    }
  }

  if (!bundle || !next) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-black/45">
        {loadError || (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" /> Loading room…
          </span>
        )}
      </div>
    );
  }

  const openComments = bundle.comments.filter((c) => c.status === "OPEN");
  const isEmpty = bundle.membership.length === 0;
  const archived = bundle.project.status === "ARCHIVED";
  const canEditDraft = Boolean(bundle.draft) && !archived;
  const showFeedback = Boolean(bundle.published);
  const showHandoff = bundle.project.status === "APPROVED" || bundle.handoff.length > 0;
  const showShareChrome =
    Boolean(bundle.published) &&
    (Boolean(shareUrl) || Boolean(bundle.shareLink) || next.phase === "share" || next.phase === "review");
  const currentIdx = phaseIndex(next.phase);
  const completedIdx = phaseIndex(next.completedThrough);
  const selectedIndex = selected
    ? bundle.membership.findIndex((m) => m.revisionAssetId === selected.revisionAssetId)
    : -1;

  const statusLine = [
    bundle.project.status.replaceAll("_", " "),
    bundle.published ? `Rev ${bundle.published.number}` : null,
    bundle.draft && (!bundle.published || bundle.draft.number !== bundle.published.number)
      ? `Draft r${bundle.draft.number}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function chooseRail(tab: RailTab) {
    setRailTab(tab);
    setRailTabTouched(true);
  }

  async function resolveComment(commentId: string) {
    await run(async () => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(roomId)}/comments/${encodeURIComponent(commentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RESOLVED" }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Resolve failed.");
      toast.success("Comment resolved.");
    }, "Resolving…");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-30 shrink-0 border-b border-[#a594f5]/20 bg-[#faf8ff]/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 lg:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="truncate text-sm font-semibold tracking-[-0.03em]">{bundle.project.name}</h1>
              <span className="truncate text-[11px] text-black/40">{bundle.project.clientName}</span>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-black/50">
              <span className="font-medium text-black/55">{statusLine}</span>
              <span className="mx-1.5 text-black/25">·</span>
              {next.coach}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showShareChrome ? (
              <div className="flex max-w-[220px] items-center gap-1 rounded-lg border border-[#a594f5]/30 bg-white px-2 py-1">
                {shareUrl ? (
                  <>
                    <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-black/55">{shareUrl}</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => copyShareLink()}
                      className="rounded p-1 text-[#6354d4] hover:bg-[#f3f0ff]"
                      title="Copy share link"
                    >
                      <Copy className="size-3.5" />
                    </button>
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded p-1 text-[#6354d4] hover:bg-[#f3f0ff]"
                      title="Open share link"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !bundle.published || archived}
                    onClick={() => createShareLink(true)}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#6354d4] disabled:opacity-50"
                  >
                    <Link2 className="size-3.5" /> Create link
                  </button>
                )}
              </div>
            ) : null}

            {next.primary !== "none" ? (
              <button
                type="button"
                disabled={busy || archived}
                onClick={() => runPrimary()}
                className="inline-flex items-center gap-2 rounded-lg bg-[#6354d4] px-3.5 py-2 text-[11px] font-semibold text-white disabled:opacity-60"
              >
                {busy && busyLabel ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    {busyLabel}
                  </>
                ) : (
                  next.label
                )}
              </button>
            ) : null}

            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((o) => !o)}
                aria-label="More actions"
                className="flex size-8 items-center justify-center rounded-lg border border-black/10 bg-white text-black/50"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {moreOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-1 min-w-[180px] rounded-xl border border-black/10 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      disabled={busy || archived}
                      onClick={() => {
                        setMoreOpen(false);
                        reopenRevision();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-black/65 hover:bg-[#f7f4ff] disabled:opacity-50"
                    >
                      <RefreshCw className="size-3.5" /> New revision
                    </button>
                    {bundle.shareLink || shareUrl ? (
                      <button
                        type="button"
                        disabled={busy || archived || !bundle.published}
                        onClick={() => {
                          setMoreOpen(false);
                          createShareLink(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-black/65 hover:bg-[#f7f4ff] disabled:opacity-50"
                      >
                        <Link2 className="size-3.5" /> Rotate share link
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || archived}
                      onClick={() => {
                        setMoreOpen(false);
                        archiveRoom();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-black/65 hover:bg-[#f7f4ff] disabled:opacity-50"
                    >
                      <Archive className="size-3.5" /> Archive
                    </button>
                    <Link
                      href="/dashboard"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-black/65 hover:bg-[#f7f4ff]"
                    >
                      ← Dashboard
                    </Link>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <nav aria-label="Room progress" className="flex items-center gap-1 overflow-x-auto px-4 pb-2 lg:px-5">
          {PHASES.map((step, index) => {
            const done = index < completedIdx || (index === completedIdx && index < currentIdx);
            const current = step.id === next.phase;
            return (
              <span key={step.id} className="flex items-center gap-1">
                {index > 0 ? <span className="mx-0.5 h-px w-3 bg-black/15" aria-hidden /> : null}
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    current
                      ? "bg-[#6354d4] text-white"
                      : done
                        ? "text-[#6354d4]"
                        : "text-black/30"
                  }`}
                >
                  {done && !current ? <Check className="size-2.5" /> : null}
                  {step.label}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-md rounded-2xl border border-dashed border-[#a594f5]/45 bg-white p-8 text-center sm:p-10">
            <Upload className="mx-auto size-8 text-[#6354d4]" />
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Add work to review</h2>
            <p className="mt-2 text-sm text-black/50">
              Upload screenshots or a PDF, or paste a staging URL. Then publish a revision and share a magic
              link.
            </p>
            <label className="mt-6 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-5 py-3 text-[12px] font-semibold text-white">
              <Upload className="size-4" />
              Upload image / PDF
              <input
                id="room-upload-input"
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                disabled={busy || archived}
                onChange={(e) => onUpload(e.target.files)}
              />
            </label>
            <form
              className="mt-6 text-left"
              onSubmit={(e) => {
                e.preventDefault();
                if (archived) return;
                addReviewUrl();
              }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                Or add a review URL
              </p>
              <input
                value={urlLabel}
                onChange={(e) => setUrlLabel(e.target.value)}
                placeholder="Name (e.g. Staging site)"
                disabled={busy || archived}
                className="mt-2 w-full rounded-lg border border-black/10 px-2.5 py-2 text-xs outline-none focus:border-[#6354d4]"
              />
              <input
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://"
                disabled={busy || archived}
                className="mt-2 w-full rounded-lg border border-black/10 px-2.5 py-2 text-xs outline-none focus:border-[#6354d4]"
              />
              <button
                type="submit"
                disabled={busy || archived || !urlInput.trim() || !urlLabel.trim()}
                className="mt-2 w-full rounded-lg border border-[#a594f5]/40 px-3 py-2 text-[11px] font-semibold text-[#6354d4] disabled:opacity-50"
              >
                Add URL
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Main stage */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Filmstrip */}
            <div className="shrink-0 border-b border-[#a594f5]/15 bg-[#f7f4ff]/80">
              <div className="flex items-stretch gap-2 overflow-x-auto px-3 py-2 lg:px-4">
                {bundle.membership.map((item, index) => {
                  const isSelected = selected?.revisionAssetId === item.revisionAssetId;
                  const isRenaming = renamingId === item.revisionAssetId;
                  const thumb =
                    item.asset.kind !== "url" && item.asset.url && item.asset.mime !== "application/pdf"
                      ? item.asset.url
                      : null;
                  return (
                    <div key={item.revisionAssetId} className="relative shrink-0">
                      {isRenaming ? (
                        <form
                          className="flex h-[72px] w-[120px] items-center rounded-lg border border-[#6354d4] bg-white p-1.5"
                          onSubmit={(e) => {
                            e.preventDefault();
                            renameAsset(item.revisionAssetId, renameValue);
                          }}
                        >
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim() && renameValue.trim() !== item.asset.label) {
                                renameAsset(item.revisionAssetId, renameValue);
                              } else {
                                setRenamingId(null);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setRenamingId(null);
                              }
                            }}
                            disabled={busy}
                            className="w-full rounded border border-black/10 px-1.5 py-1 text-[11px] outline-none"
                            aria-label="Asset name"
                          />
                        </form>
                      ) : (
                        <div
                          className={`group relative flex h-[72px] w-[120px] flex-col overflow-hidden rounded-lg border transition ${
                            isSelected
                              ? "border-[#6354d4] ring-2 ring-[#6354d4]/25"
                              : "border-black/10 bg-white hover:border-[#a594f5]/50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAssetId(item.revisionAssetId);
                              setAssetMenuId(null);
                            }}
                            className="relative min-h-0 flex-1 bg-[#ebe6f8] text-left"
                            aria-label={`Select ${item.asset.label}`}
                          >
                            {thumb ? (
                               
                              <img src={thumb} alt="" className="absolute inset-0 size-full object-cover object-top" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-black/35">
                                {item.asset.kind === "url"
                                  ? "URL"
                                  : item.asset.mime === "application/pdf"
                                    ? "PDF"
                                    : "File"}
                              </div>
                            )}
                          </button>
                          <div
                            className={`flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium ${
                              isSelected ? "bg-[#6354d4] text-white" : "bg-white text-black/65"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAssetId(item.revisionAssetId);
                                setAssetMenuId(null);
                              }}
                              className="min-w-0 flex-1 truncate text-left"
                            >
                              {item.asset.label}
                            </button>
                            {canEditDraft ? (
                              <button
                                type="button"
                                aria-label={`Asset actions for ${item.asset.label}`}
                                onClick={() => {
                                  setAssetMenuId((id) =>
                                    id === item.revisionAssetId ? null : item.revisionAssetId,
                                  );
                                  setSelectedAssetId(item.revisionAssetId);
                                }}
                                className={`rounded p-0.5 ${
                                  isSelected ? "hover:bg-white/20" : "hover:bg-black/5"
                                }`}
                              >
                                <MoreHorizontal className="size-3" />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      )}

                      {assetMenuId === item.revisionAssetId && canEditDraft ? (
                        <>
                          <button
                            type="button"
                            aria-label="Close asset menu"
                            className="fixed inset-0 z-10 cursor-default"
                            onClick={() => setAssetMenuId(null)}
                          />
                          <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-black/10 bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              disabled={busy || index === 0}
                              onClick={() => moveAsset(item.revisionAssetId, -1)}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-black/65 hover:bg-[#f7f4ff] disabled:opacity-40"
                            >
                              <ChevronLeft className="size-3.5" /> Move earlier
                            </button>
                            <button
                              type="button"
                              disabled={busy || index === bundle.membership.length - 1}
                              onClick={() => moveAsset(item.revisionAssetId, 1)}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-black/65 hover:bg-[#f7f4ff] disabled:opacity-40"
                            >
                              <ChevronRight className="size-3.5" /> Move later
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startRename(item)}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-black/65 hover:bg-[#f7f4ff]"
                            >
                              <Pencil className="size-3.5" /> Rename
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setAssetMenuId(null);
                                removeAsset(item.revisionAssetId);
                              }}
                              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-red-600/80 hover:bg-red-50"
                            >
                              <Trash2 className="size-3.5" /> Remove
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}

                {canEditDraft ? (
                  <div className="flex shrink-0 items-stretch gap-1.5">
                    <label className="flex h-[72px] w-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#a594f5]/50 bg-white text-[#6354d4] transition hover:bg-[#f7f4ff]">
                      <Upload className="size-4" />
                      <span className="text-[9px] font-semibold uppercase tracking-wide">Upload</span>
                      <input
                        id="room-upload-input"
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        className="hidden"
                        disabled={busy || archived}
                        onChange={(e) => onUpload(e.target.files)}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || archived}
                      onClick={() => setUrlFormOpen((o) => !o)}
                      className={`flex h-[72px] w-[72px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-[9px] font-semibold uppercase tracking-wide transition ${
                        urlFormOpen
                          ? "border-[#6354d4] bg-[#ebe6fa] text-[#6354d4]"
                          : "border-[#a594f5]/50 bg-white text-[#6354d4] hover:bg-[#f7f4ff]"
                      }`}
                    >
                      <Plus className="size-4" />
                      URL
                    </button>
                  </div>
                ) : (
                  <input id="room-upload-input" type="file" className="hidden" disabled />
                )}
              </div>

              {urlFormOpen && canEditDraft ? (
                <form
                  className="flex flex-wrap items-end gap-2 border-t border-[#a594f5]/15 px-3 py-2 lg:px-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addReviewUrl();
                  }}
                >
                  <div className="min-w-[140px] flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                      Name
                    </label>
                    <input
                      value={urlLabel}
                      onChange={(e) => setUrlLabel(e.target.value)}
                      placeholder="Staging site"
                      disabled={busy}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#6354d4]"
                    />
                  </div>
                  <div className="min-w-[180px] flex-[2]">
                    <label className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                      URL
                    </label>
                    <input
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://"
                      disabled={busy}
                      className="mt-1 w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#6354d4]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !urlInput.trim() || !urlLabel.trim()}
                    className="rounded-lg bg-[#6354d4] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Add URL
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlFormOpen(false)}
                    className="rounded-lg p-1.5 text-black/40 hover:bg-black/5"
                    aria-label="Close URL form"
                  >
                    <X className="size-4" />
                  </button>
                </form>
              ) : null}

              {!canEditDraft && bundle.published && !bundle.draft ? (
                <p className="px-4 pb-2 text-[10px] text-black/35">
                  Published assets are locked. Use More → New revision to change them.
                </p>
              ) : null}
            </div>

            {/* Preview canvas */}
            <section className="relative flex min-h-[50vh] flex-1 items-center justify-center overflow-auto bg-[#e8e4f4] lg:min-h-0">
              {selected && selectedIndex >= 0 ? (
                <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-black/10 bg-white/90 px-2 py-1 text-[10px] font-medium text-black/50 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    disabled={selectedIndex <= 0}
                    onClick={() => {
                      const prev = bundle.membership[selectedIndex - 1];
                      if (prev) setSelectedAssetId(prev.revisionAssetId);
                    }}
                    className="rounded p-1 disabled:opacity-30 hover:bg-black/5"
                    aria-label="Previous asset"
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>
                  <span>
                    {selectedIndex + 1} / {bundle.membership.length}
                  </span>
                  <button
                    type="button"
                    disabled={selectedIndex >= bundle.membership.length - 1}
                    onClick={() => {
                      const nxt = bundle.membership[selectedIndex + 1];
                      if (nxt) setSelectedAssetId(nxt.revisionAssetId);
                    }}
                    className="rounded p-1 disabled:opacity-30 hover:bg-black/5"
                    aria-label="Next asset"
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              ) : null}

              {selected?.asset.kind === "url" ? (
                <div className="m-6 flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-black/8 bg-white p-8 text-center shadow-sm">
                  <p className="text-base font-semibold">{selected.asset.label}</p>
                  <p className="text-xs text-black/40">External review URL</p>
                  <a
                    href={selected.asset.externalUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm text-[#6354d4] underline"
                  >
                    {selected.asset.externalUrl}
                  </a>
                </div>
              ) : selected?.asset.url ? (
                selected.asset.mime === "application/pdf" ? (
                  <iframe
                    title={selected.asset.label}
                    src={selected.asset.url}
                    className="h-full min-h-[50vh] w-full bg-white lg:min-h-0"
                  />
                ) : (
                   
                  <img
                    src={selected.asset.url}
                    alt={selected.asset.label}
                    className="max-h-full max-w-full object-contain p-4 shadow-[0_12px_40px_rgba(40,30,70,0.12)]"
                  />
                )
              ) : (
                <p className="text-sm text-black/40">Select an asset to preview.</p>
              )}
            </section>
          </div>

          {/* Contextual side rail — stacks under preview on mobile */}
          <aside className="flex max-h-[42vh] w-full shrink-0 flex-col border-t border-[#a594f5]/20 bg-[#faf8ff] lg:max-h-none lg:w-[300px] lg:border-l lg:border-t-0">
            <div className="flex shrink-0 gap-1 border-b border-[#a594f5]/15 p-2">
              <button
                type="button"
                onClick={() => chooseRail("ready")}
                className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                  railTab === "ready" ? "bg-[#6354d4] text-white" : "text-black/40 hover:bg-black/5"
                }`}
              >
                Ready
              </button>
              {showFeedback ? (
                <button
                  type="button"
                  onClick={() => chooseRail("feedback")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    railTab === "feedback" ? "bg-[#6354d4] text-white" : "text-black/40 hover:bg-black/5"
                  }`}
                >
                  Feedback
                  {openComments.length ? (
                    <span className="ml-1 opacity-80">{openComments.length}</span>
                  ) : null}
                </button>
              ) : null}
              {showHandoff ? (
                <button
                  type="button"
                  onClick={() => chooseRail("handoff")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                    railTab === "handoff" ? "bg-[#6354d4] text-white" : "text-black/40 hover:bg-black/5"
                  }`}
                >
                  Handoff
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {railTab === "ready" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                      Next step
                    </p>
                    <p className="mt-2 text-sm leading-6 text-black/65">{next.coach}</p>
                  </div>
                  <ul className="space-y-2 text-xs text-black/55">
                    <li className="flex items-start gap-2">
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          bundle.membership.length ? "text-[#6354d4]" : "text-black/20"
                        }`}
                      />
                      {bundle.membership.length} asset{bundle.membership.length === 1 ? "" : "s"} in this
                      revision
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          bundle.published ? "text-[#6354d4]" : "text-black/20"
                        }`}
                      />
                      {bundle.published
                        ? `Published revision ${bundle.published.number}`
                        : "Not published yet"}
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          bundle.shareLink || shareUrl ? "text-[#6354d4]" : "text-black/20"
                        }`}
                      />
                      {bundle.shareLink || shareUrl
                        ? `Share link active · ${bundle.shareLink?.viewCount ?? 0} views`
                        : "No share link yet"}
                    </li>
                    <li className="flex items-start gap-2">
                      <Check
                        className={`mt-0.5 size-3.5 shrink-0 ${
                          openComments.length === 0 && showFeedback ? "text-[#6354d4]" : "text-black/20"
                        }`}
                      />
                      {showFeedback
                        ? `${openComments.length} open comment${openComments.length === 1 ? "" : "s"}`
                        : "Feedback after publish"}
                    </li>
                  </ul>
                  {canEditDraft ? (
                    <p className="text-[11px] leading-5 text-black/40">
                      Rename, reorder, or remove assets from the filmstrip before you publish.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {railTab === "feedback" && showFeedback ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                      Client feedback
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      {openComments.length} open
                      {bundle.comments.length ? ` · ${bundle.comments.length} total` : null}
                    </p>
                  </div>
                  {bundle.comments.length === 0 ? (
                    <p className="text-xs text-black/40">No client comments yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {bundle.comments.map((comment) => (
                        <li key={comment.id} className="rounded-xl bg-white px-3 py-2.5 text-xs shadow-sm">
                          <p className="text-black/70">{comment.body}</p>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] uppercase tracking-[0.12em] text-black/35">
                              {comment.status}
                            </span>
                            {comment.status === "OPEN" && !archived ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => resolveComment(comment.id)}
                                className="font-semibold text-[#6354d4]"
                              >
                                Resolve
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {bundle.approvals.length > 0 ? (
                    <div className="border-t border-black/8 pt-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                        Approval history
                      </p>
                      <ul className="mt-2 space-y-2">
                        {bundle.approvals.map((a) => (
                          <li key={a.id} className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm">
                            <p className="font-semibold capitalize">{a.decision.replace("_", " ")}</p>
                            <p className="mt-1 truncate font-mono text-[10px] text-black/40">
                              {a.contentDigest.slice(0, 16)}…
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {railTab === "handoff" && showHandoff ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                      Delivery handoff
                    </p>
                    <p className="mt-1 text-xs text-black/45">
                      Items appear on the client link once added.
                    </p>
                  </div>
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!handoffLabel.trim() || archived) return;
                      run(async () => {
                        const response = await fetch(`/api/projects/${encodeURIComponent(roomId)}/handoff`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            label: handoffLabel.trim(),
                            notes: handoffNotes.trim() || undefined,
                            category: "note",
                          }),
                        });
                        const payload = (await response.json()) as { error?: string };
                        if (!response.ok) throw new Error(payload.error || "Handoff failed.");
                        setHandoffLabel("");
                        setHandoffNotes("");
                        toast.success("Handoff item added for the client.");
                      }, "Saving…");
                    }}
                  >
                    <input
                      id="handoff-label"
                      value={handoffLabel}
                      onChange={(e) => setHandoffLabel(e.target.value)}
                      placeholder="Final files / login notes"
                      disabled={busy || archived || bundle.project.status !== "APPROVED"}
                      className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs outline-none focus:border-[#6354d4]"
                    />
                    <textarea
                      value={handoffNotes}
                      onChange={(e) => setHandoffNotes(e.target.value)}
                      placeholder="Optional notes"
                      rows={3}
                      disabled={busy || archived || bundle.project.status !== "APPROVED"}
                      className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs outline-none focus:border-[#6354d4]"
                    />
                    <button
                      type="submit"
                      disabled={
                        busy || archived || bundle.project.status !== "APPROVED" || !handoffLabel.trim()
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60"
                    >
                      <Package className="size-3.5" />
                      {busy && busyLabel === "Saving…" ? "Saving…" : "Add handoff item"}
                    </button>
                  </form>
                  <ul className="space-y-2">
                    {bundle.handoff.map((item) => (
                      <li key={item.id} className="rounded-xl bg-white px-3 py-2.5 text-xs shadow-sm">
                        <p className="font-semibold">{item.label}</p>
                        {item.notes ? <p className="mt-1 text-black/50">{item.notes}</p> : null}
                        {item.externalUrl ? (
                          <a
                            href={item.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-[#6354d4] underline"
                          >
                            Open link
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
