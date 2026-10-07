import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import {
  DEFAULT_TELEMETRY_AGGREGATE_RETENTION_DAYS,
  DEFAULT_TELEMETRY_MIN_SAMPLE_SESSIONS,
  DEFAULT_TELEMETRY_RAW_RETENTION_HOURS,
  DEFAULT_TELEMETRY_SAMPLING_PERCENT,
  activityEvents,
  environmentTelemetrySettings,
  projectEnvironments,
  projects,
  type TelemetryCollectionMode,
} from "@/db/schema";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { TELEMETRY_ACTIVITY } from "@/lib/telemetry/limits";
import { isPlatformTelemetryKillSwitchOn } from "@/lib/telemetry/platform";
import { normalizeExclusionList } from "@/lib/telemetry/routes";
import type { WorkspaceContext } from "@/lib/workspaces/context";

export type TelemetrySettingsRecord = typeof environmentTelemetrySettings.$inferSelect;

export const telemetrySettingsSchema = z
  .object({
    collectionMode: z.enum(["off", "strict_consent", "privacy_first_aggregate"]),
    enabledOriginsText: z.string().max(8_000),
    excludedRoutesText: z.string().max(8_000),
    samplingPercent: z.coerce.number().int().min(1).max(100),
    rawRetentionHours: z.coerce.number().int().min(1).max(168),
    aggregateRetentionDays: z.coerce.number().int().min(1).max(365),
    organizationName: z.string().trim().max(120).optional().or(z.literal("")),
    privacyPolicyUrl: z.string().trim().max(2_048).optional().or(z.literal("")),
    hideBuiltInPrivacyLink: z.boolean().optional(),
    testModeEnabled: z.boolean().optional(),
    environmentKillSwitch: z.boolean().optional(),
    version: z.coerce.number().int().positive(),
  })
  .strict();

function parseOriginList(text: string): { ok: true; origins: string[] } | { ok: false; message: string } {
  const lines = text
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const origins: string[] = [];
  for (const line of lines) {
    const result = normalizeOrigin(line);
    if (!result.ok) {
      return {
        ok: false,
        message: "Enabled origins must be exact http or https addresses.",
      };
    }
    if (!origins.includes(result.origin)) origins.push(result.origin);
  }
  return { ok: true, origins };
}

export async function getOrCreateTelemetrySettings(
  environmentId: string,
  workspaceId: string,
): Promise<TelemetrySettingsRecord | null> {
  const [existing] = await db
    .select()
    .from(environmentTelemetrySettings)
    .where(
      and(
        eq(environmentTelemetrySettings.environmentId, environmentId),
        eq(environmentTelemetrySettings.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [environment] = await db
    .select({
      id: projectEnvironments.id,
      workspaceId: projectEnvironments.workspaceId,
      projectId: projectEnvironments.projectId,
      allowedOrigins: projectEnvironments.allowedOrigins,
    })
    .from(projectEnvironments)
    .where(
      and(
        eq(projectEnvironments.id, environmentId),
        eq(projectEnvironments.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!environment) return null;

  const now = new Date();
  const [created] = await db
    .insert(environmentTelemetrySettings)
    .values({
      workspaceId: environment.workspaceId,
      projectId: environment.projectId,
      environmentId: environment.id,
      collectionMode: "off",
      enabledOrigins: environment.allowedOrigins,
      excludedRoutes: [],
      samplingPercent: DEFAULT_TELEMETRY_SAMPLING_PERCENT,
      rawRetentionHours: DEFAULT_TELEMETRY_RAW_RETENTION_HOURS,
      aggregateRetentionDays: DEFAULT_TELEMETRY_AGGREGATE_RETENTION_DAYS,
      minSampleSessions: DEFAULT_TELEMETRY_MIN_SAMPLE_SESSIONS,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;
  const [again] = await db
    .select()
    .from(environmentTelemetrySettings)
    .where(eq(environmentTelemetrySettings.environmentId, environmentId))
    .limit(1);
  return again ?? null;
}

export async function updateTelemetrySettings(
  context: WorkspaceContext,
  environmentId: string,
  input: z.infer<typeof telemetrySettingsSchema>,
): Promise<
  | { ok: true; settings: TelemetrySettingsRecord }
  | { ok: false; error: "forbidden" | "not_found" | "conflict" | "validation"; message?: string }
> {
  if (context.role !== "owner") {
    return { ok: false, error: "forbidden" };
  }

  const origins = parseOriginList(input.enabledOriginsText);
  if (!origins.ok) return { ok: false, error: "validation", message: origins.message };

  let privacyPolicyUrl: string | null = null;
  const rawUrl = input.privacyPolicyUrl?.trim();
  if (rawUrl) {
    const parsed = normalizeOrigin(rawUrl) ;
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return {
          ok: false,
          error: "validation",
          message: "The privacy policy link must use http or https.",
        };
      }
      privacyPolicyUrl = url.toString();
    } catch {
      return {
        ok: false,
        error: "validation",
        message: "Enter a valid privacy policy web address.",
      };
    }
    void parsed;
  }

  const settings = await getOrCreateTelemetrySettings(
    environmentId,
    context.workspaceId,
  );
  if (!settings) return { ok: false, error: "not_found" };
  if (settings.version !== input.version) {
    return {
      ok: false,
      error: "conflict",
      message: "These settings changed while you were editing. Reload and try again.",
    };
  }

  const [project] = await db
    .select({ status: projects.status })
    .from(projects)
    .where(eq(projects.id, settings.projectId))
    .limit(1);
  if (project?.status === "archived") {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date();
  const [updated] = await db
    .update(environmentTelemetrySettings)
    .set({
      collectionMode: input.collectionMode,
      enabledOrigins: origins.origins,
      excludedRoutes: normalizeExclusionList(
        input.excludedRoutesText.split(/[\n,]+/),
      ),
      samplingPercent: input.samplingPercent,
      rawRetentionHours: input.rawRetentionHours,
      aggregateRetentionDays: input.aggregateRetentionDays,
      organizationName: input.organizationName?.trim() || null,
      privacyPolicyUrl,
      hideBuiltInPrivacyLink: Boolean(input.hideBuiltInPrivacyLink),
      testModeEnabled: Boolean(input.testModeEnabled),
      environmentKillSwitch: Boolean(input.environmentKillSwitch),
      version: settings.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(environmentTelemetrySettings.id, settings.id),
        eq(environmentTelemetrySettings.version, settings.version),
      ),
    )
    .returning();

  if (!updated) {
    return {
      ok: false,
      error: "conflict",
      message: "These settings changed while you were editing. Reload and try again.",
    };
  }

  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: settings.projectId,
    actorUserId: context.userId,
    type: TELEMETRY_ACTIVITY.settingsUpdated,
    data: { environmentId, collectionMode: updated.collectionMode },
  });

  return { ok: true, settings: updated };
}

export async function clearTestTelemetry(
  context: WorkspaceContext,
  environmentId: string,
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "not_found" }> {
  if (context.role !== "owner") return { ok: false, error: "forbidden" };
  const settings = await getOrCreateTelemetrySettings(
    environmentId,
    context.workspaceId,
  );
  if (!settings) return { ok: false, error: "not_found" };

  const { telemetryRawEvents, telemetryAggregates, telemetryAggregateSessions } =
    await import("@/db/schema");
  await db
    .delete(telemetryRawEvents)
    .where(
      and(
        eq(telemetryRawEvents.environmentId, environmentId),
        eq(telemetryRawEvents.trafficKind, "test"),
      ),
    );
  await db
    .delete(telemetryAggregates)
    .where(
      and(
        eq(telemetryAggregates.environmentId, environmentId),
        eq(telemetryAggregates.trafficKind, "test"),
      ),
    );
  await db
    .delete(telemetryAggregateSessions)
    .where(
      and(
        eq(telemetryAggregateSessions.environmentId, environmentId),
        eq(telemetryAggregateSessions.trafficKind, "test"),
      ),
    );
  await db.insert(activityEvents).values({
    workspaceId: context.workspaceId,
    projectId: settings.projectId,
    actorUserId: context.userId,
    type: TELEMETRY_ACTIVITY.testCleared,
    data: { environmentId },
  });
  return { ok: true };
}

export async function resolveAnalyticsBootstrap(options: {
  environmentId: string;
  workspaceId: string;
  environmentKind: string;
  isEnabled: boolean;
  allowedOrigins: string[];
  requestOrigin: string;
}): Promise<{
  enabled: boolean;
  mode?: TelemetryCollectionMode;
  samplingPercent?: number;
  excludedRoutes?: string[];
  privacyPolicyUrl?: string;
  organizationName?: string;
  testMode?: boolean;
  killSwitch?: boolean;
  hideBuiltInPrivacyLink?: boolean;
  schemaVersion: number;
}> {
  const platformKill = await isPlatformTelemetryKillSwitchOn();
  const settings = await getOrCreateTelemetrySettings(
    options.environmentId,
    options.workspaceId,
  );
  if (!settings || !options.isEnabled || platformKill) {
    return { enabled: false, killSwitch: platformKill, schemaVersion: 1 };
  }
  if (settings.collectionMode === "off" || settings.environmentKillSwitch) {
    return {
      enabled: false,
      killSwitch: settings.environmentKillSwitch || platformKill,
      schemaVersion: 1,
    };
  }

  const productionLike = options.environmentKind === "production";
  const testMode = settings.testModeEnabled && !productionLike;
  if (!productionLike && !testMode) {
    return { enabled: false, schemaVersion: 1 };
  }

  const originPool =
    settings.enabledOrigins.length > 0
      ? settings.enabledOrigins
      : options.allowedOrigins;
  if (!isOriginAllowed(options.requestOrigin, originPool)) {
    return { enabled: false, schemaVersion: 1 };
  }

  return {
    enabled: true,
    mode: settings.collectionMode,
    samplingPercent: settings.samplingPercent,
    excludedRoutes: settings.excludedRoutes,
    privacyPolicyUrl: settings.privacyPolicyUrl ?? undefined,
    organizationName: settings.organizationName ?? undefined,
    testMode,
    killSwitch: false,
    hideBuiltInPrivacyLink: settings.hideBuiltInPrivacyLink,
    schemaVersion: 1,
  };
}
