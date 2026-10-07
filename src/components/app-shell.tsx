"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderKanban, Menu, Settings, Shield, Activity } from "lucide-react";
import * as React from "react";

import { AccountMenu } from "@/components/account-menu";
import { ContextualHelpProvider } from "@/components/help/help-context";
import { HelpDrawer } from "@/components/help/help-drawer";
import { HelpTrigger } from "@/components/help/help-trigger";
import { Logo } from "@/components/logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Button } from "@/components/ui/button";
import { WorkspaceSwitcher, type WorkspaceOption } from "@/components/workspaces/workspace-switcher";
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
  /** The current workspace. Needed together with `workspaces` to offer switching. */
  workspaceId?: string;
  /** Every workspace this person belongs to. The switcher appears when there is more than one. */
  workspaces?: WorkspaceOption[];
  accountName: string;
  accountEmail?: string | null;
  /** Shown only when the signed-in user is a platform administrator. */
  showAdministration?: boolean;
  recentProjects?: AppShellProject[];
  unreadCount?: number;
  children: React.ReactNode;
};

export function helpContextForPath(pathname: string): HelpPageContext {
  if (/^\/projects\/[^/]+\/reviews\/[^/]+/.test(pathname)) {
    return "website-review-detail";
  }
  if (/^\/projects\/[^/]+/.test(pathname)) return "project-detail";
  if (pathname.startsWith("/usability")) return "usability";
  if (pathname.startsWith("/notifications")) return "projects-dashboard";
  return "projects-dashboard";
}

export function AppShell({
  workspaceName,
  workspaceRole,
  workspaceId,
  workspaces = [],
  accountName,
  accountEmail,
  showAdministration = false,
  recentProjects = [],
  unreadCount = 0,
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
      workspaceId={workspaceId}
      workspaces={workspaces}
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
            <div className="mb-2 flex justify-end">
              <NotificationBell unreadCount={unreadCount} />
            </div>
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
              <NotificationBell unreadCount={unreadCount} />
              <HelpTrigger placement="header" />
              <AccountMenu name={accountName} email={accountEmail} />
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-w-0 flex-1 flex-col bg-background outline-none lg:rounded-xl lg:ring-1 lg:ring-border lg:elevation-sm"
          >
            <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col page-padding">
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
  workspaceId,
  workspaces,
  showAdministration,
  recentProjects,
  onNavigate,
}: {
  pathname: string;
  workspaceName: string;
  workspaceRole: AppShellProps["workspaceRole"];
  workspaceId?: string;
  workspaces: WorkspaceOption[];
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
  const settingsCurrent = pathname === "/settings" || pathname.startsWith("/settings/");
  const usabilityCurrent = pathname === "/usability" || pathname.startsWith("/usability/");

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
        <WorkspaceSwitcher
          current={{ id: workspaceId ?? "current", name: workspaceName, role: workspaceRole }}
          workspaces={workspaceId ? workspaces : []}
        />
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
          <li>
            <SidebarLink
              href="/usability"
              current={usabilityCurrent}
              onNavigate={onNavigate}
              icon={<Activity aria-hidden="true" />}
            >
              Usability
            </SidebarLink>
          </li>
          <li>
            <SidebarLink
              href="/settings/workspace"
              current={settingsCurrent}
              onNavigate={onNavigate}
              icon={<Settings aria-hidden="true" />}
            >
              Settings
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
