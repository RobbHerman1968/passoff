import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getWorkspaceUsageSummary } from "@/lib/rooms/entitlements";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { RoomHelpSlide } from "./room-help-slide";
import { RoomWorkspace } from "./room-workspace";

export const metadata: Metadata = {
  title: "Approval room | Pass-Off",
  description: "Manage revision, share link, feedback, approval, and handoff.",
};

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await getDefaultWorkspaceScope();
  const usage = await getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId);
  const user = (await db.select().from(users).where(eq(users.id, scope.userId)).limit(1))[0];

  return (
    <main className="flex min-h-svh flex-col bg-[#f3f0ff] text-[var(--brand-deep)]">
      <header className="shrink-0 border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="flex h-12 items-center justify-between gap-3 px-4 lg:px-5">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold tracking-[-0.04em]">
            <BrandMark size={22} />
            Pass-Off
          </Link>
          <div className="flex items-center gap-2">
            <RoomHelpSlide />
            <AccountMenu
              name={scope.userName}
              email={scope.userEmail}
              roomCount={usage.roomCount}
              maxActiveRooms={usage.maxActiveRooms}
              usedBytes={usage.usedBytes}
              maxStorageBytes={usage.maxStorageBytes}
              hasPassword={Boolean(user?.passwordHash)}
              compact
            />
          </div>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <RoomWorkspace roomId={id} />
      </div>
    </main>
  );
}
