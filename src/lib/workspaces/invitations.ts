import "server-only";

import { randomBytes } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  users,
  workspaceInvitations,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { normalizeEmail } from "@/lib/auth/email";
import { enforceAuthRateLimit, formatRetryGuidance } from "@/lib/auth/rate-limit";
import { hashToken } from "@/lib/auth/tokens";
import { notifyUsageThresholds } from "@/lib/billing/usage-notices";
import { sendWorkspaceInvitationEmail } from "@/lib/email";
import { personDisplayName } from "@/lib/users/display-name";
import { absoluteUrl } from "@/lib/site";
import { WORKSPACE_ACTIVITY_TYPES, recordWorkspaceActivity } from "@/lib/workspaces/audit";
import {
  capacityBlockedMessage,
  getMemberCapacity,
} from "@/lib/workspaces/capacity";
import {
  loadCallerRole,
  lockWorkspace,
  type Transaction,
} from "@/lib/workspaces/members";
import { notifyMemberJoined } from "@/lib/workspaces/notify";
import { can } from "@/lib/workspaces/permissions";
import {
  INVITATION_MAX_SENDS,
  INVITATION_MIN_RESEND_INTERVAL_MS,
  INVITATION_TTL_DAYS,
  inviteEmailSchema,
  maskEmail,
} from "@/lib/workspaces/schemas";
import type { WorkspaceContext } from "@/lib/workspaces/context";

const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;

export type InvitationStatus = "pending" | "expired";

export type InvitationSummary = {
  id: string;
  email: string;
  status: InvitationStatus;
  invitedByName: string | null;
  createdAt: Date;
  lastSentAt: Date;
  expiresAt: Date;
  sendCount: number;
};

export type InvitationFailure =
  | "forbidden"
  | "invalid_email"
  | "already_member"
  | "already_invited"
  | "at_capacity"
  | "rate_limited"
  | "too_soon"
  | "too_many_sends"
  | "not_found"
  | "already_accepted"
  | "unavailable";

type InvitationError = {
  ok: false;
  error: InvitationFailure;
  message: string;
  retryAfterSeconds?: number;
};

export type InvitationResult<T extends object = object> =
  | ({ ok: true } & T)
  | InvitationError;

export const INVITATION_MESSAGES = {
  forbidden: "Only a workspace owner can invite people.",
  invalidEmail: "Enter a valid email address.",
  notFound: "We couldn’t find that invitation. It may have been accepted or cancelled already.",
  unavailable: "We couldn’t finish that. Check your connection and try again.",
  emailNotSent:
    "The invitation is saved, but we couldn’t send the email. Use “Resend invitation” to try again.",
} as const;

function newToken() {
  const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function invitationUrl(rawToken: string): string {
  return absoluteUrl(`/invite/${encodeURIComponent(rawToken)}`);
}

async function sendInvitation(input: {
  email: string;
  workspaceName: string;
  inviterName: string;
  rawToken: string;
}): Promise<boolean> {
  try {
    await sendWorkspaceInvitationEmail({
      to: input.email,
      workspaceName: input.workspaceName,
      inviterName: input.inviterName,
      acceptUrl: invitationUrl(input.rawToken),
      expiresInDays: INVITATION_TTL_DAYS,
    });
    return true;
  } catch {
    return false;
  }
}

async function limitInviteRate(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  return enforceAuthRateLimit({
    scope: "workspace_invite",
    subjects: [workspaceId],
  });
}

function rateLimited(retryAfterSeconds: number): InvitationError {
  return {
    ok: false,
    error: "rate_limited",
    message: `You’ve sent a lot of invitations. ${formatRetryGuidance(retryAfterSeconds)}`,
    retryAfterSeconds,
  };
}

export async function listInvitations(
  context: WorkspaceContext,
  now: Date = new Date(),
): Promise<InvitationResult<{ invitations: InvitationSummary[] }>> {
  if (!can(context, "members.view")) {
    return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
  }

  const rows = await db
    .select({
      id: workspaceInvitations.id,
      email: workspaceInvitations.email,
      createdAt: workspaceInvitations.createdAt,
      lastSentAt: workspaceInvitations.lastSentAt,
      expiresAt: workspaceInvitations.expiresAt,
      sendCount: workspaceInvitations.sendCount,
      inviterName: users.name,
      inviterEmail: users.email,
    })
    .from(workspaceInvitations)
    .leftJoin(users, eq(users.id, workspaceInvitations.invitedByUserId))
    .where(
      and(
        eq(workspaceInvitations.workspaceId, context.workspaceId),
        isNull(workspaceInvitations.acceptedAt),
        isNull(workspaceInvitations.revokedAt),
      ),
    )
    .orderBy(desc(workspaceInvitations.createdAt));

  return {
    ok: true,
    invitations: rows.map((row) => ({
      id: row.id,
      email: row.email,
      status: row.expiresAt > now ? ("pending" as const) : ("expired" as const),
      invitedByName: row.inviterEmail
        ? personDisplayName(row.inviterName, row.inviterEmail)
        : null,
      createdAt: row.createdAt,
      lastSentAt: row.lastSentAt,
      expiresAt: row.expiresAt,
      sendCount: row.sendCount,
    })),
  };
}

export async function inviteMember(
  context: WorkspaceContext,
  input: { email: string },
  now: Date = new Date(),
): Promise<InvitationResult<{ invitation: InvitationSummary; emailSent: boolean }>> {
  if (!can(context, "members.invite")) {
    return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
  }

  const parsed = inviteEmailSchema.safeParse(input.email);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_email",
      message: parsed.error.issues[0]?.message ?? INVITATION_MESSAGES.invalidEmail,
    };
  }
  const email = parsed.data;

  try {
    const rate = await limitInviteRate(context.workspaceId);
    if (!rate.ok) return rateLimited(rate.retryAfterSeconds);

    const created = await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) {
        return { kind: "not_found" as const };
      }
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "members.invite")) {
        return { kind: "forbidden" as const };
      }

      const [existingMember] = await tx
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .innerJoin(users, eq(users.id, workspaceMemberships.userId))
        .where(
          and(
            eq(workspaceMemberships.workspaceId, context.workspaceId),
            eq(workspaceMemberships.status, "active"),
            isNull(users.deletedAt),
            sql`lower(${users.email}) = ${email}`,
          ),
        )
        .limit(1);
      if (existingMember) return { kind: "already_member" as const };

      const [open] = await tx
        .select({
          id: workspaceInvitations.id,
          expiresAt: workspaceInvitations.expiresAt,
        })
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.workspaceId, context.workspaceId),
            eq(workspaceInvitations.email, email),
            isNull(workspaceInvitations.acceptedAt),
            isNull(workspaceInvitations.revokedAt),
          ),
        )
        .limit(1);

      if (open && open.expiresAt > now) {
        return { kind: "already_invited" as const };
      }
      if (open) {
        // An expired invitation is replaced by the new one.
        await tx
          .update(workspaceInvitations)
          .set({ revokedAt: now })
          .where(eq(workspaceInvitations.id, open.id));
      }

      const capacity = await getMemberCapacity(context.workspaceId, tx, now);
      if (capacity.atCapacity) {
        return { kind: "at_capacity" as const, capacity };
      }

      const { rawToken, tokenHash } = newToken();
      const [row] = await tx
        .insert(workspaceInvitations)
        .values({
          workspaceId: context.workspaceId,
          email,
          // People are only ever invited as members. Ownership moves by transfer.
          role: "member",
          tokenHash,
          invitedByUserId: context.userId,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
          lastSentAt: now,
          sendCount: 1,
        })
        .returning({
          id: workspaceInvitations.id,
          createdAt: workspaceInvitations.createdAt,
          lastSentAt: workspaceInvitations.lastSentAt,
          expiresAt: workspaceInvitations.expiresAt,
          sendCount: workspaceInvitations.sendCount,
        });

      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.INVITATION_SENT,
        data: { invitationId: row.id, email },
      });
      return { kind: "created" as const, row, rawToken, workspaceName: workspace.name };
    });

    switch (created.kind) {
      case "not_found":
        return { ok: false, error: "not_found", message: INVITATION_MESSAGES.notFound };
      case "forbidden":
        return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
      case "already_member":
        return {
          ok: false,
          error: "already_member",
          message: `${email} is already in this workspace.`,
        };
      case "already_invited":
        return {
          ok: false,
          error: "already_invited",
          message: `${email} already has an open invitation. Use “Resend invitation” if they can’t find it.`,
        };
      case "at_capacity":
        return {
          ok: false,
          error: "at_capacity",
          message: capacityBlockedMessage(created.capacity),
        };
    }

    const emailSent = await sendInvitation({
      email,
      workspaceName: created.workspaceName,
      inviterName: personDisplayName(context.userName, context.userEmail),
      rawToken: created.rawToken,
    });

    // A heads-up for the owner when seats are nearly or fully used. Never blocks the invitation.
    await notifyUsageThresholds(context.workspaceId, ["members"]).catch(() => undefined);

    return {
      ok: true,
      emailSent,
      invitation: {
        id: created.row.id,
        email,
        status: "pending",
        invitedByName: personDisplayName(context.userName, context.userEmail),
        createdAt: created.row.createdAt,
        lastSentAt: created.row.lastSentAt,
        expiresAt: created.row.expiresAt,
        sendCount: created.row.sendCount,
      },
    };
  } catch (error) {
    // The unique index is the last line of defence against a duplicate open invitation.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "already_invited",
        message: `${email} already has an open invitation. Use “Resend invitation” if they can’t find it.`,
      };
    }
    return { ok: false, error: "unavailable", message: INVITATION_MESSAGES.unavailable };
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string; cause?: { code?: string } }).code ??
    (error as { cause?: { code?: string } }).cause?.code;
  return code === "23505";
}

/** Sends a fresh link. The earlier link stops working the moment this succeeds. */
export async function resendInvitation(
  context: WorkspaceContext,
  input: { invitationId: string },
  now: Date = new Date(),
): Promise<InvitationResult<{ emailSent: boolean; email: string }>> {
  if (!can(context, "invitations.manage")) {
    return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
  }

  try {
    const rate = await limitInviteRate(context.workspaceId);
    if (!rate.ok) return rateLimited(rate.retryAfterSeconds);

    const outcome = await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) return { kind: "not_found" as const };
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "invitations.manage")) {
        return { kind: "forbidden" as const };
      }

      const [invitation] = await tx
        .select()
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.id, input.invitationId),
            eq(workspaceInvitations.workspaceId, context.workspaceId),
          ),
        )
        .limit(1)
        .for("update");
      if (!invitation || invitation.revokedAt) return { kind: "not_found" as const };
      if (invitation.acceptedAt) return { kind: "already_accepted" as const };

      const sinceLast = now.getTime() - invitation.lastSentAt.getTime();
      if (sinceLast < INVITATION_MIN_RESEND_INTERVAL_MS) {
        return {
          kind: "too_soon" as const,
          retryAfterSeconds: Math.ceil(
            (INVITATION_MIN_RESEND_INTERVAL_MS - sinceLast) / 1000,
          ),
        };
      }
      if (invitation.sendCount >= INVITATION_MAX_SENDS) {
        return { kind: "too_many_sends" as const };
      }

      if (invitation.expiresAt <= now) {
        // An expired invitation gave up its seat. Taking it back must still fit the plan.
        const capacity = await getMemberCapacity(context.workspaceId, tx, now);
        if (capacity.atCapacity) return { kind: "at_capacity" as const, capacity };
      }

      const { rawToken, tokenHash } = newToken();
      await tx
        .update(workspaceInvitations)
        .set({
          tokenHash,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
          lastSentAt: now,
          sendCount: sql`${workspaceInvitations.sendCount} + 1`,
        })
        .where(eq(workspaceInvitations.id, invitation.id));

      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.INVITATION_RESENT,
        data: { invitationId: invitation.id, email: invitation.email },
      });
      return {
        kind: "sent" as const,
        email: invitation.email,
        rawToken,
        workspaceName: workspace.name,
      };
    });

    switch (outcome.kind) {
      case "not_found":
        return { ok: false, error: "not_found", message: INVITATION_MESSAGES.notFound };
      case "forbidden":
        return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
      case "already_accepted":
        return {
          ok: false,
          error: "already_accepted",
          message: "This person already joined the workspace.",
        };
      case "too_soon":
        return {
          ok: false,
          error: "too_soon",
          message: `We just sent this invitation. ${formatRetryGuidance(outcome.retryAfterSeconds)}`,
          retryAfterSeconds: outcome.retryAfterSeconds,
        };
      case "too_many_sends":
        return {
          ok: false,
          error: "too_many_sends",
          message:
            "This invitation has been sent several times already. Cancel it and invite them again, or ask them to check their spam folder.",
        };
      case "at_capacity":
        return {
          ok: false,
          error: "at_capacity",
          message: capacityBlockedMessage(outcome.capacity),
        };
    }

    const emailSent = await sendInvitation({
      email: outcome.email,
      workspaceName: outcome.workspaceName,
      inviterName: personDisplayName(context.userName, context.userEmail),
      rawToken: outcome.rawToken,
    });
    return { ok: true, emailSent, email: outcome.email };
  } catch {
    return { ok: false, error: "unavailable", message: INVITATION_MESSAGES.unavailable };
  }
}

/** Cancels an open invitation. Cancelling twice is fine. */
export async function revokeInvitation(
  context: WorkspaceContext,
  input: { invitationId: string },
  now: Date = new Date(),
): Promise<InvitationResult<{ email: string }>> {
  if (!can(context, "invitations.manage")) {
    return { ok: false, error: "forbidden", message: INVITATION_MESSAGES.forbidden };
  }

  try {
    return await db.transaction(async (tx) => {
      const workspace = await lockWorkspace(tx, context.workspaceId);
      if (!workspace) {
        return { ok: false as const, error: "not_found" as const, message: INVITATION_MESSAGES.notFound };
      }
      const callerRole = await loadCallerRole(tx, context);
      if (!can({ role: callerRole }, "invitations.manage")) {
        return { ok: false as const, error: "forbidden" as const, message: INVITATION_MESSAGES.forbidden };
      }

      const [invitation] = await tx
        .select()
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.id, input.invitationId),
            eq(workspaceInvitations.workspaceId, context.workspaceId),
          ),
        )
        .limit(1)
        .for("update");
      if (!invitation) {
        return { ok: false as const, error: "not_found" as const, message: INVITATION_MESSAGES.notFound };
      }
      if (invitation.acceptedAt) {
        return {
          ok: false as const,
          error: "already_accepted" as const,
          message: "This person already joined the workspace.",
        };
      }
      if (invitation.revokedAt) {
        return { ok: true as const, email: invitation.email };
      }

      await tx
        .update(workspaceInvitations)
        .set({ revokedAt: now })
        .where(eq(workspaceInvitations.id, invitation.id));
      await recordWorkspaceActivity(tx, {
        workspaceId: context.workspaceId,
        actorUserId: context.userId,
        type: WORKSPACE_ACTIVITY_TYPES.INVITATION_REVOKED,
        data: { invitationId: invitation.id, email: invitation.email },
      });
      return { ok: true as const, email: invitation.email };
    });
  } catch {
    return { ok: false, error: "unavailable", message: INVITATION_MESSAGES.unavailable };
  }
}

export type InvitationView =
  | { status: "invalid" }
  | { status: "revoked" }
  | { status: "accepted" }
  | {
      status: "expired";
      workspaceName: string;
      invitedEmailMasked: string;
    }
  | {
      status: "pending";
      workspaceName: string;
      inviterName: string | null;
      invitedEmailMasked: string;
      /** True when the signed-in person's email is not the invited address. */
      emailMismatch: boolean;
      alreadyMember: boolean;
    };

/**
 * What the invitation page shows. Unknown, malformed, and deleted-workspace links all look
 * the same ("invalid") so the page never confirms that a workspace exists.
 */
export async function inspectInvitation(
  rawToken: string,
  viewer: { userId: string; email: string } | null,
  now: Date = new Date(),
): Promise<InvitationView> {
  if (!rawToken || rawToken.length > 200) return { status: "invalid" };

  const [row] = await db
    .select({
      id: workspaceInvitations.id,
      workspaceId: workspaceInvitations.workspaceId,
      email: workspaceInvitations.email,
      expiresAt: workspaceInvitations.expiresAt,
      acceptedAt: workspaceInvitations.acceptedAt,
      revokedAt: workspaceInvitations.revokedAt,
      workspaceName: workspaces.name,
      workspaceDeletedAt: workspaces.deletedAt,
      inviterName: users.name,
      inviterEmail: users.email,
    })
    .from(workspaceInvitations)
    .innerJoin(workspaces, eq(workspaces.id, workspaceInvitations.workspaceId))
    .leftJoin(users, eq(users.id, workspaceInvitations.invitedByUserId))
    .where(eq(workspaceInvitations.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row || row.workspaceDeletedAt) return { status: "invalid" };
  if (row.revokedAt) return { status: "revoked" };
  if (row.acceptedAt) return { status: "accepted" };
  const invitedEmailMasked = maskEmail(row.email);
  if (row.expiresAt <= now) {
    return { status: "expired", workspaceName: row.workspaceName, invitedEmailMasked };
  }

  let alreadyMember = false;
  if (viewer) {
    const [membership] = await db
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, row.workspaceId),
          eq(workspaceMemberships.userId, viewer.userId),
          eq(workspaceMemberships.status, "active"),
        ),
      )
      .limit(1);
    alreadyMember = Boolean(membership);
  }

  return {
    status: "pending",
    workspaceName: row.workspaceName,
    inviterName: row.inviterEmail
      ? personDisplayName(row.inviterName, row.inviterEmail)
      : null,
    invitedEmailMasked,
    emailMismatch: viewer ? normalizeEmail(viewer.email) !== row.email : false,
    alreadyMember,
  };
}

export type AcceptInvitationResult =
  | {
      ok: true;
      workspaceId: string;
      workspaceName: string;
      alreadyMember: boolean;
    }
  | {
      ok: false;
      error:
        | "invalid"
        | "revoked"
        | "expired"
        | "used"
        | "email_mismatch"
        | "at_capacity"
        | "unavailable";
      message: string;
      invitedEmailMasked?: string;
    };

/**
 * Joins the signed-in person to the workspace the invitation was written for.
 * Safe to repeat: a second accept of the same link by the same person just succeeds.
 */
export async function acceptInvitation(
  viewer: { userId: string },
  rawToken: string,
  now: Date = new Date(),
): Promise<AcceptInvitationResult> {
  const invalid: AcceptInvitationResult = {
    ok: false,
    error: "invalid",
    message: "This invitation link isn’t valid. Ask the workspace owner to send a new one.",
  };
  if (!rawToken || rawToken.length > 200) return invalid;

  try {
    const outcome = await db.transaction(async (tx): Promise<
      | AcceptInvitationResult
      | { ok: true; joined: true; workspaceId: string; workspaceName: string; memberName: string }
    > => {
      const [user] = await tx
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.id, viewer.userId), isNull(users.deletedAt)))
        .limit(1);
      if (!user) return invalid;

      const [invitation] = await tx
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.tokenHash, hashToken(rawToken)))
        .limit(1)
        .for("update");
      if (!invitation) return invalid;

      const workspace = await lockWorkspace(tx, invitation.workspaceId);
      if (!workspace) return invalid;

      const [existing] = await tx
        .select({ id: workspaceMemberships.id, status: workspaceMemberships.status })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, invitation.workspaceId),
            eq(workspaceMemberships.userId, user.id),
          ),
        )
        .limit(1);

      if (invitation.revokedAt) {
        return {
          ok: false,
          error: "revoked",
          message: "This invitation was cancelled. Ask the workspace owner to send a new one.",
        };
      }

      if (invitation.acceptedAt) {
        if (invitation.acceptedByUserId === user.id && existing?.status === "active") {
          return {
            ok: true,
            workspaceId: invitation.workspaceId,
            workspaceName: workspace.name,
            alreadyMember: true,
          };
        }
        return {
          ok: false,
          error: "used",
          message: "This invitation was already used. Ask the workspace owner to send a new one.",
        };
      }

      if (invitation.expiresAt <= now) {
        return {
          ok: false,
          error: "expired",
          message: "This invitation has expired. Ask the workspace owner to send a new one.",
          invitedEmailMasked: maskEmail(invitation.email),
        };
      }

      if (normalizeEmail(user.email) !== invitation.email) {
        return {
          ok: false,
          error: "email_mismatch",
          message: `This invitation was sent to ${maskEmail(invitation.email)}. Sign in with that address to join.`,
          invitedEmailMasked: maskEmail(invitation.email),
        };
      }

      if (existing?.status === "active") {
        await tx
          .update(workspaceInvitations)
          .set({ acceptedAt: now, acceptedByUserId: user.id })
          .where(eq(workspaceInvitations.id, invitation.id));
        return {
          ok: true,
          workspaceId: invitation.workspaceId,
          workspaceName: workspace.name,
          alreadyMember: true,
        };
      }

      // This invitation already holds a seat, so it is not counted against itself.
      const capacity = await getMemberCapacity(invitation.workspaceId, tx, now);
      if (capacity.seatsUsed - 1 >= capacity.limit) {
        return {
          ok: false,
          error: "at_capacity",
          message:
            "This workspace is full right now. Ask the workspace owner to make room, then try again.",
        };
      }

      if (existing) {
        await tx
          .update(workspaceMemberships)
          .set({ status: "active", role: "member", updatedAt: now })
          .where(eq(workspaceMemberships.id, existing.id));
      } else {
        await tx.insert(workspaceMemberships).values({
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: "member",
          status: "active",
        });
      }
      await tx
        .update(workspaceInvitations)
        .set({ acceptedAt: now, acceptedByUserId: user.id })
        .where(eq(workspaceInvitations.id, invitation.id));

      const memberName = personDisplayName(user.name, user.email);
      await recordWorkspaceActivity(tx as Transaction, {
        workspaceId: invitation.workspaceId,
        actorUserId: user.id,
        type: WORKSPACE_ACTIVITY_TYPES.MEMBER_JOINED,
        data: { memberUserId: user.id, memberName, invitationId: invitation.id },
      });
      return {
        ok: true,
        joined: true,
        workspaceId: invitation.workspaceId,
        workspaceName: workspace.name,
        memberName,
      };
    });

    if (outcome.ok && "joined" in outcome) {
      await notifyMemberJoined({
        workspaceId: outcome.workspaceId,
        workspaceName: outcome.workspaceName,
        memberUserId: viewer.userId,
        memberName: outcome.memberName,
      }).catch(() => undefined);
      return {
        ok: true,
        workspaceId: outcome.workspaceId,
        workspaceName: outcome.workspaceName,
        alreadyMember: false,
      };
    }
    return outcome as AcceptInvitationResult;
  } catch {
    return {
      ok: false,
      error: "unavailable",
      message: "We couldn’t add you to the workspace. Check your connection and try again.",
    };
  }
}
