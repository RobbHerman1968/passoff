"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Menu, Shield } from "lucide-react";
import * as React from "react";

import { AccountMenu } from "@/components/account-menu";
import { ContextualHelpProvider } from "@/components/help/help-context";
import { HelpDrawer } from "@/components/help/help-drawer";
import { HelpTrigger } from "@/components/help/help-trigger";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { HelpPageContext } from "@/lib/help/topics";
import { cn } from "@/lib/utils";

export type AppShellProject = { id: string; name: string };

export type AppShellProps = {
  workspaceName: string;
  workspaceRole: "owner" | "member";
  accountName: string;
  accountEmail?: string | null;
  /** Shown only when the signed-in user is a platform administrator. */
  showAdministration?: boolean;
  recentProjects?: AppShellProject[];
  children: React.ReactNode;
};

const ROLE_LABELS: Record<AppShellProps["workspaceRole"], string> = {
  owner: "Owner",
  member: "Member",
};

export function helpContextForPath(pathname: string): HelpPageContext {
  if (/^\/projects\/[^/]+\/reviews\/[^/]+/.test(pathname)) {
    return "website-review-detail";
  }
  if (/^\/projects\/[^/]+/.test(pathname)) return "project-detail";
  return "projects-dashboard";
}

export function AppShell({
  workspaceName,
  workspaceRole,
  accountName,
  accountEmail,
  showAdministration = false,
  recentProjects = [],
  children,
}: AppShellProps) {
  const pathname = usePathname() ?? "/dashboard";
  const [navOpen, setNavOpen] = React.useState(false);
  const helpContext = helpContextForPath(pathname);

  const sidebar = (
    <SidebarContent
      pathname={pathname}
      workspaceName={workspaceName}
      workspaceRole={workspaceRole}
      showAdministration={showAdministration}
      recentProjects={recentProjects}
      onNavigate={() => setNavOpen(false)}
    />
  );

  return (
    <ContextualHelpProvider key={helpContext} pageContext={helpContext}>
      <a
        href="#main-content"
        className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100]"
      >
        Skip to content
      </a>
      <div className="flex min-h-full flex-1 flex-col bg-sidebar lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside
          aria-label="Workspace"
          className="hidden text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col"
        >
          {sidebar}
          <div className="border-t border-sidebar-border p-3">
            <AccountMenu
              name={accountName}
              email={accountEmail}
              variant="sidebar"
            />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background px-3 sm:px-4 lg:hidden">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-[min(18rem,100%)] flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Passoff</SheetTitle>
                  <SheetDescription>
                    Move between your workspace and projects.
                  </SheetDescription>
                </SheetHeader>
                {sidebar}
              </SheetContent>
            </Sheet>
            <Link
              href="/dashboard"
              aria-label="Passoff projects"
              className="rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Logo className="flex items-center gap-2" />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <HelpTrigger placement="header" />
              <AccountMenu name={accountName} email={accountEmail} />
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-w-0 flex-1 flex-col bg-background outline-none lg:rounded-xl lg:ring-1 lg:ring-border lg:elevation-sm"
          >
            <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col page-padding">
              {children}
            </div>
          </main>
        </div>
      </div>
      <HelpDrawer />
    </ContextualHelpProvider>
  );
}

function SidebarContent({
  pathname,
  workspaceName,
  workspaceRole,
  showAdministration,
  recentProjects,
  onNavigate,
}: {
  pathname: string;
  workspaceName: string;
  workspaceRole: AppShellProps["workspaceRole"];
  showAdministration: boolean;
  recentProjects: AppShellProject[];
  onNavigate: () => void;
}) {
  const isProjectPath = (id: string) =>
    pathname === `/projects/${id}` || pathname.startsWith(`/projects/${id}/`);
  const projectsCurrent =
    pathname.startsWith("/dashboard") ||
    (pathname.startsWith("/projects/") &&
      !recentProjects.some((project) => isProjectPath(project.id)));
  const adminCurrent =
    pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-3">
      <div className="grid gap-4">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Passoff projects"
          className="flex h-10 items-center rounded-md px-2 text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Logo className="flex items-center gap-2.5" />
        </Link>
        <div className="flex items-center gap-3 rounded-lg bg-background/60 p-2 ring-1 ring-sidebar-border">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            {workspaceName.trim().charAt(0).toUpperCase() || "W"}
          </span>
          <div className="grid min-w-0">
            <p className="truncate text-sm font-medium">{workspaceName}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[workspaceRole]}
            </p>
          </div>
        </div>
      </div>

      <nav aria-label="Primary" className="grid gap-6">
        <ul className="grid gap-0.5">
          <li>
            <SidebarLink
              href="/dashboard"
              current={projectsCurrent}
              onNavigate={onNavigate}
              icon={<FolderKanban aria-hidden="true" />}
            >
              Projects
            </SidebarLink>
          </li>
          {showAdministration ? (
            <li>
              <SidebarLink
                href="/admin"
                current={adminCurrent}
                onNavigate={onNavigate}
                icon={<Shield aria-hidden="true" />}
              >
                Administration
              </SidebarLink>
            </li>
          ) : null}
        </ul>

        {recentProjects.length > 0 ? (
          <div className="grid gap-1">
            <p
              id="recent-projects-label"
              className="px-3 text-xs font-medium text-muted-foreground"
            >
              Recent projects
            </p>
            <ul aria-labelledby="recent-projects-label" className="grid gap-0.5">
              {recentProjects.map((project) => {
                const href = `/projects/${project.id}`;
                const current = isProjectPath(project.id);
                return (
                  <li key={project.id}>
                    <SidebarLink
                      href={href}
                      current={current}
                      onNavigate={onNavigate}
                      icon={
                        <span
                          aria-hidden="true"
                          className="flex size-5 items-center justify-center rounded bg-sidebar-accent text-[0.6875rem] font-semibold text-sidebar-accent-foreground"
                        >
                          {project.name.trim().charAt(0).toUpperCase()}
                        </span>
                      }
                    >
                      {project.name}
                    </SidebarLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </nav>

      <div className="mt-auto">
        <HelpTrigger placement="sidebar" />
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  current,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  current: boolean;
  icon: React.ReactNode;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-sidebar-foreground outline-none hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        current &&
          "bg-background text-foreground ring-1 ring-sidebar-border [&_svg]:text-primary",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{children}</span>
    </Link>
  );
}
