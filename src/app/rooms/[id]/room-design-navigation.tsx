import { FolderOpen, Upload } from "lucide-react";
import Link from "next/link";

import { projectRoomDesignsPath, projectRoomPath } from "@/lib/rooms/routes";

export function RoomSectionNavigation({
  projectId,
  roomId,
  active,
}: {
  projectId: string;
  roomId: string;
  active: "room" | "designs";
}) {
  return (
    <nav aria-label="Room sections" className="flex items-center gap-1">
      <Link
        href={projectRoomPath(projectId, roomId)}
        aria-current={active === "room" ? "page" : undefined}
        className={active === "room" ? "rounded-md bg-[#6354d4] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white" : "rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6354d4] hover:bg-[#ebe6fa]"}
      >
        Room
      </Link>
      <Link
        href={projectRoomDesignsPath(projectId, roomId)}
        aria-current={active === "designs" ? "page" : undefined}
        className={active === "designs" ? "rounded-md bg-[#6354d4] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-white" : "rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6354d4] hover:bg-[#ebe6fa]"}
      >
        Designs
      </Link>
    </nav>
  );
}

export function EmptyRoomDesignsCallToAction({
  busy,
  archived,
  onUpload,
  onAddFromDesigns,
}: {
  busy: boolean;
  archived: boolean;
  onUpload: (files: FileList | null) => void;
  onAddFromDesigns: () => void;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-dashed border-[#a594f5]/45 bg-white p-8 text-center sm:p-10">
      <Upload className="mx-auto size-8 text-[#6354d4]" />
      <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Add designs to this room</h2>
      <p className="mt-2 text-sm text-black/50">
        Import a Figma file or upload screen images, then publish a revision when it is ready for review.
      </p>
      <button
        type="button"
        disabled={busy || archived}
        onClick={onAddFromDesigns}
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[#6354d4] px-5 py-3 text-[12px] font-semibold text-white"
      >
        <FolderOpen className="size-4" />
        Add from Designs
      </button>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#a594f5]/40 px-5 py-3 text-[12px] font-semibold text-[#6354d4]">
        <Upload className="size-4" />
        Upload screen images or PDF
        <input
          id="room-upload-input"
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          disabled={busy || archived}
          onChange={(event) => onUpload(event.target.files)}
        />
      </label>
    </div>
  );
}
