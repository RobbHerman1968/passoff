import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/db";
import { users, workspaces } from "@/db/schema";
import { requireActiveWorkspaceMembership } from "@/lib/auth/authorization";
import { getWorkspaceNotificationEmail } from "@/lib/auth/tenant-membership";
import {
  formatStorageBytes,
  getOrganizationEntitlements,
  getWorkspaceUsageSummary,
} from "@/lib/rooms/entitlements";

import { AccountPasswordForm, AccountProfileForm, NotificationEmailForm } from "./account-forms";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/account");
  }

  const scope = await requireActiveWorkspaceMembership();
  const entitlements = await getOrganizationEntitlements(scope.organizationId);
  const usage = await getWorkspaceUsageSummary(scope.organizationId, scope.workspaceId);
  const workspace = (
    await db.select().from(workspaces).where(eq(workspaces.id, scope.workspaceId)).limit(1)
  )[0];
  const user = (await db.select().from(users).where(eq(users.id, scope.userId)).limit(1))[0];
  const notificationEmail =
    (await getWorkspaceNotificationEmail(scope.workspaceId)) || scope.userEmail;

  return (
    <main className="min-h-screen bg-[#f3f0ff] text-[var(--brand-deep)]">
      <header className="border-b border-[#a594f5]/25 bg-[#faf8ff]">
        <div className="flex h-16 items-center justify-between px-4 lg:px-5">
          <Link href="/dashboard" className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.04em]">
            <BrandMark size={28} />
            Pass-Off
          </Link>
          <Link
            href="/dashboard"
            className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-black/60 transition hover:bg-black/[0.02]"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.055em]">
          Account
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/45">
          Manage your profile, workspace notifications, and billing status for{" "}
          {workspace?.name || scope.workspaceName}.
        </p>

        <section className="mt-10 space-y-8">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">
                Active rooms
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.03em]">
                {usage.roomCount}
                <span className="text-base font-medium text-black/35"> / {usage.maxActiveRooms}</span>
              </p>
            </div>
            <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">
                Storage used
              </p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-[-0.03em]">
                {formatStorageBytes(usage.usedBytes)}
              </p>
              <p className="mt-1 text-sm text-black/40">
                of {formatStorageBytes(usage.maxStorageBytes)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Profile</h2>
            <p className="mt-1 text-sm text-black/45">{scope.userEmail}</p>
            <div className="mt-5">
              <AccountProfileForm defaultName={scope.userName} />
            </div>
          </div>

          {user?.passwordHash ? (
            <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-6">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Password</h2>
              <p className="mt-1 text-sm text-black/45">
                Change the password you use to sign in to Pass-Off.
              </p>
              <div className="mt-5">
                <AccountPasswordForm />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Notifications</h2>
            <div className="mt-5">
              <NotificationEmailForm defaultEmail={notificationEmail} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Billing</h2>
            <p className="mt-2 text-sm leading-6 text-black/55">
              Current plan:{" "}
              <span className="font-semibold capitalize text-[var(--brand-deep)]">
                {entitlements.planId}
              </span>{" "}
              · status{" "}
              <span className="font-semibold text-[var(--brand-deep)]">{entitlements.status}</span>
              {entitlements.trialEndsAt ? (
                <>
                  {" "}
                  · trial ends {entitlements.trialEndsAt.toLocaleDateString()}
                </>
              ) : null}
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-flex text-sm font-semibold text-[var(--brand-ink)] hover:underline"
            >
              View Pricing and Plans
            </Link>
          </div>

          <div className="rounded-2xl border border-[#a594f5]/25 bg-white p-6">
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Session</h2>
            <p className="mt-2 text-sm text-black/45">Sign out of Pass-Off on this device.</p>
            <div className="mt-4">
              <SignOutButton className="inline-flex h-10 items-center rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-black/60 transition hover:bg-black/[0.02]" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
