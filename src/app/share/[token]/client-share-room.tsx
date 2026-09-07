"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ExternalLink, LoaderCircle, MessageSquare, Package } from "lucide-react";

import { ApprovalReceipt } from "@/components/approval-receipt";
import type { ApprovalReceiptView } from "@/lib/rooms/approval-receipt";

type ShareAsset = {
  revisionAssetId: string;
  id: string;
  label: string;
  kind: string;
  mime: string | null;
  url: string | null;
  externalUrl: string | null;
};

type ShareComment = {
  id: string;
  revisionAssetId: string;
  reviewerId: string | null;
  xPercent: number;
  yPercent: number;
  body: string;
  status: string;
};

type ShareHandoff = {
  id: string;
  label: string;
  category: string;
  notes: string | null;
  externalUrl: string | null;
  downloadUrl?: string | null;
};

type SharePayload = {
  project: { name: string; clientName: string; status: string; handoffReleasedAt: string | null };
  revision: { id: string; number: number; contentDigest: string | null };
  assets: ShareAsset[];
  comments: ShareComment[];
  handoff?: ShareHandoff[];
  approvalStatement: string;
  approvalReceipt?: ApprovalReceiptView | null;
  error?: string;
};

type RememberedIdentity = { name: string; email: string };

function identityStorageKey(token: string) {
  return `passoff:reviewer:${token}`;
}

function readRemembered(token: string): RememberedIdentity | null {
  try {
    const raw = localStorage.getItem(identityStorageKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedIdentity>;
    if (typeof parsed.name !== "string" || typeof parsed.email !== "string") return null;
    if (!parsed.name.trim() || !parsed.email.trim()) return null;
    return { name: parsed.name, email: parsed.email };
  } catch {
    return null;
  }
}

function writeRemembered(token: string, identity: RememberedIdentity) {
  try {
    localStorage.setItem(identityStorageKey(token), JSON.stringify(identity));
  } catch {
    /* ignore */
  }
}

function clearRemembered(token: string) {
  try {
    localStorage.removeItem(identityStorageKey(token));
  } catch {
    /* ignore */
  }
}

export function ClientShareRoom({ token }: { token: string }) {
  const [data, setData] = useState<SharePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [hasRemembered, setHasRemembered] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [reviewerId, setReviewerId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const viewed = useRef(false);

  useEffect(() => {
    const remembered = readRemembered(token);
    if (remembered) {
      setName(remembered.name);
      setEmail(remembered.email);
      setRememberMe(true);
      setHasRemembered(true);
    }
  }, [token]);

  const load = useCallback(async () => {
    const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    const payload = (await response.json()) as SharePayload;
    if (!response.ok) throw new Error(payload.error || "This link is unavailable.");
    setData(payload);
    setSelectedId((current) => {
      if (current && payload.assets.some((a) => a.revisionAssetId === current)) return current;
      return payload.assets[0]?.revisionAssetId ?? null;
    });
  }, [token]);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load."));
  }, [load]);

  // Restore HttpOnly reviewer session when a remembered display name exists.
  // identify uses the cookie when present; email alone never claims another reviewer.
  useEffect(() => {
    const remembered = readRemembered(token);
    if (!remembered || identified) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "identify",
            name: remembered.name,
            email: remembered.email,
          }),
        });
        const payload = (await response.json()) as {
          reviewer?: { id: string; name: string; email: string };
        };
        if (cancelled || !response.ok || !payload.reviewer) return;
        setName(payload.reviewer.name || remembered.name);
        setEmail(payload.reviewer.email || remembered.email);
        setReviewerId(payload.reviewer.id);
        setIdentified(true);
        setRememberMe(true);
        setHasRemembered(true);
      } catch {
        /* ignore — user can identify manually */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, identified]);

  useEffect(() => {
    if (!data || viewed.current) return;
    viewed.current = true;
    fetch(`/api/public/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "view" }),
    }).catch(() => undefined);
  }, [data, token]);

  useEffect(() => {
    if (!draftPin && !editingCommentId) return;
    commentRef.current?.focus();
  }, [draftPin, editingCommentId]);

  const selected = useMemo(
    () => data?.assets.find((a) => a.revisionAssetId === selectedId) || data?.assets[0],
    [data, selectedId],
  );

  const pins = useMemo(
    () =>
      (data?.comments || []).filter(
        (c) => c.revisionAssetId === selected?.revisionAssetId && c.status !== "WONT_FIX",
      ),
    [data, selected],
  );

  const handoff = data?.handoff ?? [];
  const isApproved = data?.project.status === "APPROVED";
  const isChangesRequested = data?.project.status === "CHANGES_REQUESTED";
  const isArchived = data?.project.status === "ARCHIVED";
  const handoffReleased = Boolean(data?.project.handoffReleasedAt);
  const canDecide = !isApproved && !isChangesRequested && !isArchived;
  const canComment = !isApproved && !isArchived;
  const editingComment = pins.find((pin) => pin.id === editingCommentId) ?? null;
  const isComposing = canComment && (Boolean(draftPin) || Boolean(editingComment));

  useEffect(() => {
    if (canComment) return;
    setDraftPin(null);
    setEditingCommentId(null);
    setCommentBody("");
  }, [canComment]);

  function clearCommentDraft() {
    setDraftPin(null);
    setEditingCommentId(null);
    setCommentBody("");
  }

  function beginEditComment(pin: ShareComment) {
    if (!canComment || !reviewerId || pin.reviewerId !== reviewerId || pin.status !== "OPEN") return;
    setDraftPin(null);
    setConfirmApprove(false);
    setEditingCommentId(pin.id);
    setCommentBody(pin.body);
    setError(null);
  }

  async function identify() {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identify", name: name.trim(), email: email.trim() }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reviewer?: { id: string; name: string; email: string };
      };
      if (!response.ok) throw new Error(payload.error || "Unable to continue.");

      if (rememberMe) {
        writeRemembered(token, { name: name.trim(), email: email.trim() });
        setHasRemembered(true);
      } else {
        clearRemembered(token);
        setHasRemembered(false);
      }

      setReviewerId(payload.reviewer?.id ?? null);
      setIdentified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to continue.");
    } finally {
      setBusy(false);
    }
  }

  function forgetMe() {
    clearRemembered(token);
    setHasRemembered(false);
    setRememberMe(false);
    setReviewerId(null);
    setIdentified(false);
    setName("");
    setEmail("");
    fetch(`/api/public/${encodeURIComponent(token)}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "forget" }),
    }).catch(() => undefined);
  }

  async function submitComment() {
    if (!canComment || !draftPin || !selected || !commentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          revisionAssetId: selected.revisionAssetId,
          xPercent: draftPin.x,
          yPercent: draftPin.y,
          body: commentBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Comment failed.");
      clearCommentDraft();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEditedComment() {
    if (!canComment || !editingCommentId || !commentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_comment",
          commentId: editingCommentId,
          body: commentBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (response.status === 401 || response.status === 403) {
        setIdentified(false);
        setReviewerId(null);
        throw new Error(payload.error || "Please identify again to edit your comment.");
      }
      if (!response.ok) throw new Error(payload.error || "Update failed.");
      clearCommentDraft();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(decision: "approve" | "request_changes", confirmed = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          decision,
          confirmed,
          acceptanceStatement: data?.approvalStatement,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        requiresConfirmation?: boolean;
        projectStatus?: string;
      };
      if (response.status === 400 && payload.requiresConfirmation) {
        setConfirmApprove(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Decision failed.");
      setConfirmApprove(false);
      setDoneMessage(
        decision === "approve"
          ? "Approval recorded. Thank you — the agency will share handoff files when ready."
          : "Changes requested. The agency has been notified.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decision failed.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4f1] px-5 text-center">
        <p className="max-w-md text-sm text-black/55">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f4f1]">
        <LoaderCircle className="size-5 animate-spin text-black/35" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f4f1] text-[#1c1917]">
      <header className="border-b border-black/8 bg-[#fffdf9]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
              Client review · Revision {data.revision.number}
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em]">{data.project.name}</h1>
            <p className="text-sm text-black/45">{data.project.clientName}</p>
          </div>
          <p className="text-[10px] text-black/30">Delivered with Pass-Off</p>
        </div>
      </header>

      {!identified ? (
        <div className="mx-auto max-w-md px-5 py-16">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Before you review</h2>
          <p className="mt-2 text-sm text-black/50">
            Enter your name and email so the agency knows who left feedback or approval.
          </p>
          {hasRemembered ? (
            <p className="mt-3 rounded-xl bg-[#f0ebe3] px-3 py-2 text-xs text-black/55">
              We filled these in from this device. Confirm they&apos;re still you, or{" "}
              <button type="button" onClick={forgetMe} className="font-semibold underline">
                Forget Me
              </button>
              .
            </p>
          ) : null}
          <div className="mt-6 space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30"
            />
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-black/8 bg-white px-3 py-2.5 text-sm text-black/65">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="mt-0.5 size-4 rounded border-black/20"
              />
              <span>
                <span className="font-medium text-black/80">Remember me on this device</span>
                <span className="mt-0.5 block text-xs text-black/45">
                  Saves name and email in this browser only. Uncheck on shared computers.
                </span>
              </span>
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="button"
              disabled={busy || !name.trim() || !email.trim()}
              onClick={identify}
              className="w-full rounded-xl bg-[#1c1917] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Continuing…" : "Continue to Review"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-5 py-8">
          <p className="mb-6 max-w-2xl text-sm leading-6 text-black/55">
            {isApproved
              ? `Revision ${data.revision.number} is approved. Feedback is locked; delivery appears here when ready.`
              : isArchived
                ? `Revision ${data.revision.number} is archived and view-only.`
                : `Review revision ${data.revision.number}. Click the image to leave feedback, then approve or request changes.`}
          </p>

          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_260px]">
            <aside className="space-y-1">
              {data.assets.map((asset) => (
                <button
                  key={asset.revisionAssetId}
                  type="button"
                  onClick={() => {
                    setSelectedId(asset.revisionAssetId);
                    clearCommentDraft();
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-xs ${
                    selected?.revisionAssetId === asset.revisionAssetId
                      ? "bg-[#1c1917] text-white"
                      : "bg-white text-black/65"
                  }`}
                >
                  {asset.label}
                </button>
              ))}
            </aside>

            <section>
              {selected?.kind === "url" ? (
                <div className="rounded-2xl border border-black/8 bg-white p-8 text-center text-sm">
                  <a
                    href={selected.externalUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open Review URL
                  </a>
                </div>
              ) : selected?.mime === "application/pdf" ? (
                <iframe
                  title={selected.label}
                  src={selected.url || ""}
                  className="h-[70vh] w-full rounded-2xl bg-white"
                />
              ) : (
                <div className="relative overflow-hidden rounded-2xl border border-black/8 bg-[#111]">
                  {canComment ? (
                    <button
                      type="button"
                      aria-label="Add Feedback Pin"
                      className="block w-full text-left"
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        const x = (event.clientX - rect.left) / rect.width;
                        const y = (event.clientY - rect.top) / rect.height;
                        setEditingCommentId(null);
                        setDraftPin({ x, y });
                        setCommentBody("");
                        setConfirmApprove(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setEditingCommentId(null);
                        setDraftPin({ x: 0.5, y: 0.5 });
                        setCommentBody("");
                        setConfirmApprove(false);
                      }}
                    >
                      <img
                        src={selected?.url || ""}
                        alt={selected?.label || "Review asset"}
                        className="w-full"
                      />
                    </button>
                  ) : (
                    <img
                      src={selected?.url || ""}
                      alt={selected?.label || "Review asset"}
                      className="block w-full"
                    />
                  )}
                  {pins.map((pin, index) => {
                    const canEdit =
                      canComment &&
                      Boolean(reviewerId) &&
                      pin.reviewerId === reviewerId &&
                      pin.status === "OPEN";
                    const isSelected = pin.id === editingCommentId;
                    const pinClass = `absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold ${
                      isSelected
                        ? "bg-white text-black ring-2 ring-[#c2410c]"
                        : "bg-[#c2410c] text-white"
                    }`;
                    const pinStyle = {
                      left: `${Number(pin.xPercent) * 100}%`,
                      top: `${Number(pin.yPercent) * 100}%`,
                    } as const;
                    if (!canEdit) {
                      return (
                        <span
                          key={pin.id}
                          className={`${pinClass} pointer-events-none`}
                          style={pinStyle}
                          title={pin.body}
                        >
                          {index + 1}
                        </span>
                      );
                    }
                    return (
                      <button
                        key={pin.id}
                        type="button"
                        aria-label={`Edit comment ${index + 1}`}
                        className={pinClass}
                        style={pinStyle}
                        title={pin.body}
                        onClick={() => beginEditComment(pin)}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                  {draftPin ? (
                    <span
                      className="pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black"
                      style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }}
                    >
                      +
                    </span>
                  ) : null}
                  {!draftPin && !editingCommentId && pins.length === 0 && canComment ? (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-5 text-center text-xs font-medium text-white/90">
                      Click anywhere on the design to leave feedback
                    </span>
                  ) : null}
                </div>
              )}
              <p className="mt-3 text-xs text-black/40">
                {canComment
                  ? "Click the image to drop a pin. Keyboard: focus the image and press Enter to pin at center."
                  : isApproved
                    ? "Feedback is locked on this approved revision."
                    : "This room is archived and view-only."}
              </p>
            </section>

            <aside className="space-y-4">
              {doneMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  <Check className="mb-2 size-4" />
                  {doneMessage}
                </div>
              ) : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="rounded-2xl border border-black/8 bg-white p-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                  <MessageSquare className="size-3.5" /> Feedback
                </div>
                {canComment && draftPin ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-black/50">Pin placed — describe what should change.</p>
                    <textarea
                      ref={commentRef}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      rows={3}
                      placeholder="What should change?"
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !commentBody.trim()}
                        onClick={submitComment}
                        className="flex-1 rounded-xl bg-[#1c1917] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? "Submitting…" : "Submit Comment"}
                      </button>
                      <button
                        type="button"
                        onClick={clearCommentDraft}
                        className="rounded-xl px-3 py-2 text-[11px] font-semibold text-black/45"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : canComment && editingComment ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-black/50">Editing your comment — update the text below.</p>
                    <textarea
                      ref={commentRef}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      rows={3}
                      placeholder="What should change?"
                      className="w-full rounded-xl border border-black/10 px-3 py-2 text-sm outline-none focus:border-black/30"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy || !commentBody.trim() || commentBody.trim() === editingComment.body}
                        onClick={saveEditedComment}
                        className="flex-1 rounded-xl bg-[#1c1917] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-60"
                      >
                        {busy ? "Saving…" : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={clearCommentDraft}
                        className="rounded-xl px-3 py-2 text-[11px] font-semibold text-black/45"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-black/45">
                    {canComment
                      ? "Click the design to place a pin, or select one of your comments to edit it."
                      : isApproved
                        ? "Feedback on this revision is locked."
                        : "This room is archived and view-only."}
                  </p>
                )}
                <ul className="mt-4 max-h-48 space-y-2 overflow-auto">
                  {pins.length === 0 ? (
                    <li className="text-xs text-black/35">No comments on this asset yet.</li>
                  ) : (
                    pins.map((pin, index) => {
                      const canEdit =
                        canComment &&
                        Boolean(reviewerId) &&
                        pin.reviewerId === reviewerId &&
                        pin.status === "OPEN";
                      const isSelected = pin.id === editingCommentId;
                      return (
                        <li key={pin.id}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => beginEditComment(pin)}
                            className={`flex w-full gap-2.5 rounded-xl px-3 py-2 text-left text-xs text-black/70 transition ${
                              isSelected
                                ? "bg-[#1c1917] text-white"
                                : canEdit
                                  ? "bg-[#f5f2ec] hover:bg-[#ebe6dc]"
                                  : "cursor-default bg-[#f5f2ec]"
                            }`}
                          >
                            <span
                              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                isSelected
                                  ? "bg-white text-[#c2410c]"
                                  : "bg-[#c2410c] text-white"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <span className="min-w-0 pt-0.5">
                              {pin.body}
                              {canEdit && !isSelected ? (
                                <span className="mt-1 block text-[10px] font-medium text-black/35">
                                  Tap to edit
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {!isComposing ? (
                <>
                  {isApproved ? (
                    <div className="space-y-3">
                      {data.approvalReceipt ? (
                        <ApprovalReceipt receipt={data.approvalReceipt} />
                      ) : (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                          <p className="font-semibold">This revision is approved.</p>
                          <p className="mt-1 text-xs leading-5 text-emerald-800/80">
                            Feedback is locked on this frozen revision.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : isChangesRequested ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                      <p className="font-semibold">Changes requested</p>
                      <p className="mt-1 text-xs leading-5 text-amber-900/75">
                        The agency has been notified. You can still leave more comments. They&apos;ll publish
                        a new revision when ready.
                      </p>
                    </div>
                  ) : isArchived ? (
                    <div className="rounded-2xl border border-black/8 bg-white p-4 text-sm text-black/55">
                      This review is closed.
                    </div>
                  ) : canDecide ? (
                    <div className="rounded-2xl border border-black/8 bg-white p-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                        Decision
                      </p>
                      {!confirmApprove ? (
                        <div className="mt-3 space-y-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide("request_changes")}
                            className="w-full rounded-xl border border-black/10 px-3 py-2 text-[11px] font-semibold"
                          >
                            Request Changes
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide("approve", false)}
                            className="w-full rounded-xl bg-[#1c1917] px-3 py-2 text-[11px] font-semibold text-white"
                          >
                            Approve This Revision
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-3">
                          <p className="text-xs leading-5 text-black/60">{data.approvalStatement}</p>
                          <p className="text-[10px] font-mono text-black/35">
                            Digest {data.revision.contentDigest?.slice(0, 20)}…
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide("approve", true)}
                            className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-white"
                          >
                            Confirm Approval
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmApprove(false)}
                            className="w-full text-[11px] font-semibold text-black/45"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}

              {isApproved ? (
                <div className="rounded-2xl border border-black/8 bg-white p-4">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/35">
                    <Package className="size-3.5" /> Final deliverables
                  </div>
                  {handoffReleased && handoff.length > 0 ? (
                    <>
                      <p className="mt-2 text-xs leading-5 text-black/50">
                        Your approval is recorded. Final files are available from this same link.
                      </p>
                      <ul className="mt-3 space-y-2">
                        {handoff.map((item) => (
                          <li key={item.id} className="rounded-xl bg-[#f5f2ec] px-3 py-2.5 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-black/80">{item.label}</p>
                              <span className="shrink-0 rounded-md bg-black/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                {item.category}
                              </span>
                            </div>
                            {item.notes ? <p className="mt-1 text-black/50">{item.notes}</p> : null}
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                              {item.externalUrl ? (
                                <a
                                  href={item.externalUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 font-semibold text-[#6354d4] underline"
                                >
                                  <ExternalLink className="size-3" />
                                  Open Link
                                </a>
                              ) : null}
                              {item.downloadUrl ? (
                                <a
                                  href={item.downloadUrl}
                                  className="inline-block font-semibold text-[#6354d4] underline"
                                >
                                  Download File
                                </a>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-[#faf8ff] px-3 py-3">
                      <p className="text-xs font-semibold text-black/70">Approval recorded</p>
                      <p className="mt-1 text-xs leading-5 text-black/45">
                        Final files are being prepared. Keep this link—deliverables will appear here
                        when they are released.
                      </p>
                    </div>
                  )}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      )}
    </main>
  );
}
