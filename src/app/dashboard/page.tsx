import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";

import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { SignupCompletedTracker } from "@/components/seo/signup-completed-tracker";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  getOrganizationEntitlements,
  getWorkspaceUsageSummary,
} from "@/lib/rooms/entitlements";
import { listClientProjects } from "@/lib/projects/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";

import { ProjectsDashboard } from "./projects-dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Pass-Off",
  description: "Client approval rooms for final review, sign-off, and handoff.",
};

export default async function DashboardPage() {
  const scope = await getDefaultWorkspaceScope();
  const projects = await listClientProjects(scope.workspaceId);
  const entitlements = await getOrganizationEntitlements(scope.organizationId);
  const usage = await getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId);
  const user = (await db.select().from(users).where(eq(users.id, scope.userId)).limit(1))[0];

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <SignupCompletedTracker />
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

      <div className="w-full px-5 py-6 lg:px-8">
        <ProjectsDashboard
          initialProjects={projects}
          canCreate={entitlements.canCreateRooms}
          isExpired={entitlements.isExpired}
        />
      </div>
    </main>
  );
}
