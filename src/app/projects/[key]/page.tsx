import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrganizationEntitlements, getWorkspaceUsageSummary } from "@/lib/rooms/entitlements";
import { getClientProjectBundle } from "@/lib/projects/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { ProjectWorkspace } from "./project-workspace";

export const metadata: Metadata = {
  title: "Project | Pass-Off",
  description: "Manage project design files and approval rooms.",
};

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: projectId } = await params;
  const scope = await getDefaultWorkspaceScope();
  let bundle;
  try {
    bundle = await getClientProjectBundle(scope.workspaceId, projectId);
  } catch {
    notFound();
  }
  const [entitlements, usage] = await Promise.all([
    getOrganizationEntitlements(scope.organizationId),
    getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId),
  ]);
  const user = (await db.select().from(users).where(eq(users.id, scope.userId)).limit(1))[0];

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <header className="border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="flex h-16 items-center justify-between px-4 lg:px-5">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-[#a594f5]/30 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7c6cf0] sm:inline">
              {entitlements.planId}
            </span>
            <AccountMenu
              name={scope.userName}
              email={scope.userEmail}
              roomCount={usage.roomCount}
              maxActiveRooms={usage.maxActiveRooms}
              usedBytes={usage.usedBytes}
              maxStorageBytes={usage.maxStorageBytes}
              hasPassword={Boolean(user?.passwordHash)}
            />
          </div>
        </div>
      </header>
      <div className="w-full px-5 pb-6 pt-4 lg:px-8">
        <ProjectWorkspace
          project={bundle.project}
          stats={bundle.stats}
          initialRooms={bundle.rooms.map((room) => ({ id: room.id, name: room.name, status: room.status }))}
          canCreateRooms={entitlements.canCreateRooms}
          maxActiveRooms={usage.maxActiveRooms}
          activeRoomCount={usage.roomCount}
          maxStorageBytes={usage.maxStorageBytes}
        />
      </div>
    </main>
  );
}
