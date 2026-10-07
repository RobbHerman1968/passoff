import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  projectEnvironments,
  reviews,
  telemetryAggregates,
  telemetryAggregateSessions,
} from "@/db/schema";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createCredentialsUser } from "@/lib/auth/users";
import { ingestTelemetryBatch } from "@/lib/telemetry/ingest";
import { runTelemetryMaintenance } from "@/lib/telemetry/aggregate";
import { updateTelemetrySettings } from "@/lib/telemetry/settings";
import { createProject, createWebsiteReview } from "@/lib/projects/service";
import type { WorkspaceContext } from "@/lib/projects/context";
import { and } from "drizzle-orm";
import { workspaceMemberships, workspaces } from "@/db/schema";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

async function ownerContext(): Promise<WorkspaceContext> {
  const created = await createCredentialsUser({
    firstName: "Tele",
    lastName: "metry",
    email: uniqueEmail("tele"),
    password: "long-enough-password",
  });
  if (!created.ok) throw new Error("user");
  const workspace = await createOwnerWorkspace({
    userId: created.user.id,
    workspaceName: "Telemetry Studio",
  });
  if (!workspace.ok) throw new Error("workspace");
  const [membership] = await db
    .select({
      membershipId: workspaceMemberships.id,
      role: workspaceMemberships.role,
      workspaceSlug: workspaces.slug,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, created.user.id),
        eq(workspaceMemberships.workspaceId, workspace.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);
  return {
    membershipId: membership.membershipId,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    workspaceSlug: membership.workspaceSlug,
    role: membership.role,
    userId: created.user.id,
    userName: created.user.name ?? null,
    userEmail: created.user.email,
  };
}

describe("telemetry ingest", () => {
  afterEach(async () => {
    // Tables cascade from workspace cleanup in other tests; keep this isolated.
  });

  it("defaults to off and rejects disabled collection", async () => {
    const context = await ownerContext();
    const project = await createProject(context, "Tele Project");
    if (!project.ok) throw new Error("project");
    const review = await createWebsiteReview(context, {
      projectId: project.project.id,
      name: "Site",
      websiteUrl: "https://tele.example/start",
    });
    if (!review.ok) throw new Error("review");
    const [installation] = await db
      .select({
        id: projectEnvironments.id,
        publicKey: projectEnvironments.publicKey,
      })
      .from(projectEnvironments)
      .innerJoin(reviews, eq(reviews.environmentId, projectEnvironments.id))
      .where(eq(reviews.id, review.review.id));

    const batchId = crypto.randomUUID();
    const body = JSON.stringify({
      schemaVersion: 1,
      batchId,
      installationKey: installation.publicKey,
      events: [
        {
          schemaVersion: 1,
          eventId: crypto.randomUUID(),
          batchId,
          eventType: "page_view",
          occurredAt: new Date().toISOString(),
          route: "/pricing",
          deploymentVersion: "v1",
          viewportGroup: "desktop",
          sampling: { percent: 100, selected: true },
          tabSession: "ab".repeat(32),
          consentState: "granted",
        },
      ],
    });

    const off = await ingestTelemetryBatch({
      rawText: body,
      headerOrigin: "https://tele.example",
      userAgent: "Mozilla/5.0",
      rateLimitSubjects: ["test-off"],
    });
    expect(off.ok).toBe(true);
    if (off.ok) expect(off.accepted).toBe(0);

    await db
      .update(projectEnvironments)
      .set({ kind: "production" })
      .where(eq(projectEnvironments.id, installation.id));

    const saved = await updateTelemetrySettings(
      context,
      installation.id,
      {
        collectionMode: "strict_consent",
        enabledOriginsText: "https://tele.example",
        excludedRoutesText: "",
        samplingPercent: 100,
        rawRetentionHours: 72,
        aggregateRetentionDays: 90,
        organizationName: "",
        privacyPolicyUrl: "",
        version: 1,
      },
    );
    expect(saved.ok).toBe(true);

    const onBody = {
      ...JSON.parse(body),
      batchId: crypto.randomUUID(),
      events: [
        {
          ...JSON.parse(body).events[0],
          eventId: crypto.randomUUID(),
        },
      ],
    };
    onBody.events[0].batchId = onBody.batchId;
    const on = await ingestTelemetryBatch({
      rawText: JSON.stringify(onBody),
      headerOrigin: "https://tele.example",
      userAgent: "Mozilla/5.0",
      rateLimitSubjects: ["test-on"],
    });
    expect(on.ok).toBe(true);
    if (on.ok) expect(on.accepted).toBe(1);

    const secondBatch = {
      ...onBody,
      batchId: crypto.randomUUID(),
      events: [
        {
          ...onBody.events[0],
          eventId: crypto.randomUUID(),
        },
      ],
    };
    secondBatch.events[0].batchId = secondBatch.batchId;
    const second = await ingestTelemetryBatch({
      rawText: JSON.stringify(secondBatch),
      headerOrigin: "https://tele.example",
      userAgent: "Mozilla/5.0",
      rateLimitSubjects: ["test-second"],
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.accepted).toBe(1);

    await Promise.all([runTelemetryMaintenance(), runTelemetryMaintenance()]);
    const [aggregate] = await db
      .select({ events: sql<number>`sum(${telemetryAggregates.eventCount})`.mapWith(Number) })
      .from(telemetryAggregates)
      .where(eq(telemetryAggregates.environmentId, installation.id));
    const [sessions] = await db
      .select({
        count:
          sql<number>`count(distinct ${telemetryAggregateSessions.tabSessionHash})`.mapWith(
            Number,
          ),
      })
      .from(telemetryAggregateSessions)
      .where(eq(telemetryAggregateSessions.environmentId, installation.id));
    expect(aggregate.events).toBe(2);
    expect(sessions.count).toBe(1);
  });
});
