import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { SignupCompletedTracker } from "@/components/seo/signup-completed-tracker";
import { SignOutButton } from "@/components/sign-out-button";
import { getOrganizationEntitlements } from "@/lib/rooms/entitlements";
import { listRooms } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { RoomsDashboard } from "./rooms-dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Pass-Off",
  description: "Client approval rooms for final review, sign-off, and handoff.",
};

export default async function DashboardPage() {
  const scope = await getDefaultWorkspaceScope();
  const rooms = await listRooms(scope.workspaceId);
  const entitlements = await getOrganizationEntitlements(scope.organizationId);

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <SignupCompletedTracker />
      <header className="border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#a594f5]/30 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7c6cf0] sm:inline">
              {entitlements.planId}
            </span>
            <Link
              href="/account"
              className="hidden text-xs text-black/40 transition hover:text-black/70 sm:inline"
            >
              {scope.userEmail}
            </Link>
            <SignOutButton className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black/60 transition hover:bg-black/[0.02]" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-12">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7c6cf0]">
          <FolderKanban className="size-4" />
          {scope.workspaceName}
        </div>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
          Approval rooms
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-black/45">
          Collect visual feedback, lock client approval on a revision, and deliver handoff files
          through one branded link.
        </p>

        <RoomsDashboard
          rooms={rooms.map((room) => ({
            id: room.id,
            name: room.name,
            clientName: room.clientName,
            slug: room.slug,
            status: room.status,
          }))}
        />
      </div>
    </main>
  );
}
