"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getValidSession } from "@/auth";
import { listUserWorkspaces } from "@/lib/auth/membership";
import { withNotice } from "@/lib/projects/notices";
import { rememberActiveWorkspace } from "@/lib/workspaces/active-workspace";
import { isWorkspaceId } from "@/lib/workspaces/active-cookie";

export type SwitchWorkspaceResult = {
  status: "idle" | "error";
  message?: string;
};

/**
 * Remember which workspace to open. The choice is only saved after the database confirms
 * the person is an active member of it; the saved value never grants access by itself.
 */
export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<SwitchWorkspaceResult> {
  const session = await getValidSession();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  if (!isWorkspaceId(workspaceId)) {
    return { status: "error", message: "We couldn’t switch workspaces. Refresh the page and try again." };
  }

  const memberships = await listUserWorkspaces(session.user.id);
  if (!memberships.some((membership) => membership.workspaceId === workspaceId)) {
    return {
      status: "error",
      message: "You’re no longer a member of that workspace. Refresh the page to see your current workspaces.",
    };
  }

  await rememberActiveWorkspace(session.user.id, workspaceId);
  revalidatePath("/", "layout");
  // Project and review links belong to one workspace, so land on the dashboard.
  redirect(withNotice("/dashboard", "workspace-switched"));
}
