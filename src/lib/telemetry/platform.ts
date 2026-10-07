import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { platformTelemetryControls } from "@/db/schema";

export async function isPlatformTelemetryKillSwitchOn(): Promise<boolean> {
  if (process.env.PASSOFF_TELEMETRY_KILL_SWITCH === "true") {
    return true;
  }
  const [row] = await db
    .select({ killSwitch: platformTelemetryControls.killSwitch })
    .from(platformTelemetryControls)
    .where(eq(platformTelemetryControls.id, "platform"))
    .limit(1);
  return Boolean(row?.killSwitch);
}

export async function setPlatformTelemetryKillSwitch(
  on: boolean,
  actorUserId: string | null,
): Promise<void> {
  const now = new Date();
  await db
    .insert(platformTelemetryControls)
    .values({
      id: "platform",
      killSwitch: on,
      updatedByUserId: actorUserId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: platformTelemetryControls.id,
      set: {
        killSwitch: on,
        updatedByUserId: actorUserId,
        updatedAt: now,
      },
    });
}
