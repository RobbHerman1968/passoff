import { AppShell, type AppShellProject } from "@/components/app-shell";
import { isPlatformAdmin } from "@/lib/auth/platform-admin";
import { listProjects } from "@/lib/projects/service";
import { requireWorkspaceContext } from "@/lib/workspaces/context";

const RECENT_PROJECT_LIMIT = 5;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    // Pages own the redirect so it can carry their callback URL.
    return (
      <main id="main-content" className="flex min-h-full flex-1 flex-col">
        {children}
      </main>
    );
  }

  const { context } = auth;
  const showAdministration = await isPlatformAdmin();
  let recentProjects: AppShellProject[] = [];
  try {
    const projects = await listProjects(context, { status: "active" });
    recentProjects = projects
      .slice(0, RECENT_PROJECT_LIMIT)
      .map((project) => ({ id: project.id, name: project.name }));
  } catch {
    recentProjects = [];
  }

  return (
    <AppShell
      workspaceName={context.workspaceName}
      workspaceRole={context.role}
      accountName={context.userName?.trim() || context.userEmail || "Account"}
      accountEmail={context.userEmail}
      showAdministration={showAdministration}
      recentProjects={recentProjects}
    >
      {children}
    </AppShell>
  );
}
