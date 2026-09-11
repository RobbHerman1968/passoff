"use client";

import { ArrowLeft, ArrowRight, Images, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";

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
import { formatStorageBytes } from "@/lib/rooms/entitlements-format";
import { projectDesignsPath, projectRoomPath } from "@/lib/rooms/routes";

type ProjectRoom = { id: string; name: string; status: string };
type ProjectStats = {
  designFileCount: number;
  designVersionCount: number;
  screenCount: number;
  roomCount: number;
  publishedRevisionCount: number;
  approvedRoomCount: number;
  designStorageBytes: number;
  attachmentStorageBytes: number;
  storageBytes: number;
};

export function ProjectWorkspace({
  project,
  stats,
  initialRooms,
  canCreateRooms,
  maxActiveRooms,
  activeRoomCount,
  maxStorageBytes,
}: {
  project: { id: string; name: string; clientName: string };
  stats: ProjectStats;
  initialRooms: ProjectRoom[];
  canCreateRooms: boolean;
  maxActiveRooms: number;
  activeRoomCount: number;
  maxStorageBytes: number;
}) {
  const router = useRouter();
  const titleId = useId();
  const editTitleId = useId();
  const [rooms, setRooms] = useState(initialRooms);
  const [projectDetails, setProjectDetails] = useState({
    name: project.name,
    clientName: project.clientName,
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRoom | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [editClientName, setEditClientName] = useState(project.clientName);
  const [editError, setEditError] = useState<string | null>(null);
  const [currentActiveRoomCount, setCurrentActiveRoomCount] = useState(activeRoomCount);
  const roomLimitReached = currentActiveRoomCount >= maxActiveRooms;
  const storagePercent = maxStorageBytes > 0
    ? Math.min(100, (stats.storageBytes / maxStorageBytes) * 100)
    : 0;

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/client-projects/${encodeURIComponent(project.id)}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await response.json()) as ProjectRoom & { error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "Unable to create the room.");
      setRooms((current) => [...current, payload]);
      setOpen(false);
      router.push(projectRoomPath(project.id, payload.id));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the room.");
    } finally {
      setBusy(false);
    }
  }

  function startCreate() {
    setName(rooms.length ? `Review round ${rooms.length + 1}` : "Client review");
    setError(
      !canCreateRooms
        ? "Your plan cannot create approval rooms right now."
        : roomLimitReached
          ? `Your plan allows ${maxActiveRooms} active approval rooms.`
          : null,
    );
    setOpen(true);
  }

  function startEdit() {
    setEditName(projectDetails.name);
    setEditClientName(projectDetails.clientName);
    setEditError(null);
    setEditOpen(true);
  }

  async function updateProject(event: FormEvent) {
    event.preventDefault();
    if (busy || !editName.trim() || !editClientName.trim()) return;
    setBusy(true);
    setEditError(null);
    try {
      const response = await fetch(`/api/client-projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          clientName: editClientName.trim(),
        }),
      });
      const payload = (await response.json()) as {
        name?: string;
        clientName?: string;
        error?: string;
      };
      if (!response.ok || !payload.name || !payload.clientName) {
        throw new Error(payload.error || "Unable to update the project.");
      }
      setProjectDetails({ name: payload.name, clientName: payload.clientName });
      setEditOpen(false);
      router.refresh();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Unable to update the project.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(
        `/api/client-projects/${encodeURIComponent(project.id)}/rooms/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Unable to delete the room.");
      }
      setRooms((current) => current.filter((room) => room.id !== deleteTarget.id));
      if (deleteTarget.status !== "ARCHIVED") {
        setCurrentActiveRoomCount((current) => Math.max(0, current - 1));
      }
      setDeleteTarget(null);
      router.refresh();
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Unable to delete the room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="w-full">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Breadcrumb" className="inline-flex max-w-full self-start rounded-xl border border-[#a594f5]/25 bg-white/75 p-1 shadow-[0_1px_2px_rgba(45,35,105,0.05)] backdrop-blur-sm">
            <ol className="flex min-w-0 items-center text-sm">
              <li>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#eeeaff] px-2.5 py-1.5 font-semibold text-[#6354d4] transition hover:bg-[#e2dcff] hover:text-[#5143b8] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#6354d4]"
                >
                  <ArrowLeft className="size-4" />
                  Projects
                </Link>
              </li>
              <li aria-hidden="true" className="px-1 text-black/20">|</li>
              <li aria-current="page" className="max-w-48 truncate rounded-lg border border-[#a594f5]/30 bg-[#faf8ff] px-2.5 py-1.5 font-medium text-[var(--brand-deep)] sm:max-w-80">
                {projectDetails.name}
              </li>
            </ol>
          </nav>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <button type="button" onClick={startEdit} className="inline-flex items-center gap-2 rounded-xl border border-[#a594f5]/35 bg-white px-4 py-2.5 text-sm font-semibold text-[#6354d4] transition hover:bg-[#faf8ff]"><Pencil className="size-4" /> Edit details</button>
            <Link href={projectDesignsPath(project.id)} className="inline-flex items-center gap-2 rounded-xl border border-[#a594f5]/35 bg-white px-4 py-2.5 text-sm font-semibold text-[#6354d4]"><Images className="size-4" /> Design files</Link>
            <button type="button" onClick={startCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white"><Plus className="size-4" /> New Approval Room</button>
          </div>
        </div>
        <div className="mt-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">{projectDetails.clientName}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.04em]">{projectDetails.name}</h1>
          <p className="mt-2 max-w-xl text-sm text-black/45">Organize design files here, then create focused rooms for each client review.</p>
        </div>

        <section aria-label="Project statistics" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "Design files", value: stats.designFileCount },
            { label: "Screens", value: stats.screenCount },
            { label: "Versions", value: stats.designVersionCount },
            { label: "Approval rooms", value: rooms.length },
            {
              label: "Published",
              value: stats.publishedRevisionCount,
              detail: `${stats.approvedRoomCount} approved`,
            },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-[#a594f5]/25 bg-white/80 px-4 py-3 shadow-[0_1px_2px_rgba(45,35,105,0.04)]">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">{stat.label}</p>
              <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">{stat.value}</p>
              {stat.detail ? <p className="mt-0.5 text-[9px] text-black/35">{stat.detail}</p> : null}
            </div>
          ))}
          <div className="rounded-2xl border border-[#a594f5]/25 bg-white/80 px-4 py-3 shadow-[0_1px_2px_rgba(45,35,105,0.04)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">Project storage</p>
            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">{formatStorageBytes(stats.storageBytes)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e9e5f5]">
              <div className="h-full rounded-full bg-[#6354d4]" style={{ width: `${storagePercent}%` }} />
            </div>
            <p className="mt-1 text-[9px] text-black/35">{storagePercent.toFixed(storagePercent < 1 ? 1 : 0)}% of workspace limit</p>
            <p className="mt-0.5 text-[9px] text-black/35">
              {formatStorageBytes(stats.designStorageBytes)} designs · {formatStorageBytes(stats.attachmentStorageBytes)} uploads
            </p>
          </div>
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Approval rooms</h2>
            <span className="text-xs text-black/40">{rooms.length} total</span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <div key={room.id} className="group relative overflow-hidden rounded-2xl border border-[#a594f5]/30 bg-white transition hover:-translate-y-0.5 hover:border-[#8a78ec]/55">
                <Link href={projectRoomPath(project.id, room.id)} className="block p-5 pr-14">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">{room.status}</div>
                  <h3 className="mt-2 truncate text-lg font-semibold">{room.name}</h3>
                  <span className="mt-5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6354d4]">Open Room <ArrowRight className="size-3.5" /></span>
                </Link>
                <button
                  type="button"
                  aria-label={`Delete ${room.name}`}
                  title="Delete room"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteTarget(room);
                  }}
                  className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg border border-transparent text-black/30 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-500"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
          {!rooms.length ? (
            <button type="button" onClick={startCreate} className="mt-3 w-full rounded-2xl border border-dashed border-[#a594f5]/40 bg-white/60 px-6 py-14 text-center text-sm text-black/45 hover:border-[#8a78ec]/60">
              Create the first approval room for this project.
            </button>
          ) : null}
        </section>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={createRoom} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" aria-labelledby={titleId}>
            <div className="flex items-start justify-between gap-3">
              <div><h2 id={titleId} className="text-lg font-semibold">New Approval Room</h2><p className="mt-1 text-sm text-black/45">Inside {projectDetails.name}</p></div>
              <button type="button" aria-label="Close" onClick={() => !busy && setOpen(false)} className="rounded-lg p-1.5 text-black/35"><X className="size-4" /></button>
            </div>
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Room name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required autoFocus disabled={busy || !canCreateRooms || roomLimitReached} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]" />
            </label>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            <button type="submit" disabled={busy || !canCreateRooms || roomLimitReached || !name.trim()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null} Create Room
            </button>
          </form>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={updateProject} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" aria-labelledby={editTitleId}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={editTitleId} className="text-lg font-semibold">Edit project details</h2>
                <p className="mt-1 text-sm text-black/45">Update the company and project names.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => !busy && setEditOpen(false)} className="rounded-lg p-1.5 text-black/35"><X className="size-4" /></button>
            </div>
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Company name
              <input value={editClientName} onChange={(event) => setEditClientName(event.target.value)} maxLength={120} required autoFocus disabled={busy} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]" />
            </label>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Project name
              <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={120} required disabled={busy} className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]" />
            </label>
            {editError ? <p className="mt-3 text-sm text-red-600">{editError}</p> : null}
            <button type="submit" disabled={busy || !editName.trim() || !editClientName.trim()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Save changes
            </button>
          </form>
        </div>
      ) : null}

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(nextOpen) => !nextOpen && !busy && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-5 text-red-600" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete room?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{deleteTarget?.name}”. The project and its design files will stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRoom} disabled={busy} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Delete room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
