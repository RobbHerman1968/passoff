import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { workspaceMemberships, workspaces, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { createCredentialsUser } from "@/lib/auth/users";
import { testRoutesEnabled } from "@/lib/security/production-guards";

/**
 * Test helper: create a credentials member on the owner's active team.
 * Requires EMAIL_TRANSPORT=test.
 */
export async function POST(request: Request) {
  if (!testRoutesEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as {
    ownerEmail?: string;
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  } | null;

  const ownerEmail =
    typeof body?.ownerEmail === "string"
      ? normalizeEmail(body.ownerEmail)
      : "";
  const email =
    typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const firstName =
    typeof body?.firstName === "string" ? body.firstName : "Team";
  const lastName =
    typeof body?.lastName === "string" ? body.lastName : "Member";

  if (!ownerEmail || !email || !password) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [owner] = await db
    .select({
      workspaceId: workspaces.id,
    })
    .from(users)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(workspaceMemberships.userId, users.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaceMemberships.role, "owner"),
      ),
    )
    .innerJoin(workspaces, and(eq(workspaces.id, workspaceMemberships.workspaceId), isNull(workspaces.deletedAt)))
    .where(eq(users.email, ownerEmail))
    .limit(1);

  if (!owner) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const created = await createCredentialsUser({
    firstName,
    lastName,
    email,
    password,
  });

  let userId: string;
  if (created.ok) {
    userId = created.user.id;
  } else {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (!existing) {
      return NextResponse.json({ error: "Could not create user" }, { status: 500 });
    }
    userId = existing.id;
  }

  await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: owner.workspaceId,
      userId,
      role: "member",
      status: "active",
    })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true, userId, email });
}
