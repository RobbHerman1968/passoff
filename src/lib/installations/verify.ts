import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { projectEnvironments } from "@/db/schema";
import { isOriginAllowed, normalizeOrigin } from "@/lib/installations/origin";
import { enforceInstallationRateLimit } from "@/lib/installations/rate-limit";
import { isPublicInstallationKey } from "@/lib/installations/snippet";

export const VERIFY_BODY_MAX_BYTES = 4_096;

export const installationVerifySchema = z
  .object({
    installationKey: z.string().trim().min(1).max(80),
    origin: z.string().trim().min(1).max(2_048),
    sdkVersion: z.string().trim().min(1).max(64),
    buildId: z.string().trim().max(256).optional(),
  })
  .strict();

export type InstallationVerifyBody = z.infer<typeof installationVerifySchema>;

export type VerifyInstallationResult =
  | {
      ok: true;
      status: "ready" | "disabled";
      matchedOrigin: string;
      corsOrigin: string;
    }
  | {
      ok: false;
      status: 400 | 403 | 404 | 429;
      retryAfterSeconds?: number;
      corsOrigin?: string;
    };

function genericReject(
  status: 400 | 403 | 404,
  corsOrigin?: string,
): VerifyInstallationResult {
  return { ok: false, status, corsOrigin };
}

export async function verifyWebsiteInstallation(options: {
  body: InstallationVerifyBody;
  headerOrigin: string | null;
  rateLimitSubjects: string[];
}): Promise<VerifyInstallationResult> {
  if (!isPublicInstallationKey(options.body.installationKey)) {
    return genericReject(404);
  }

  const bodyOrigin = normalizeOrigin(options.body.origin);
  if (!bodyOrigin.ok) {
    return genericReject(400);
  }

  if (options.headerOrigin) {
    const header = normalizeOrigin(options.headerOrigin);
    if (!header.ok || header.origin !== bodyOrigin.origin) {
      return genericReject(403);
    }
  }

  const rate = await enforceInstallationRateLimit({
    scope: "installation_verify",
    subjects: [
      options.body.installationKey,
      bodyOrigin.origin,
      ...options.rateLimitSubjects,
    ],
  });
  if (!rate.ok) {
    return {
      ok: false,
      status: 429,
      retryAfterSeconds: rate.retryAfterSeconds,
    };
  }

  const [installation] = await db
    .select({
      id: projectEnvironments.id,
      isEnabled: projectEnvironments.isEnabled,
      allowedOrigins: projectEnvironments.allowedOrigins,
      verifiedAt: projectEnvironments.verifiedAt,
    })
    .from(projectEnvironments)
    .where(eq(projectEnvironments.publicKey, options.body.installationKey))
    .limit(1);

  if (!installation) {
    return genericReject(404);
  }

  if (!isOriginAllowed(bodyOrigin.origin, installation.allowedOrigins)) {
    return genericReject(403);
  }

  const corsOrigin = bodyOrigin.origin;

  if (!installation.isEnabled) {
    return {
      ok: true,
      status: "disabled",
      matchedOrigin: corsOrigin,
      corsOrigin,
    };
  }

  const now = new Date();
  await db
    .update(projectEnvironments)
    .set({
      verifiedAt: installation.verifiedAt ?? now,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(projectEnvironments.id, installation.id),
        eq(projectEnvironments.publicKey, options.body.installationKey),
      ),
    );

  return {
    ok: true,
    status: "ready",
    matchedOrigin: corsOrigin,
    corsOrigin,
  };
}
