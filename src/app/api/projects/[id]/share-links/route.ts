import { NextResponse } from "next/server";

import { authzResponse } from "@/lib/auth/authorization";
import { createOrRotateShareLink, revokeShareLink } from "@/lib/rooms/service";
import { getDefaultWorkspaceScope } from "@/lib/tenant/context";
import { getSiteUrl } from "@/lib/site";
import { isEmailConfigured } from "@/lib/email/resend";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!uuidPattern.test(id)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      expiresInDays?: unknown;
      notifyEmail?: unknown;
      shareLinkId?: unknown;
    };

    const scope = await getDefaultWorkspaceScope();

    if (body.action === "revoke") {
      const result = await revokeShareLink(
        scope,
        id,
        typeof body.shareLinkId === "string" ? body.shareLinkId : undefined,
      );
      return NextResponse.json(result);
    }

    const notifyEmail = typeof body.notifyEmail === "string" ? body.notifyEmail.trim() : undefined;
    if (notifyEmail && !isEmailConfigured() && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error: "Email is not configured. The review link was not emailed.",
          notification: { status: "error", reason: "email_unconfigured" },
        },
        { status: 503 },
      );
    }

    const result = await createOrRotateShareLink(scope, id, {
      expiresInDays:
        typeof body.expiresInDays === "number" ? body.expiresInDays : undefined,
      notifyEmail,
    });

    const base = getSiteUrl().replace(/\/$/, "");
    return NextResponse.json(
      {
        id: result.id,
        token: result.token,
        url: `${base}/share/${result.token}`,
        expiresAt: result.expiresAt?.toISOString() ?? null,
        notification: result.notification,
      },
      { status: 201 },
    );
  } catch (error) {
    const authz = authzResponse(error);
    if (authz) return authz;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to manage share link." },
      { status: 400 },
    );
  }
}
