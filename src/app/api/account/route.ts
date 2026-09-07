import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { authzResponse, requireActiveWorkspaceMembership } from "@/lib/auth/authorization";
import { normalizeEmail } from "@/lib/auth/password";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const scope = await requireActiveWorkspaceMembership();
    const body = (await request.json()) as { notificationEmail?: unknown };
    const email = normalizeEmail(
      typeof body.notificationEmail === "string" ? body.notificationEmail : "",
    );
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid notification email." }, { status: 400 });
    }

    const [workspace] = await db
      .update(workspaces)
      .set({
        notificationEmail: email,
        replyToEmail: email,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, scope.workspaceId))
      .returning({
        id: workspaces.id,
        notificationEmail: workspaces.notificationEmail,
      });

    return NextResponse.json({
      workspaceId: workspace.id,
      notificationEmail: workspace.notificationEmail,
    });
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update account." },
      { status: 400 },
    );
  }
}
