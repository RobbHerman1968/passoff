import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import {
  accounts,
  passwordResetTokens,
  sessions,
  workspaceMemberships,
  workspaces,
  users,
} from "@/db/schema";
import { sanitizeCallbackUrl } from "@/lib/auth/callback-url";
import {
  inspectResetToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from "@/lib/auth/password-reset";
import {
  clearAuthRateLimit,
  enforceAuthRateLimit,
  seedAuthRateLimit,
} from "@/lib/auth/rate-limit";
import { createOwnerWorkspace } from "@/lib/auth/workspace";
import { createPasswordResetToken, hashToken } from "@/lib/auth/tokens";
import {
  authenticateWithPassword,
  createCredentialsUser,
} from "@/lib/auth/users";
import { setEmailTransportForTests } from "@/lib/email";
import { getTestEmailTransport } from "@/lib/email/test-transport";

const uniqueEmail = (label: string) =>
  `${label}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

describe("auth flows", () => {
  beforeAll(() => {
    setEmailTransportForTests(getTestEmailTransport());
    process.env.EMAIL_TRANSPORT = "test";
  });

  it("creates credentials users with normalized unique emails", async () => {
    const email = uniqueEmail("Signup");
    const created = await createCredentialsUser({
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      password: "long-enough-password",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.user.email).toBe(email.toLowerCase());
    expect(JSON.stringify(created.user)).not.toMatch(/password/i);
    expect(JSON.stringify(created.user)).not.toContain("$argon2");

    const duplicate = await createCredentialsUser({
      firstName: "Ada",
      lastName: "Lovelace",
      email: email.toUpperCase(),
      password: "long-enough-password",
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.reason).toBe("duplicate");
    }
  });

  it("authenticates credentials and fails generically", async () => {
    const email = uniqueEmail("signin");
    await createCredentialsUser({
      firstName: "Grace",
      lastName: "Hopper",
      email,
      password: "long-enough-password",
    });

    const ok = await authenticateWithPassword(email, "long-enough-password");
    expect(ok?.email).toBe(email);
    expect(ok && "passwordHash" in ok).toBe(false);

    await expect(
      authenticateWithPassword(email, "wrong-password-here"),
    ).resolves.toBeNull();
    await expect(
      authenticateWithPassword(uniqueEmail("missing"), "long-enough-password"),
    ).resolves.toBeNull();
  });

  it("keeps Google and GitHub providers configured", () => {
    const ids = authConfig.providers.map(
      (provider) => (provider as { id: string }).id,
    );
    expect(ids).toEqual(expect.arrayContaining(["google", "github"]));
  });

  it("handles forgot-password without revealing account existence", async () => {
    const transport = getTestEmailTransport();
    transport.clear();

    const email = uniqueEmail("reset");
    await createCredentialsUser({
      firstName: "Reset",
      lastName: "User",
      email,
      password: "long-enough-password",
    });

    await requestPasswordReset(email);
    await requestPasswordReset(uniqueEmail("ghost"));

    expect(transport.messages).toHaveLength(1);
    expect(transport.messages[0]?.to).toBe(email);

    const [tokenRow] = await db
      .select()
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(eq(users.email, email))
      .limit(1);

    expect(tokenRow?.password_reset_tokens.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenRow?.password_reset_tokens.tokenHash).not.toContain("token=");
  });

  it("stores reset tokens as hashes and enforces expiry/single-use", async () => {
    const email = uniqueEmail("token");
    const created = await createCredentialsUser({
      firstName: "Token",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
    await db.insert(passwordResetTokens).values({
      userId: created.user.id,
      tokenHash,
      expiresAt,
    });

    expect(hashToken(rawToken)).toBe(tokenHash);
    await expect(inspectResetToken(rawToken)).resolves.toMatchObject({
      status: "valid",
    });

    const first = await resetPasswordWithToken({
      rawToken,
      password: "brand-new-password-1",
    });
    expect(first).toBe("success");

    const second = await resetPasswordWithToken({
      rawToken,
      password: "brand-new-password-2",
    });
    expect(second).toBe("used");

    await expect(
      authenticateWithPassword(email, "long-enough-password"),
    ).resolves.toBeNull();
    await expect(
      authenticateWithPassword(email, "brand-new-password-1"),
    ).resolves.toMatchObject({ email });
  });

  it("invalidates older reset tokens when a new request is made", async () => {
    const transport = getTestEmailTransport();
    transport.clear();
    const email = uniqueEmail("supersede");
    const created = await createCredentialsUser({
      firstName: "Supersede",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    await requestPasswordReset(email);
    const firstPath = transport.extractResetPath(email);
    expect(firstPath).toBeTruthy();
    const firstToken = firstPath!.split("token=")[1]!;

    transport.clear();
    await requestPasswordReset(email);
    const secondPath = transport.extractResetPath(email);
    const secondToken = secondPath!.split("token=")[1]!;
    expect(secondToken).not.toBe(firstToken);

    await expect(inspectResetToken(firstToken)).resolves.toMatchObject({
      status: "used",
    });
    await expect(inspectResetToken(secondToken)).resolves.toMatchObject({
      status: "valid",
    });
  });

  it("rejects concurrent use of the same reset token", async () => {
    const email = uniqueEmail("concurrent");
    const created = await createCredentialsUser({
      firstName: "Concurrent",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
    await db.insert(passwordResetTokens).values({
      userId: created.user.id,
      tokenHash,
      expiresAt,
    });

    const results = await Promise.all([
      resetPasswordWithToken({ rawToken, password: "concurrent-password-a" }),
      resetPasswordWithToken({ rawToken, password: "concurrent-password-b" }),
    ]);

    expect(results.filter((result) => result === "success")).toHaveLength(1);
    expect(results.some((result) => result === "used" || result === "success")).toBe(
      true,
    );
  });

  it("expires reset tokens", async () => {
    const email = uniqueEmail("expired");
    const created = await createCredentialsUser({
      firstName: "Expired",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    const { rawToken, tokenHash } = createPasswordResetToken();
    await db.insert(passwordResetTokens).values({
      userId: created.user.id,
      tokenHash,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(inspectResetToken(rawToken)).resolves.toMatchObject({
      status: "expired",
    });
    await expect(
      resetPasswordWithToken({ rawToken, password: "another-long-password" }),
    ).resolves.toBe("expired");
  });

  it("bumps session version and clears database sessions on password reset", async () => {
    const email = uniqueEmail("session");
    const created = await createCredentialsUser({
      firstName: "Session",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    await db.insert(sessions).values({
      sessionToken: `test-${created.user.id}`,
      userId: created.user.id,
      expires: new Date(Date.now() + 60_000),
    });

    const before = await db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, created.user.id));

    const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
    await db.insert(passwordResetTokens).values({
      userId: created.user.id,
      tokenHash,
      expiresAt,
    });

    await expect(
      resetPasswordWithToken({ rawToken, password: "session-reset-password" }),
    ).resolves.toBe("success");

    const after = await db
      .select({ sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, created.user.id));

    expect(after[0]!.sessionVersion).toBe(before[0]!.sessionVersion + 1);

    const remainingSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, created.user.id));
    expect(remainingSessions).toHaveLength(0);
  });

  it("does not email OAuth-only accounts for password reset", async () => {
    const transport = getTestEmailTransport();
    transport.clear();
    const email = uniqueEmail("oauth");

    const [user] = await db
      .insert(users)
      .values({
        name: "OAuth Only",
        firstName: "OAuth",
        lastName: "Only",
        email,
        passwordHash: null,
      })
      .returning();

    await db.insert(accounts).values({
      userId: user.id,
      type: "oauth",
      provider: "google",
      providerAccountId: `google-${user.id}`,
    });

    await requestPasswordReset(email);
    expect(transport.messages).toHaveLength(0);

    const oauthSignup = await createCredentialsUser({
      firstName: "OAuth",
      lastName: "Only",
      email,
      password: "long-enough-password",
    });
    expect(oauthSignup.ok).toBe(false);
    if (!oauthSignup.ok) {
      expect(oauthSignup.reason).toBe("oauth_only");
    }
  });

  it("denies deleted users", async () => {
    const email = uniqueEmail("deleted");
    const created = await createCredentialsUser({
      firstName: "Deleted",
      lastName: "User",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, created.user.id));

    await expect(
      authenticateWithPassword(email, "long-enough-password"),
    ).resolves.toBeNull();
  });

  it("creates an owner workspace once and recovers from duplicate onboarding", async () => {
    const email = uniqueEmail("team");
    const created = await createCredentialsUser({
      firstName: "Team",
      lastName: "Owner",
      email,
      password: "long-enough-password",
    });
    if (!created.ok) throw new Error("setup failed");

    const first = await createOwnerWorkspace({
      userId: created.user.id,
      workspaceName: "Acme Studio",
    });
    expect(first.ok).toBe(true);

    const second = await createOwnerWorkspace({
      userId: created.user.id,
      workspaceName: "Acme Studio 2",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("already_onboarded");
    }

    const memberships = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, created.user.id),
          eq(workspaceMemberships.role, "owner"),
          eq(workspaceMemberships.status, "active"),
        ),
      );
    expect(memberships).toHaveLength(1);

    const team = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, memberships[0]!.workspaceId));
    expect(team[0]?.name).toBe("Acme Studio");
  });

  it("enforces durable rate limiting", async () => {
    const subjects = [uniqueEmail("rate"), "fingerprint"];
    await clearAuthRateLimit("sign_up", subjects);
    await seedAuthRateLimit({
      scope: "sign_up",
      subjects,
      attemptCount: 5,
    });

    const blocked = await enforceAuthRateLimit({
      scope: "sign_up",
      subjects,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("sanitizes callback URLs for auth redirects", () => {
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("https://attacker.test")).toBe("/dashboard");
  });
});
