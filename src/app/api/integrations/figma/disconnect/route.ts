import { NextResponse } from "next/server";

import { deleteConnection } from "@/lib/figma/data";
import { clearFigmaConnectionCookie, getFigmaConnectionId } from "@/lib/figma/session";

export async function POST() {
  const connectionId = await getFigmaConnectionId();
  if (connectionId) await deleteConnection(connectionId);
  await clearFigmaConnectionCookie();
  return NextResponse.json({ disconnected: true });
}
