"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowRight, FolderKanban, LoaderCircle, Plus, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type DashboardProject = {
  id: string;
  name: string;
  slug: string;
};

type ProjectsDashboardProps = {
  projects: DashboardProject[];
};

export function ProjectsDashboard({ projects: initialProjects }: ProjectsDashboardProps) {
  const router = useRouter();
  const createTitleId = useId();
  const [projects, setProjects] = useState(initialProjects);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardProject | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

  useEffect(() => {
    if (!createOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setCreateOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, busy]);

  async function createProject(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !createName.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim() }),
      });
      const payload = (await response.json()) as { id?: string; name?: string; slug?: string; error?: string };
      if (!response.ok || !payload.id || !payload.name || !payload.slug) {
        throw new Error(payload.error || "Unable to create the project.");
      }
      setProjects((current) =>
        [...current, { id: payload.id!, name: payload.name!, slug: payload.slug! }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setCreateOpen(false);
      setCreateName("");
      router.refresh();
      router.push(`/projects/${encodeURIComponent(payload.id)}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create the project.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Unable to delete the project.");
      }
      setProjects((current) => current.filter((project) => project.id !== deleteTarget.id));
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/40">
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setCreateError(null);
            setCreateName("");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] transition hover:bg-[#5b4cc4]"
        >
          <Plus className="size-3.5" />
          Create Project
        </button>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setCreateOpen(true);
              setCreateError(null);
              setCreateName("");
            }}
            className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-[#a594f5]/50 bg-white/60 p-6 text-center transition hover:border-[#6354d4]/50 hover:bg-white"
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e4dffc] text-[#6354d4]">
              <Plus className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[-0.02em]">Create Your First Project</p>
              <p className="mt-1 text-xs text-black/40">Projects hold Figma files and handoffs.</p>
            </div>
          </button>
        ) : (
          projects.map((project) => {
            const href = `/projects/${encodeURIComponent(project.id)}`;
            return (
              <div
                key={project.id}
                className="group relative overflow-hidden rounded-[22px] border border-black/8 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <Link href={href} className="absolute inset-0 z-0" aria-label={`Open ${project.name}`} />
                <div className="relative z-10 flex items-start justify-between gap-3 pointer-events-none">
                  <div className="flex size-12 items-center justify-center rounded-2xl bg-[#e4dffc] text-[#6354d4]">
                    <FolderKanban className="size-5" />
                  </div>
                  <div className="flex items-center gap-1 pointer-events-auto">
                    <button
                      type="button"
                      aria-label={`Delete ${project.name}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDeleteError(null);
                        setDeleteTarget(project);
                      }}
                      className="flex size-8 items-center justify-center rounded-xl border border-[#e6a44c]/40 text-[#a14428] opacity-0 transition group-hover:opacity-100 hover:bg-[#fff1eb] focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <ArrowRight className="size-4 text-[#6354d4] transition group-hover:translate-x-0.5" />
                  </div>
                </div>
                <h2 className="relative z-10 mt-6 text-lg font-semibold tracking-[-0.03em] transition group-hover:text-[#6354d4]">
                  {project.name}
                </h2>
                <p className="relative z-10 mt-2 truncate text-xs text-black/40">/{project.slug}</p>
              </div>
            );
          })
        )}
      </section>

      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={createTitleId}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c1412]/7 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!busy) setCreateOpen(false);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-[#16131f] text-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#e4dffc] text-[#6354d4]">
                  <FolderKanban className="size-4" />
                </div>
                <div>
                  <h2 id={createTitleId} className="text-lg font-semibold">
                    Create Project
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Add a project to this workspace for Figma files and handoffs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
                aria-label="Close"
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 text-white/55 disabled:opacity-40"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={createProject} className="space-y-4 px-5 py-5">
              <label htmlFor="dashboard-project-name" className="block text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Project name
              </label>
              <input
                id="dashboard-project-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                disabled={busy}
                required
                autoFocus
                maxLength={120}
                placeholder="Marketing site"
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm outline-none ring-[#7c6cf0]/40 placeholder:text-white/25 focus:ring-2 disabled:opacity-50"
              />
              {createError && (
                <p role="alert" className="text-xs text-[#a594f5]">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-semibold text-white/55 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !createName.trim()}
                  className="flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] disabled:opacity-40"
                >
                  {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-[#fff1eb] text-[#a14428]">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This permanently deletes “${deleteTarget.name}” and all of its Figma files, designs, and previews. This cannot be undone.`
                : "This permanently deletes the project and all of its files."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="px-1 text-xs text-[#a14428]">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                void deleteProject();
              }}
            >
              {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
