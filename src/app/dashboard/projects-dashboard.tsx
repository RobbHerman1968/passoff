"use client";

import { ArrowRight, LoaderCircle, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

export type DashboardProject = {
  id: string;
  name: string;
  clientName: string;
  status: string;
  roomCount: number;
};

export function ProjectsDashboard({
  initialProjects,
  canCreate,
  isExpired,
}: {
  initialProjects: DashboardProject[];
  canCreate: boolean;
  isExpired: boolean;
}) {
  const router = useRouter();
  const titleId = useId();
  const [projects, setProjects] = useState(initialProjects);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    if (!canCreate) {
      setError(isExpired ? "Your trial has ended. Upgrade to create a project." : "Your plan cannot create projects right now.");
      setOpen(true);
      return;
    }
    setName("");
    setClientName("");
    setError(null);
    setOpen(true);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim() || !clientName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/client-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), clientName: clientName.trim() }),
      });
      const payload = (await response.json()) as DashboardProject & { error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "Unable to create the project.");
      const next = { ...payload, roomCount: 0 };
      setProjects((current) => [next, ...current]);
      setOpen(false);
      router.push(`/projects/${encodeURIComponent(payload.id)}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Projects</h1>
          <p className="mt-1.5 text-sm leading-5 text-black/45">
            Keep design files and explanations together, then create focused approval rooms for each review round.
          </p>
        </div>
        <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#5b4cc4]">
          <Plus className="size-4" /> New Project
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <Link key={project.id} href={`/projects/${encodeURIComponent(project.id)}`} className="group rounded-2xl border border-[#a594f5]/30 bg-white p-5 shadow-[0_1px_0_rgba(99,84,212,0.06)] transition hover:-translate-y-0.5 hover:border-[#8a78ec]/55">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">{project.status}</div>
            <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em]">{project.name}</h2>
            <p className="mt-1 text-sm text-black/45">{project.clientName}</p>
            <div className="mt-5 flex items-center justify-between text-[11px] font-semibold text-[#6354d4]">
              <span>{project.roomCount} room{project.roomCount === 1 ? "" : "s"}</span>
              <span className="inline-flex items-center gap-1">Open Project <ArrowRight className="size-3.5" /></span>
            </div>
          </Link>
        ))}
      </div>

      {!projects.length ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[#a594f5]/40 bg-white/60 px-6 py-16 text-center text-sm text-black/45">
          Create a project first. Inside it, you can add design files and one or more approval rooms.
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={createProject} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" aria-labelledby={titleId}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-lg font-semibold tracking-[-0.03em]">New Project</h2>
                <p className="mt-1 text-sm text-black/45">Create the client engagement. You’ll add approval rooms next.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => !busy && setOpen(false)} className="rounded-lg p-1.5 text-black/35 hover:bg-black/[0.04]"><X className="size-4" /></button>
            </div>
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Client name
              <input value={clientName} onChange={(event) => setClientName(event.target.value)} maxLength={120} required autoFocus disabled={!canCreate || busy} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]" placeholder="Acme Co" />
            </label>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Project name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={!canCreate || busy} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]" placeholder="Marketing site redesign" />
            </label>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <button type="submit" disabled={!canCreate || busy || !name.trim() || !clientName.trim()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Create Project
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
