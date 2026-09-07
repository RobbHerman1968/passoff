"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ArrowRight, FolderKanban, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";

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
import { toast } from "@/components/ui/toast";
import { track } from "@/lib/analytics/events";

const ACTIVE_ROOM_STATUSES = new Set([
  "DRAFT",
  "SENT",
  "VIEWED",
  "CHANGES_REQUESTED",
  "APPROVED",
]);

export type DashboardRoom = {
  id: string;
  name: string;
  clientName: string;
  slug: string;
  status: string;
};

type RoomsDashboardProps = {
  workspaceName: string;
  rooms: DashboardRoom[];
  planId: string;
  maxActiveRooms: number;
  canCreateRooms: boolean;
  isExpired: boolean;
};

export function RoomsDashboard({
  workspaceName,
  rooms: initialRooms,
  planId,
  maxActiveRooms,
  canCreateRooms,
  isExpired,
}: RoomsDashboardProps) {
  const router = useRouter();
  const createTitleId = useId();
  const [rooms, setRooms] = useState(initialRooms);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createClient, setCreateClient] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DashboardRoom | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<DashboardRoom | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameClient, setRenameClient] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameTitleId = useId();

  const activeRoomCount = rooms.filter((room) => ACTIVE_ROOM_STATUSES.has(room.status)).length;

  useEffect(() => {
    setRooms(initialRooms);
  }, [initialRooms]);

  useEffect(() => {
    if (!createOpen && !renameTarget) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setCreateOpen(false);
        setRenameTarget(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, renameTarget, busy]);

  function openCreateRoom() {
    if (!canCreateRooms) {
      toast.error(
        isExpired
          ? "Your trial has ended. Upgrade to Solo to create new approval rooms. Existing rooms remain readable."
          : "Your plan cannot create new approval rooms right now.",
      );
      return;
    }
    if (activeRoomCount >= maxActiveRooms) {
      toast.error(
        `Your ${planId} plan allows ${maxActiveRooms} active approval rooms. Archive a room or upgrade.`,
      );
      return;
    }
    setCreateOpen(true);
    setCreateError(null);
    setCreateName("");
    setCreateClient("");
  }

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    if (busy || !createName.trim() || !createClient.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          clientName: createClient.trim(),
        }),
      });
      const payload = (await response.json()) as {
        id?: string;
        name?: string;
        clientName?: string;
        slug?: string;
        status?: string;
        error?: string;
      };
      if (!response.ok || !payload.id || !payload.name || !payload.slug) {
        throw new Error(payload.error || "Unable to create the room.");
      }
      setRooms((current) =>
        [
          ...current,
          {
            id: payload.id!,
            name: payload.name!,
            clientName: payload.clientName || createClient.trim(),
            slug: payload.slug!,
            status: payload.status || "DRAFT",
          },
        ].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setCreateOpen(false);
      setCreateName("");
      setCreateClient("");
      track("approval_room_created", { roomId: payload.id });
      router.refresh();
      router.push(`/rooms/${encodeURIComponent(payload.id)}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Unable to create the room.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRoom() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        throw new Error(payload.error || "Unable to delete the room.");
      }
      setRooms((current) => current.filter((room) => room.id !== deleteTarget.id));
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Unable to delete the room.");
    } finally {
      setBusy(false);
    }
  }

  function openRenameRoom(room: DashboardRoom) {
    if (room.status === "ARCHIVED") {
      toast.error("Archived rooms cannot be renamed.");
      return;
    }
    setRenameTarget(room);
    setRenameName(room.name);
    setRenameClient(room.clientName);
    setRenameError(null);
  }

  async function renameRoom(event: FormEvent) {
    event.preventDefault();
    if (!renameTarget || busy) return;
    const name = renameName.trim();
    const clientName = renameClient.trim();
    if (!name || !clientName) {
      setRenameError("Project name and client name are required.");
      return;
    }
    setBusy(true);
    setRenameError(null);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(renameTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", name, clientName }),
      });
      const payload = (await response.json()) as {
        name?: string;
        clientName?: string;
        error?: string;
      };
      if (!response.ok || !payload.name) {
        throw new Error(payload.error || "Unable to rename the room.");
      }
      setRooms((current) =>
        current
          .map((room) =>
            room.id === renameTarget.id
              ? {
                  ...room,
                  name: payload.name!,
                  clientName: payload.clientName || clientName,
                }
              : room,
          )
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setRenameTarget(null);
      toast.success("Room renamed.");
      router.refresh();
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Unable to rename the room.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">
            <FolderKanban className="size-3.5" />
            {workspaceName}
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
            Approval rooms
          </h1>
          <p className="mt-1.5 text-sm leading-5 text-black/45">
            Collect visual feedback, lock client approval on a revision, and deliver handoff files
            through one branded link.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-black/40">
            {rooms.length} room{rooms.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={openCreateRoom}
            className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-[#e4dffc] transition hover:bg-[#5b4cc4]"
          >
            <Plus className="size-4" />
            New Approval Room
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="group relative rounded-2xl border border-[#a594f5]/30 bg-white p-5 shadow-[0_1px_0_rgba(99,84,212,0.06)]"
          >
            <Link href={`/rooms/${encodeURIComponent(room.id)}`} className="block pr-16">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">
                <FolderKanban className="size-3.5" />
                {room.status}
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                {room.name}
              </h2>
              <p className="mt-1 text-sm text-black/45">{room.clientName || "No client name"}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6354d4]">
                Open Room <ArrowRight className="size-3.5" />
              </span>
            </Link>
            <div className="absolute right-3 top-3 flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                aria-label={`Rename ${room.name}`}
                onClick={() => openRenameRoom(room)}
                className="rounded-lg p-2 text-black/25 hover:bg-black/[0.04] hover:text-black/55"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Delete ${room.name}`}
                onClick={() => {
                  setDeleteTarget(room);
                  setDeleteError(null);
                }}
                className="rounded-lg p-2 text-black/25 hover:bg-black/[0.04] hover:text-black/55"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {rooms.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-[#a594f5]/40 bg-white/60 px-6 py-16 text-center">
          <p className="text-sm text-black/45">
            Create your first approval room to collect visual feedback, lock sign-off on a revision,
            and deliver handoff files.
          </p>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={createRoom}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            aria-labelledby={createTitleId}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={createTitleId} className="text-lg font-semibold tracking-[-0.03em]">
                  New Approval Room
                </h2>
                <p className="mt-1 text-sm text-black/45">Name the client and project.</p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setCreateOpen(false)}
                className="rounded-lg p-1.5 text-black/35 hover:bg-black/[0.04]"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Client name
              <input
                value={createClient}
                onChange={(e) => setCreateClient(e.target.value)}
                className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]"
                placeholder="Acme Co"
                autoFocus
                required
              />
            </label>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Project name
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]"
                placeholder="Marketing site launch"
                required
              />
            </label>
            {createError ? <p className="mt-3 text-sm text-red-600">{createError}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Create Room
            </button>
          </form>
        </div>
      ) : null}

      {renameTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={renameRoom}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            aria-labelledby={renameTitleId}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id={renameTitleId} className="text-lg font-semibold tracking-[-0.03em]">
                  Rename room
                </h2>
                <p className="mt-1 text-sm text-black/45">Update the client and project name.</p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setRenameTarget(null)}
                className="rounded-lg p-1.5 text-black/35 hover:bg-black/[0.04]"
              >
                <X className="size-4" />
              </button>
            </div>
            <label className="mt-5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Client name
              <input
                value={renameClient}
                onChange={(e) => setRenameClient(e.target.value)}
                className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]"
                placeholder="Acme Co"
                autoFocus
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.14em] text-black/40">
              Project name
              <input
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-[#6354d4]"
                placeholder="Marketing site launch"
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
            {renameError ? <p className="mt-3 text-sm text-red-600">{renameError}</p> : null}
            <button
              type="submit"
              disabled={busy || !renameName.trim() || !renameClient.trim()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Save
            </button>
          </form>
        </div>
      ) : null}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete room?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{deleteTarget?.name}” and its review data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p className="text-sm text-red-600">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteRoom} disabled={busy}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
