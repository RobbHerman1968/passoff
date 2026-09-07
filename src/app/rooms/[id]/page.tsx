import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { RoomWorkspace } from "./room-workspace";

export const metadata: Metadata = {
  title: "Approval room | Pass-Off",
  description: "Manage revision, share link, feedback, approval, and handoff.",
};

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getDefaultWorkspaceScope();

  return (
    <main className="flex min-h-svh flex-col bg-[#f3f0ff] text-[var(--brand-deep)]">
      <header className="shrink-0 border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="flex h-12 items-center justify-between px-4 lg:px-5">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-[-0.04em]">
            <BrandMark size={22} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-black/40 sm:inline">{scope.userEmail}</span>
            <SignOutButton className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black/60 transition hover:bg-black/[0.02]" />
          </div>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <RoomWorkspace roomId={id} />
      </div>
    </main>
  );
}
