"use client";

import { FileImage } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

type RoomDesignScreen = {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  imageUrl: string | null;
};

export function RoomDesignPreview({ screens }: { screens: RoomDesignScreen[] }) {
  const [selectedScreenId, setSelectedScreenId] = useState(screens[0]?.id ?? null);
  const selectedScreen = useMemo(
    () => screens.find((screen) => screen.id === selectedScreenId) ?? screens[0] ?? null,
    [screens, selectedScreenId],
  );

  if (!selectedScreen) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-black/15 bg-white/60 text-xs text-black/40">
        No screens are included in this design.
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {screens.length > 1 ? (
        <div className="mb-3 flex gap-2 overflow-x-auto rounded-xl border border-black/8 bg-white/60 p-2" aria-label="Design screen thumbnails">
          {screens.map((screen) => {
            const selected = screen.id === selectedScreen.id;
            return (
              <button
                key={screen.id}
                type="button"
                aria-label={`View ${screen.name}`}
                aria-pressed={selected}
                onClick={() => setSelectedScreenId(screen.id)}
                className={`w-28 shrink-0 overflow-hidden rounded-lg border bg-white text-left transition ${
                  selected
                    ? "border-[#6354d4] ring-2 ring-[#6354d4]/20"
                    : "border-black/10 hover:border-[#a594f5]"
                }`}
              >
                <span className="relative block aspect-[4/3] overflow-hidden bg-[#e9e5f3]">
                  {screen.imageUrl ? (
                    <Image src={screen.imageUrl} alt="" fill sizes="112px" className="object-cover object-top" unoptimized />
                  ) : (
                    <FileImage className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-black/20" />
                  )}
                </span>
                <span className={`block truncate px-2 py-1.5 text-[9px] font-semibold ${selected ? "bg-[#6354d4] text-white" : "text-black/55"}`}>
                  {screen.name}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <figure className="overflow-hidden rounded-xl border border-black/10 bg-white shadow-sm">
        <div className="flex min-h-64 items-center justify-center bg-white p-2 sm:p-4">
          {selectedScreen.imageUrl ? (
            <Image
              src={selectedScreen.imageUrl}
              alt={selectedScreen.name}
              width={selectedScreen.width ?? 1}
              height={selectedScreen.height ?? 1}
              sizes="(min-width: 1024px) calc(100vw - 460px), 100vw"
              className="max-h-[62vh] h-auto w-auto max-w-full object-contain"
              unoptimized
            />
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-xs text-black/35">
              <FileImage className="size-7 text-black/20" />
              Preview unavailable
            </div>
          )}
        </div>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-black/8 px-3 py-2 text-xs font-medium">
          <span>{selectedScreen.name}</span>
          {selectedScreen.width && selectedScreen.height ? (
            <span className="text-[10px] font-normal text-black/40">{selectedScreen.width} × {selectedScreen.height}</span>
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}
