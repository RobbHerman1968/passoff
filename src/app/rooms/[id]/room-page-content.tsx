import Link from "next/link";
import { eq } from "drizzle-orm";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrganizationEntitlements, getWorkspaceUsageSummary } from "@/lib/rooms/entitlements";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { RoomHelpSlide } from "./room-help-slide";
import { RoomWorkspace } from "./room-workspace";

export async function RoomPageContent({
  projectId,
  roomId,
}: {
  projectId: string;
  roomId: string;
}) {
  const scope = await getDefaultWorkspaceScope();
  const [entitlements, usage] = await Promise.all([
    getOrganizationEntitlements(scope.organizationId),
    getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId),
  ]);
  const user = (await db.select().from(users).where(eq(users.id, scope.userId)).limit(1))[0];

  return (
    <main className="flex min-h-svh flex-col bg-[#f3f0ff] text-[var(--brand-deep)]">
      <header className="shrink-0 border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="flex h-16 items-center justify-between px-4 lg:px-5">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-3">
            <RoomHelpSlide />
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
      <div className="relative flex min-h-0 flex-1 flex-col">
        <RoomWorkspace projectId={projectId} roomId={roomId} />
      </div>
    </main>
  );
}
