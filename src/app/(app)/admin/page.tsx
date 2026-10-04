import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";

export const metadata: Metadata = {
  title: "Administration",
  description: "Passoff platform administration.",
};

export default async function AdminPage() {
  const auth = await requirePlatformAdmin();

  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect("/sign-in?callbackUrl=/admin");
    }

    return (
      <>
        <PageHeader title="Administration" />
        <EmptyState
          icon={<Lock className="size-8" />}
          title="You don't have access to this area"
          description="This area is only available to Passoff platform administrators. Return to your projects to continue your work."
          action={
            <Button asChild>
              <Link href="/dashboard">Go to projects</Link>
            </Button>
          }
        />
      </>
    );
  }

  const displayName = auth.admin.name?.trim() || auth.admin.email;

  return (
    <>
      <PageHeader
        title="Passoff administration"
        description="This area is restricted to platform administrators. Access here does not grant entry to customer workspaces or private review data."
        breadcrumbs={[{ label: "Projects", href: "/dashboard" }, { label: "Administration" }]}
        primaryAction={
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to projects</Link>
          </Button>
        }
      />

      <section
        aria-labelledby="admin-signed-in-heading"
        className="grid max-w-xl gap-3 rounded-xl border border-border bg-card p-5"
      >
        <h2 id="admin-signed-in-heading" className="type-section-title">
          Signed in as administrator
        </h2>
        <p className="text-sm text-foreground">{displayName}</p>
        <p className="type-supporting">
          This administrator area is restricted. No additional platform tools are
          available yet. When they are, they will appear here with their own
          permissions and audit trail.
        </p>
      </section>
    </>
  );
}
