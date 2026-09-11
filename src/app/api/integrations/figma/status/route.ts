import { NextResponse } from "next/server";

import { isFigmaConfigured } from "@/lib/figma/config";
import { getConnectionSummary } from "@/lib/figma/data";
import { getFigmaConnectionId } from "@/lib/figma/session";
import type { FigmaConnectionStatus } from "@/lib/figma/types";
import { getPrototypeTenantContext } from "@/lib/tenant/context";

export async function GET() {
  const configured = isFigmaConfigured();
  const connectionId = await getFigmaConnectionId();
  const connection = configured && connectionId ? await getConnectionSummary(connectionId) : null;
  const tenant = await getPrototypeTenantContext().catch(() => null);
  const status: FigmaConnectionStatus = {
    configured,
    pluginConfigured: process.env.NODE_ENV === "development",
    connected: Boolean(connection),
    figmaUserId: connection?.figmaUserId ?? null,
    expiresAt: connection?.expiresAt.toISOString() ?? null,
    tenant: tenant ? {
      organizationName: tenant.organizationName,
      workspaceName: tenant.workspaceName,
      projectName: tenant.projectName,
      userName: tenant.userName,
      userEmail: tenant.userEmail,
    } : null,
  };
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}
