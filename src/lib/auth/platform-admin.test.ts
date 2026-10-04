import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import {
  platformAuditEvents,
  users,
  workspaceMemberships,
} from "@/db/schema";
import {
  grantPlatformAdmin,
  readEmailArgument,
  revokePlatformAdmin,
  PLATFORM_AUDIT_ACTION,
} from "@/lib/auth/platform-admin-provisioning";
import { createCredentialsUser } from "@/lib/auth/users";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { getActiveMembership } from "@/lib/auth/membership";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

vi.mock("@/auth", () => ({
  getValidSession: vi.fn(),
}));

import { getValidSession } from "@/auth";
import {
  getStoredPlatformRole,
  isPlatformAdmin,
  requirePlatformAdmin,
} from "@/lib/auth/platform-admin";

const mockedGetValidSession = vi.mocked(getValidSession);

describe("platform administrator provisioning", () => {
  it("defaults new users to platform role user", async () => {
    const email = uniqueEmail("default-role");
    const created = await createCredentialsUser({
      firstName: "Ordinary",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const [row] = await db
      .select({ platformRole: users.platformRole })
      .from(users)
      .where(eq(users.id, created.user.id))
      .limit(1);

    expect(row?.platformRole).toBe("user");
  });

  it("keeps existing users as ordinary users after the role column is present", async () => {
    const email = uniqueEmail("existing-user");
    const created = await createCredentialsUser({
      firstName: "Existing",
      lastName: "Member",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const role = await getStoredPlatformRole(created.user.id);
    expect(role).toBe("user");
  });

  it("grants by exact email and is idempotent", async () => {
    const email = uniqueEmail("grant-exact");
    const created = await createCredentialsUser({
      firstName: "Grant",
      lastName: "Exact",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const first = await grantPlatformAdmin(db, email);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.changed).toBe(true);
    expect(first.platformRole).toBe("admin");

    const second = await grantPlatformAdmin(db, email);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toBe(false);
    expect(second.platformRole).toBe("admin");

    const audits = await db
      .select({ action: platformAuditEvents.action })
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetUserId, created.user.id));

    expect(audits.filter((row) => row.action === PLATFORM_AUDIT_ACTION.grantAdmin)).toHaveLength(
      1,
    );
  });

  it("grants using normalized email casing and whitespace", async () => {
    const local = uniqueEmail("Grant.Normalized");
    const created = await createCredentialsUser({
      firstName: "Norm",
      lastName: "Email",
      email: local,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mixed = `  ${local.toUpperCase()}  `;
    const result = await grantPlatformAdmin(db, mixed);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.platformRole).toBe("admin");
    expect(result.email).toBe(local.toLowerCase());
  });

  it("fails safely for an unknown user and never matches a partial email", async () => {
    const email = uniqueEmail("partial-target");
    const created = await createCredentialsUser({
      firstName: "Partial",
      lastName: "Target",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const missing = await grantPlatformAdmin(db, uniqueEmail("missing-user"));
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason).toBe("not_found");
    expect(missing.message).not.toMatch(/password|token|hash|DATABASE/i);

    const localPart = email.split("@")[0]!;
    const partial = await grantPlatformAdmin(db, localPart);
    expect(partial.ok).toBe(false);
    if (partial.ok) return;
    expect(partial.reason).toBe("not_found");

    const stillUser = await getStoredPlatformRole(created.user.id);
    expect(stillUser).toBe("user");
  });

  it("revokes administrator access", async () => {
    const email = uniqueEmail("revoke-admin");
    const created = await createCredentialsUser({
      firstName: "Revoke",
      lastName: "Admin",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await grantPlatformAdmin(db, email);
    const revoked = await revokePlatformAdmin(db, email);
    expect(revoked.ok).toBe(true);
    if (!revoked.ok) return;
    expect(revoked.changed).toBe(true);
    expect(revoked.platformRole).toBe("user");

    const role = await getStoredPlatformRole(created.user.id);
    expect(role).toBe("user");

    const audits = await db
      .select({ action: platformAuditEvents.action })
      .from(platformAuditEvents)
      .where(
        and(
          eq(platformAuditEvents.targetUserId, created.user.id),
          eq(platformAuditEvents.action, PLATFORM_AUDIT_ACTION.revokeAdmin),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("reads --email arguments without partial matching helpers", () => {
    expect(readEmailArgument(["--email", "  Ada@Example.COM "])).toBe(
      "ada@example.com",
    );
    expect(readEmailArgument(["--email=Rob@Example.com"])).toBe("rob@example.com");
    expect(() => readEmailArgument([])).toThrow(/--email/);
  });
});

describe("platform administrator authorization", () => {
  beforeEach(() => {
    mockedGetValidSession.mockReset();
  });

  it("rejects unauthenticated access", async () => {
    mockedGetValidSession.mockResolvedValue(null);
    await expect(isPlatformAdmin()).resolves.toBe(false);
    await expect(requirePlatformAdmin()).resolves.toEqual({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("denies ordinary users and ignores browser-supplied role claims", async () => {
    const email = uniqueEmail("ordinary-auth");
    const created = await createCredentialsUser({
      firstName: "Ordinary",
      lastName: "Auth",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    mockedGetValidSession.mockResolvedValue({
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        platformRole: "admin",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(isPlatformAdmin()).resolves.toBe(false);
    await expect(requirePlatformAdmin()).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("denies workspace owners without a platform admin role", async () => {
    const email = uniqueEmail("owner-not-admin");
    const created = await createCredentialsUser({
      firstName: "Owner",
      lastName: "Only",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const workspace = await createOwnerWorkspace({
      userId: created.user.id,
      workspaceName: `Owner Workspace ${Date.now()}`,
    });
    expect(workspace.ok).toBe(true);

    mockedGetValidSession.mockResolvedValue({
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(requirePlatformAdmin()).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("allows current platform administrators and rejects session email alone", async () => {
    const email = uniqueEmail("real-admin");
    const created = await createCredentialsUser({
      firstName: "Real",
      lastName: "Admin",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await grantPlatformAdmin(db, email);

    mockedGetValidSession.mockResolvedValue({
      user: {
        id: "00000000-0000-4000-8000-000000000099",
        email: created.user.email,
        name: "Impersonated",
        platformRole: "admin",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    await expect(requirePlatformAdmin()).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });

    mockedGetValidSession.mockResolvedValue({
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        platformRole: "user",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    const allowed = await requirePlatformAdmin();
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.admin).toEqual({
      userId: created.user.id,
      email: created.user.email,
      name: created.user.name,
      platformRole: "admin",
    });
    expect(JSON.stringify(allowed.admin)).not.toMatch(/password|hash|token/i);
  });

  it("takes role changes into effect without a stale authorization result", async () => {
    const email = uniqueEmail("stale-role");
    const created = await createCredentialsUser({
      firstName: "Stale",
      lastName: "Role",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    mockedGetValidSession.mockResolvedValue({
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        platformRole: "user",
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(isPlatformAdmin()).resolves.toBe(false);

    await grantPlatformAdmin(db, email);
    await expect(isPlatformAdmin()).resolves.toBe(true);

    await revokePlatformAdmin(db, email);
    await expect(isPlatformAdmin()).resolves.toBe(false);
    await expect(requirePlatformAdmin()).resolves.toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("does not automatically grant cross-workspace access", async () => {
    const adminEmail = uniqueEmail("cross-admin");
    const otherEmail = uniqueEmail("cross-other");

    const adminUser = await createCredentialsUser({
      firstName: "Cross",
      lastName: "Admin",
      email: adminEmail,
      password: "long-enough-password",
    });
    const otherUser = await createCredentialsUser({
      firstName: "Cross",
      lastName: "Other",
      email: otherEmail,
      password: "long-enough-password",
    });
    expect(adminUser.ok && otherUser.ok).toBe(true);
    if (!adminUser.ok || !otherUser.ok) return;

    await grantPlatformAdmin(db, adminEmail);
    const otherWorkspace = await createOwnerWorkspace({
      userId: otherUser.user.id,
      workspaceName: `Other Workspace ${Date.now()}`,
    });
    expect(otherWorkspace.ok).toBe(true);
    if (!otherWorkspace.ok) return;

    const adminMembership = await getActiveMembership(adminUser.user.id);
    expect(adminMembership).toBeNull();

    const foreignMembership = await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, adminUser.user.id),
          eq(workspaceMemberships.workspaceId, otherWorkspace.workspaceId),
        ),
      )
      .limit(1);

    expect(foreignMembership).toHaveLength(0);
  });

  it("treats /admin as a protected route for unauthenticated visitors", () => {
    const authorized = authConfig.callbacks?.authorized;
    expect(authorized).toBeTypeOf("function");
    if (typeof authorized !== "function") return;

    const deny = authorized({
      auth: null,
      request: { nextUrl: { pathname: "/admin" } },
    } as never);
    expect(deny).toBe(false);

    const allow = authorized({
      auth: { user: { id: "user-1" } },
      request: { nextUrl: { pathname: "/admin" } },
    } as never);
    expect(allow).toBe(true);
  });
});
