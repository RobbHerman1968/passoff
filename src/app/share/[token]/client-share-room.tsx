"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, LoaderCircle, MessageSquare, Package } from "lucide-react";

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
};

type SharePayload = {
  project: { name: string; clientName: string; status: string; handoffReleasedAt: string | null };
  revision: { id: string; number: number; contentDigest: string | null };
  assets: ShareAsset[];
  comments: ShareComment[];
  handoff?: ShareHandoff[];
  approvalStatement: string;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<{ x: number; y: number } | null>(null);
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
    const response = await fetch(`/api/public/${encodeURIComponent(token)}`, { cache: "no-store" });
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
    if (!draftPin) return;
    commentRef.current?.focus();
  }, [draftPin]);

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "identify", name: name.trim(), email: email.trim() }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to continue.");

      if (rememberMe) {
        writeRemembered(token, { name: name.trim(), email: email.trim() });
        setHasRemembered(true);
      } else {
        clearRemembered(token);
        setHasRemembered(false);
      }

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
    setName("");
    setEmail("");
  }

  async function submitComment() {
    if (!draftPin || !selected || !commentBody.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          name,
          email,
          revisionAssetId: selected.revisionAssetId,
          xPercent: draftPin.x,
          yPercent: draftPin.y,
          body: commentBody,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Comment failed.");
      setDraftPin(null);
      setCommentBody("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comment failed.");
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "decision",
          name,
          email,
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
                forget me
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
              {busy ? "Continuing…" : "Continue to review"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-5 py-8">
          <p className="mb-6 max-w-2xl text-sm leading-6 text-black/55">
            Review revision {data.revision.number}. Click the image to leave feedback, then approve or
            request changes.
          </p>

          <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_260px]">
            <aside className="space-y-1">
              {data.assets.map((asset) => (
                <button
                  key={asset.revisionAssetId}
                  type="button"
                  onClick={() => {
                    setSelectedId(asset.revisionAssetId);
                    setDraftPin(null);
                    setCommentBody("");
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
                    Open review URL
                  </a>
                </div>
              ) : selected?.mime === "application/pdf" ? (
                <iframe
                  title={selected.label}
                  src={selected.url || ""}
                  className="h-[70vh] w-full rounded-2xl bg-white"
                />
              ) : (
                <button
                  type="button"
                  aria-label="Add feedback pin"
                  className="relative block w-full overflow-hidden rounded-2xl border border-black/8 bg-[#111] text-left"
                  onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const x = (event.clientX - rect.left) / rect.width;
                    const y = (event.clientY - rect.top) / rect.height;
                    setDraftPin({ x, y });
                    setConfirmApprove(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setDraftPin({ x: 0.5, y: 0.5 });
                    setConfirmApprove(false);
                  }}
                >
                  { }
                  <img
                    src={selected?.url || ""}
                    alt={selected?.label || "Review asset"}
                    className="w-full"
                  />
                  {pins.map((pin, index) => (
                    <span
                      key={pin.id}
                      className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#c2410c] text-[10px] font-bold text-white"
                      style={{
                        left: `${Number(pin.xPercent) * 100}%`,
                        top: `${Number(pin.yPercent) * 100}%`,
                      }}
                      title={pin.body}
                    >
                      {index + 1}
                    </span>
                  ))}
                  {draftPin ? (
                    <span
                      className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black"
                      style={{ left: `${draftPin.x * 100}%`, top: `${draftPin.y * 100}%` }}
                    >
                      +
                    </span>
                  ) : null}
                  {!draftPin && pins.length === 0 ? (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-5 text-center text-xs font-medium text-white/90">
                      Click anywhere on the design to leave feedback
                    </span>
                  ) : null}
                </button>
              )}
              <p className="mt-3 text-xs text-black/40">
                Click the image to drop a pin. Keyboard: focus the image and press Enter to pin at center.
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
                {draftPin ? (
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
                        {busy ? "Submitting…" : "Submit comment"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDraftPin(null);
                          setCommentBody("");
                        }}
                        className="rounded-xl px-3 py-2 text-[11px] font-semibold text-black/45"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-black/45">Click anywhere on the design to place a pin.</p>
                )}
                <ul className="mt-4 max-h-48 space-y-2 overflow-auto">
                  {pins.length === 0 ? (
                    <li className="text-xs text-black/35">No comments on this asset yet.</li>
                  ) : (
                    pins.map((pin) => (
                      <li key={pin.id} className="rounded-xl bg-[#f5f2ec] px-3 py-2 text-xs text-black/70">
                        {pin.body}
                      </li>
                    ))
                  )}
                </ul>
              </div>

              {!draftPin ? (
                <>
                  {isApproved ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      <p className="font-semibold">This revision is approved.</p>
                      <p className="mt-1 text-xs leading-5 text-emerald-800/80">
                        Thanks — no further action needed on the review.
                      </p>
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
                            Request changes
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => decide("approve", false)}
                            className="w-full rounded-xl bg-[#1c1917] px-3 py-2 text-[11px] font-semibold text-white"
                          >
                            Approve this revision
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
                            Confirm approval
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
                    <Package className="size-3.5" /> Delivery
                  </div>
                  {handoffReleased && handoff.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {handoff.map((item) => (
                        <li key={item.id} className="rounded-xl bg-[#f5f2ec] px-3 py-2 text-xs">
                          <p className="font-semibold text-black/80">{item.label}</p>
                          {item.notes ? <p className="mt-1 text-black/50">{item.notes}</p> : null}
                          {item.externalUrl ? (
                            <a
                              href={item.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block font-semibold text-black/70 underline"
                            >
                              Open link
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs leading-5 text-black/45">
                      Your agency is preparing final files. Check back on this link when they&apos;re ready.
                    </p>
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
