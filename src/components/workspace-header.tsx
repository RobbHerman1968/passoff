import { eq } from "drizzle-orm";
import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrganizationEntitlements, getWorkspaceUsageSummary } from "@/lib/rooms/entitlements";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

export async function WorkspaceHeader() {
  const scope = await getDefaultWorkspaceScope();
  const [entitlements, usage, user] = await Promise.all([
    getOrganizationEntitlements(scope.organizationId),
    getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId),
    db.select().from(users).where(eq(users.id, scope.userId)).limit(1).then((rows) => rows[0]),
  ]);

  return (
    <header className="shrink-0 border-b border-[#a594f5]/25 bg-[#faf8ff]">
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
  );
}
