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
import { track } from "@/lib/analytics/events";

export type DashboardRoom = {
  id: string;
  name: string;
  clientName: string;
  slug: string;
  status: string;
};

type RoomsDashboardProps = {
  rooms: DashboardRoom[];
};

export function RoomsDashboard({ rooms: initialRooms }: RoomsDashboardProps) {
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

  useEffect(() => {
    setRooms(initialRooms);
  }, [initialRooms]);

  useEffect(() => {
    if (!createOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setCreateOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, busy]);

  async function createRoom(event: React.FormEvent) {
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

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/40">
          {rooms.length} room{rooms.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setCreateError(null);
            setCreateName("");
            setCreateClient("");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-[#6354d4] px-4 py-2.5 text-[10px] font-semibold text-[#e4dffc] transition hover:bg-[#5b4cc4]"
        >
          <Plus className="size-3.5" />
          New approval room
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="group relative rounded-2xl border border-[#a594f5]/30 bg-white p-5 shadow-[0_1px_0_rgba(99,84,212,0.06)]"
          >
            <Link href={`/rooms/${encodeURIComponent(room.id)}`} className="block pr-10">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7c6cf0]">
                <FolderKanban className="size-3.5" />
                {room.status}
              </div>
              <h2 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--brand-deep)]">
                {room.name}
              </h2>
              <p className="mt-1 text-sm text-black/45">{room.clientName || "No client name"}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6354d4]">
                Open room <ArrowRight className="size-3.5" />
              </span>
            </Link>
            <button
              type="button"
              aria-label={`Delete ${room.name}`}
              onClick={() => {
                setDeleteTarget(room);
                setDeleteError(null);
              }}
              className="absolute right-3 top-3 rounded-lg p-2 text-black/25 opacity-0 transition hover:bg-black/[0.04] hover:text-black/55 group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
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
                  New approval room
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
              Create room
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
