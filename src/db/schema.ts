import type { AdapterAccountType } from "@auth/core/adapters";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

const id = () => uuid("id").defaultRandom().primaryKey();

export const workspaceRole = pgEnum("workspace_role", ["owner", "member"]);
/** Platform-level role. Separate from workspace_role (owner/member). */
export const platformRole = pgEnum("platform_role", ["user", "admin"]);
export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
]);
export const projectStatus = pgEnum("project_status", ["active", "archived"]);
export const environmentKind = pgEnum("environment_kind", [
  "preview",
  "staging",
  "production",
  "custom",
]);
export const deploymentSource = pgEnum("deployment_source", [
  "host_supplied",
  "manual",
]);
export const reviewStatus = pgEnum("review_status", ["draft", "open", "closed"]);
export const issueStatus = pgEnum("issue_status", [
  "open",
  "in_progress",
  "ready_for_verification",
  "verified",
  "closed",
]);
export const issuePriority = pgEnum("issue_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);
export const issueClosureReason = pgEnum("issue_closure_reason", [
  "fixed",
  "not_planned",
  "duplicate",
  "cannot_reproduce",
  "no_longer_relevant",
]);
export const matchConfidence = pgEnum("match_confidence", [
  "unchecked",
  "exact",
  "likely",
  "ambiguous",
  "missing",
]);
export const assetKind = pgEnum("asset_kind", [
  "video_original",
  "video_playback",
  "video_poster",
  "comment_thumbnail",
  "screenshot",
  "attachment",
]);
export const assetStatus = pgEnum("asset_status", [
  "pending",
  "uploading",
  "processing",
  "ready",
  "needs_attention",
  "failed",
]);
export const screenshotCaptureKind = pgEnum("screenshot_capture_kind", [
  "browser_reconstruction",
  "worker_capture",
  "manual_attachment",
]);
export const evidenceKind = pgEnum("evidence_kind", [
  "screenshot",
  "video",
  "technical_context",
  "verification_capture",
]);
export const evidenceCaptureMethod = pgEnum("evidence_capture_method", [
  "browser_reconstruction",
  "worker_capture",
  "manual_attachment",
  "host_upload",
]);
export const evidenceCaptureStatus = pgEnum("evidence_capture_status", [
  "pending",
  "ready",
  "unavailable",
  "failed",
]);
export const verificationMethod = pgEnum("verification_method", [
  "human",
  "element_visibility",
  "bounding_box_overlap",
  "named_test_hook",
]);
export const verificationOutcome = pgEnum("verification_outcome", [
  "passed",
  "failed",
  "uncertain",
]);
export const approvalDecision = pgEnum("approval_decision", [
  "approved",
  "changes_requested",
]);
export const notificationFrequency = pgEnum("notification_frequency", [
  "immediate",
  "digest",
  "muted",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "processing",
  "delivered",
  "failed",
  "cancelled",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
]);

export type ConsentSettings = {
  version: number;
  captureScreenshots: boolean;
  captureConsoleErrors: boolean;
  captureNetworkFailures: boolean;
  privateSelectors: string[];
};

export const DEFAULT_CONSENT_SETTINGS: ConsentSettings = {
  version: 1,
  captureScreenshots: true,
  captureConsoleErrors: false,
  captureNetworkFailures: false,
  privateSelectors: [],
};

export const DEPLOYMENT_METADATA_MAX_BYTES = 8_192;

export type DeploymentMetadata = Record<string, unknown>;

// Auth.js adapter tables. Product authorization belongs to workspaceMemberships, not these tables.
// passwordHash is null for OAuth-only accounts. sessionVersion invalidates JWTs after password reset.
// platformRole is platform-wide (user|admin) and never inferred from workspace ownership.
export const users = pgTable(
  "users",
  {
    id: id(),
    // Auth.js display name. For credentials signup this is first + last.
    name: text("name"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    image: text("image"),
    passwordHash: text("password_hash"),
    platformRole: platformRole("platform_role").notNull().default("user"),
    sessionVersion: integer("session_version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    index("users_platform_admin_idx")
      .on(table.platformRole)
      .where(sql`${table.platformRole} = 'admin' AND ${table.deletedAt} IS NULL`),
  ],
);

/**
 * Platform-level audit trail (admin grant/revoke and future platform ops).
 * Separate from workspace-scoped activity_events.
 */
export const platformAuditEvents = pgTable(
  "platform_audit_events",
  {
    id: id(),
    action: text("action").notNull(),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetEmail: text("target_email").notNull(),
    actor: text("actor").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_audit_events_created_idx").on(table.createdAt),
    index("platform_audit_events_target_user_idx").on(table.targetUserId),
  ],
);

/**
 * Password-reset tokens are stored only as hashes.
 * Lifetime: 60 minutes. Single use. Superseded tokens are marked consumed when a newer request is created.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_active_idx").on(table.userId, table.consumedAt, table.expiresAt),
  ],
);

/**
 * Durable auth rate limits for Vercel Functions (no process memory).
 * Limits are documented in src/lib/auth/rate-limit.ts.
 */
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: id(),
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("auth_rate_limits_scope_subject_unique").on(table.scope, table.subjectHash),
    index("auth_rate_limits_blocked_until_idx").on(table.blockedUntil),
    check("auth_rate_limits_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })],
);

export const authenticators = pgTable(
  "authenticators",
  {
    credentialID: text("credential_id").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    credentialPublicKey: text("credential_public_key").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credential_device_type").notNull(),
    credentialBackedUp: boolean("credential_backed_up").notNull(),
    transports: text("transports"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.credentialID] }),
    index("authenticators_user_id_idx").on(table.userId),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("workspaces_slug_unique").on(table.slug)],
);

export const workspaceMemberships = pgTable(
  "workspace_memberships",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
    status: membershipStatus("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspace_memberships_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    index("workspace_memberships_user_status_idx").on(table.userId, table.status),
  ],
);

export const workspaceInvitations = pgTable(
  "workspace_invitations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: workspaceRole("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    index("workspace_invitations_workspace_email_idx").on(table.workspaceId, table.email),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: projectStatus("status").notNull().default("active"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("projects_id_workspace_unique").on(table.id, table.workspaceId),
    uniqueIndex("projects_workspace_slug_unique").on(table.workspaceId, table.slug),
    index("projects_workspace_status_updated_idx").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
    ),
  ],
);

export const projectEnvironments = pgTable(
  "project_environments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    kind: environmentKind("kind").notNull().default("custom"),
    baseUrl: text("base_url").notNull(),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    publicKey: text("public_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    hostReleaseId: text("host_release_id"),
    consentSettings: jsonb("consent_settings")
      .$type<ConsentSettings>()
      .notNull()
      .default(DEFAULT_CONSENT_SETTINGS),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("project_environments_id_scope_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
    ),
    uniqueIndex("project_environments_public_key_unique").on(table.publicKey),
    uniqueIndex("project_environments_project_name_unique").on(table.projectId, table.name),
    index("project_environments_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "project_environments_project_workspace_fk",
      columns: [table.projectId, table.workspaceId],
      foreignColumns: [projects.id, projects.workspaceId],
    }).onDelete("cascade"),
    check("project_environments_version_positive", sql`${table.version} > 0`),
  ],
);

export const deployments = pgTable(
  "deployments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    identifier: text("identifier").notNull(),
    displayLabel: text("display_label"),
    url: text("url"),
    source: deploymentSource("source").notNull(),
    metadata: jsonb("metadata").$type<DeploymentMetadata>().notNull().default({}),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("deployments_id_scope_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
      table.environmentId,
    ),
    uniqueIndex("deployments_environment_identifier_unique").on(
      table.environmentId,
      table.identifier,
    ),
    index("deployments_environment_recorded_idx").on(table.environmentId, table.recordedAt),
    foreignKey({
      name: "deployments_environment_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

export const pages = pgTable(
  "pages",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    normalizedRoute: text("normalized_route").notNull(),
    routeTemplate: text("route_template"),
    lastKnownTitle: text("last_known_title"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("pages_environment_route_unique").on(
      table.environmentId,
      table.normalizedRoute,
    ),
    index("pages_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "pages_environment_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    status: reviewStatus("status").notNull().default("draft"),
    feedbackDeadline: timestamp("feedback_deadline", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reviews_id_scope_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
      table.environmentId,
      table.deploymentId,
    ),
    index("reviews_project_status_updated_idx").on(table.projectId, table.status, table.updatedAt),
    index("reviews_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "reviews_deployment_scope_fk",
      columns: [
        table.deploymentId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
      ],
      foreignColumns: [
        deployments.id,
        deployments.workspaceId,
        deployments.projectId,
        deployments.environmentId,
      ],
    }).onDelete("restrict"),
    check("reviews_version_positive", sql`${table.version} > 0`),
    check(
      "reviews_open_requires_opened_at",
      sql`${table.status} = 'draft' or ${table.openedAt} is not null`,
    ),
    check(
      "reviews_closed_requires_closed_at",
      sql`${table.status} <> 'closed' or ${table.closedAt} is not null`,
    ),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    status: assetStatus("status").notNull().default("pending"),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    originalFileName: text("original_file_name"),
    mimeType: text("mime_type"),
    byteSize: bigint("byte_size", { mode: "number" }),
    checksum: text("checksum"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    failureReason: text("failure_reason"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assets_storage_object_unique").on(table.storageProvider, table.storageKey),
    index("assets_review_kind_status_idx").on(table.reviewId, table.kind, table.status),
    index("assets_workspace_created_idx").on(table.workspaceId, table.createdAt),
    check("assets_byte_size_nonnegative", sql`${table.byteSize} is null or ${table.byteSize} >= 0`),
  ],
);

/**
 * Historical review-round rows preserved from the superseded versioning model.
 * Active product code must not read or write this table.
 */
export const legacyReviewRounds = pgTable(
  "legacy_review_rounds",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id"),
    number: integer("number").notNull(),
    audience: text("audience").notNull(),
    status: text("status").notNull(),
    feedbackDeadline: timestamp("feedback_deadline", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    openedByUserId: uuid("opened_by_user_id"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [index("legacy_review_rounds_workspace_idx").on(table.workspaceId)],
);

/**
 * Standalone video-review rows that could not be mapped onto website environments.
 * Active product code must not treat these as current reviews.
 */
export const legacyVideoReviews = pgTable(
  "legacy_video_reviews",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    ownerUserId: uuid("owner_user_id"),
    name: text("name").notNull(),
    status: text("status").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id"),
    originalPayload: jsonb("original_payload").$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [index("legacy_video_reviews_workspace_idx").on(table.workspaceId)],
);

export const reviewIssueCounters = pgTable(
  "review_issue_counters",
  {
    reviewId: uuid("review_id")
      .primaryKey()
      .references(() => reviews.id, { onDelete: "cascade" }),
    nextIssueNumber: integer("next_issue_number").notNull().default(1),
  },
  (table) => [
    check("review_issue_counters_next_issue_positive", sql`${table.nextIssueNumber} > 0`),
  ],
);

export const guestIdentities = pgTable(
  "guest_identities",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    linkedUserId: uuid("linked_user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("guest_identities_workspace_email_unique").on(
      table.workspaceId,
      sql`lower(${table.email})`,
    ),
    index("guest_identities_linked_user_idx").on(table.linkedUserId),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    passwordHash: text("password_hash"),
    canComment: boolean("can_comment").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("share_links_token_hash_unique").on(table.tokenHash),
    index("share_links_review_active_idx").on(table.reviewId, table.revokedAt, table.expiresAt),
  ],
);

export const reviewSessions = pgTable(
  "review_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    guestIdentityId: uuid("guest_identity_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull(),
    /**
     * When set, SDK API calls must present a matching Origin header.
     * Cookie-based first-party guest sessions leave this null.
     */
    allowedOrigin: text("allowed_origin"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("review_sessions_token_hash_unique").on(table.tokenHash),
    index("review_sessions_review_guest_idx").on(table.reviewId, table.guestIdentityId),
    index("review_sessions_expiry_idx").on(table.expiresAt),
  ],
);

/**
 * One-time codes that hand a first-party share-link open over to a cross-origin SDK session.
 * Raw codes are never stored — only SHA-256 hashes.
 */
export const sdkExchangeCodes = pgTable(
  "sdk_exchange_codes",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    shareLinkId: uuid("share_link_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    guestIdentityId: uuid("guest_identity_id")
      .notNull()
      .references(() => guestIdentities.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => projectEnvironments.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sdk_exchange_codes_code_hash_unique").on(table.codeHash),
    index("sdk_exchange_codes_expiry_idx").on(table.expiresAt),
    index("sdk_exchange_codes_share_link_idx").on(table.shareLinkId),
  ],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    pageId: uuid("page_id"),
    number: integer("number").notNull(),
    body: text("body").notNull(),
    status: issueStatus("status").notNull().default("open"),
    priority: issuePriority("priority").notNull().default("normal"),
    closureReason: issueClosureReason("closure_reason"),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorGuestId: uuid("author_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("issues_review_number_unique").on(table.reviewId, table.number),
    uniqueIndex("issues_id_scope_unique").on(
      table.id,
      table.workspaceId,
      table.projectId,
      table.environmentId,
      table.deploymentId,
      table.reviewId,
    ),
    index("issues_review_status_updated_idx").on(table.reviewId, table.status, table.updatedAt),
    index("issues_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "issues_review_scope_fk",
      columns: [
        table.reviewId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
        table.deploymentId,
      ],
      foreignColumns: [
        reviews.id,
        reviews.workspaceId,
        reviews.projectId,
        reviews.environmentId,
        reviews.deploymentId,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "issues_page_fk",
      columns: [table.pageId],
      foreignColumns: [pages.id],
    }).onDelete("set null"),
    check("issues_number_positive", sql`${table.number} > 0`),
    check(
      "issues_has_one_author",
      sql`num_nonnulls(${table.authorUserId}, ${table.authorGuestId}) = 1`,
    ),
    check(
      "issues_closure_reason_matches_status",
      sql`(${table.status} = 'closed' and ${table.closureReason} is not null) or (${table.status} <> 'closed' and ${table.closureReason} is null)`,
    ),
    check(
      "issues_closed_requires_closed_at",
      sql`${table.status} <> 'closed' or ${table.closedAt} is not null`,
    ),
    check("issues_version_positive", sql`${table.version} > 0`),
  ],
);

/**
 * Idempotency keys for SDK (and future) issue creation retries.
 * Keys are scoped to a review so a retry cannot create a duplicate issue.
 */
export const issueIdempotencyKeys = pgTable(
  "issue_idempotency_keys",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    reviewSessionId: uuid("review_session_id").references(() => reviewSessions.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("issue_idempotency_keys_review_key_unique").on(
      table.reviewId,
      table.idempotencyKey,
    ),
    index("issue_idempotency_keys_issue_idx").on(table.issueId),
  ],
);

export const issueComments = pgTable(
  "issue_comments",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isPrivate: boolean("is_private").notNull().default(false),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    authorGuestId: uuid("author_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("issue_comments_issue_created_idx").on(table.issueId, table.createdAt),
    check(
      "issue_comments_has_one_author",
      sql`num_nonnulls(${table.authorUserId}, ${table.authorGuestId}) = 1`,
    ),
    check(
      "issue_comments_private_requires_user",
      sql`not ${table.isPrivate} or ${table.authorUserId} is not null`,
    ),
  ],
);

export const issueAnchors = pgTable(
  "issue_anchors",
  {
    issueId: uuid("issue_id")
      .primaryKey()
      .references(() => issues.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    pageUrl: text("page_url").notNull(),
    route: text("route"),
    pageTitle: text("page_title"),
    selectedText: text("selected_text"),
    stableElementId: text("stable_element_id"),
    approvedDataAttributes: jsonb("approved_data_attributes").$type<Record<string, string>>(),
    domFingerprint: text("dom_fingerprint"),
    cssSelector: text("css_selector"),
    normalizedX: numeric("normalized_x", { precision: 8, scale: 7 }),
    normalizedY: numeric("normalized_y", { precision: 8, scale: 7 }),
    documentX: integer("document_x"),
    documentY: integer("document_y"),
    elementBounds: jsonb("element_bounds").$type<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>(),
    viewportWidth: integer("viewport_width").notNull(),
    viewportHeight: integer("viewport_height").notNull(),
    browser: text("browser"),
    operatingSystem: text("operating_system"),
    devicePixelRatio: numeric("device_pixel_ratio", { precision: 6, scale: 3 }),
    applicationBuildId: text("application_build_id"),
    matchConfidence: matchConfidence("match_confidence").notNull().default("unchecked"),
    htmlExcerpt: text("html_excerpt"),
    computedStyles: jsonb("computed_styles").$type<Record<string, string>>(),
    consoleErrors: jsonb("console_errors").$type<Array<Record<string, unknown>>>(),
    failedRequests: jsonb("failed_requests").$type<Array<Record<string, unknown>>>(),
    hostSessionReference: text("host_session_reference"),
    screenshotAssetId: uuid("screenshot_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    screenshotCaptureKind: screenshotCaptureKind("screenshot_capture_kind"),
    screenshotUnavailableReason: text("screenshot_unavailable_reason"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("issue_anchors_page_url_idx").on(table.pageUrl),
    check(
      "issue_anchor_normalized_x_range",
      sql`${table.normalizedX} is null or (${table.normalizedX} >= 0 and ${table.normalizedX} <= 1)`,
    ),
    check(
      "issue_anchor_normalized_y_range",
      sql`${table.normalizedY} is null or (${table.normalizedY} >= 0 and ${table.normalizedY} <= 1)`,
    ),
  ],
);

export const issueEvidence = pgTable(
  "issue_evidence",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
    kind: evidenceKind("kind").notNull(),
    captureMethod: evidenceCaptureMethod("capture_method").notNull(),
    captureStatus: evidenceCaptureStatus("capture_status").notNull().default("pending"),
    sanitizedContext: jsonb("sanitized_context").$type<Record<string, unknown>>().notNull().default({}),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdByGuestId: uuid("created_by_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("issue_evidence_issue_idx").on(table.issueId),
    index("issue_evidence_workspace_idx").on(table.workspaceId),
    check(
      "issue_evidence_at_most_one_creator",
      sql`num_nonnulls(${table.createdByUserId}, ${table.createdByGuestId}) <= 1`,
    ),
  ],
);

export const videoAssets = pgTable(
  "video_assets",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id").references(() => issueEvidence.id, {
      onDelete: "set null",
    }),
    originalAssetId: uuid("original_asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    playbackAssetId: uuid("playback_asset_id").references(() => assets.id, {
      onDelete: "set null",
    }),
    posterAssetId: uuid("poster_asset_id").references(() => assets.id, { onDelete: "set null" }),
    durationMs: integer("duration_ms"),
    processingStatus: assetStatus("processing_status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    providerUploadId: text("provider_upload_id"),
    providerAssetId: text("provider_asset_id"),
    providerPlaybackId: text("provider_playback_id"),
    retentionEndsAt: timestamp("retention_ends_at", { withTimezone: true }),
    processingAttempt: integer("processing_attempt").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("video_assets_original_asset_unique").on(table.originalAssetId),
    uniqueIndex("video_assets_evidence_unique")
      .on(table.evidenceId)
      .where(sql`${table.evidenceId} is not null`),
    uniqueIndex("video_assets_provider_upload_unique")
      .on(table.providerUploadId)
      .where(sql`${table.providerUploadId} is not null`),
    uniqueIndex("video_assets_provider_asset_unique")
      .on(table.providerAssetId)
      .where(sql`${table.providerAssetId} is not null`),
    uniqueIndex("video_assets_provider_playback_unique")
      .on(table.providerPlaybackId)
      .where(sql`${table.providerPlaybackId} is not null`),
    index("video_assets_workspace_idx").on(table.workspaceId),
    check(
      "video_assets_duration_nonnegative",
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
  ],
);

/**
 * Durable Mux (and future provider) webhook receipts for idempotent processing.
 * Stores event IDs only — never full payloads, tokens, or secrets.
 */
export const providerEvents = pgTable(
  "provider_events",
  {
    id: id(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    videoAssetId: uuid("video_asset_id").references(() => videoAssets.id, {
      onDelete: "set null",
    }),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("provider_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("provider_events_video_asset_idx").on(table.videoAssetId),
    index("provider_events_workspace_idx").on(table.workspaceId),
  ],
);

export const legacyVideoAnchors = pgTable(
  "legacy_video_anchors",
  {
    issueId: uuid("issue_id").primaryKey(),
    videoAssetId: uuid("video_asset_id"),
    timestampMs: integer("timestamp_ms").notNull(),
    normalizedX: numeric("normalized_x", { precision: 8, scale: 7 }),
    normalizedY: numeric("normalized_y", { precision: 8, scale: 7 }),
    thumbnailAssetId: uuid("thumbnail_asset_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
);

export const issueAttachments = pgTable(
  "issue_attachments",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => issueComments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assetId] }),
    index("issue_attachments_issue_idx").on(table.issueId),
    index("issue_attachments_comment_idx").on(table.commentId),
    check(
      "issue_attachments_one_parent",
      sql`num_nonnulls(${table.issueId}, ${table.commentId}) = 1`,
    ),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("labels_workspace_name_unique").on(table.workspaceId, sql`lower(${table.name})`),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.labelId] }),
    index("issue_labels_label_idx").on(table.labelId),
  ],
);

export const issueAssignments = pgTable(
  "issue_assignments",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.userId] }),
    index("issue_assignments_user_idx").on(table.userId),
  ],
);

export const mentions = pgTable(
  "mentions",
  {
    id: id(),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => issueComments.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("mentions_user_created_idx").on(table.mentionedUserId, table.createdAt),
    check("mentions_one_parent", sql`num_nonnulls(${table.issueId}, ${table.commentId}) = 1`),
  ],
);

export const issueVerifications = pgTable(
  "issue_verifications",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    projectId: uuid("project_id").notNull(),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    verifiedByGuestId: uuid("verified_by_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    method: verificationMethod("method").notNull(),
    outcome: verificationOutcome("outcome").notNull(),
    checkedUrl: text("checked_url"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    evidenceId: uuid("evidence_id").references(() => issueEvidence.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("issue_verifications_issue_created_idx").on(table.issueId, table.createdAt),
    index("issue_verifications_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "issue_verifications_issue_scope_fk",
      columns: [
        table.issueId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
        table.deploymentId,
        table.reviewId,
      ],
      foreignColumns: [
        issues.id,
        issues.workspaceId,
        issues.projectId,
        issues.environmentId,
        issues.deploymentId,
        issues.reviewId,
      ],
    }).onDelete("cascade"),
    check(
      "issue_verifications_has_one_verifier",
      sql`num_nonnulls(${table.verifiedByUserId}, ${table.verifiedByGuestId}) = 1`,
    ),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewerGuestId: uuid("reviewer_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    decision: approvalDecision("decision").notNull(),
    note: text("note"),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("approvals_review_deployment_created_idx").on(
      table.reviewId,
      table.deploymentId,
      table.createdAt,
    ),
    uniqueIndex("approvals_review_deployment_user_decision_unique")
      .on(table.reviewId, table.deploymentId, table.reviewerUserId, table.decision)
      .where(sql`${table.reviewerUserId} is not null and ${table.invalidatedAt} is null`),
    uniqueIndex("approvals_review_deployment_guest_decision_unique")
      .on(table.reviewId, table.deploymentId, table.reviewerGuestId, table.decision)
      .where(sql`${table.reviewerGuestId} is not null and ${table.invalidatedAt} is null`),
    foreignKey({
      name: "approvals_review_scope_fk",
      columns: [
        table.reviewId,
        table.workspaceId,
        table.projectId,
        table.environmentId,
        table.deploymentId,
      ],
      foreignColumns: [
        reviews.id,
        reviews.workspaceId,
        reviews.projectId,
        reviews.environmentId,
        reviews.deploymentId,
      ],
    }).onDelete("cascade"),
    check(
      "approvals_has_one_reviewer",
      sql`num_nonnulls(${table.reviewerUserId}, ${table.reviewerGuestId}) = 1`,
    ),
  ],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    guestIdentityId: uuid("guest_identity_id").references(() => guestIdentities.id, {
      onDelete: "cascade",
    }),
    frequency: notificationFrequency("frequency").notNull().default("immediate"),
    ...timestamps,
  },
  (table) => [
    index("notification_preferences_user_idx").on(table.userId),
    index("notification_preferences_guest_idx").on(table.guestIdentityId),
    uniqueIndex("notification_preferences_user_scope_unique")
      .on(
        table.workspaceId,
        table.userId,
        sql`coalesce(${table.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.userId} is not null`),
    uniqueIndex("notification_preferences_guest_scope_unique")
      .on(
        table.workspaceId,
        table.guestIdentityId,
        sql`coalesce(${table.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      )
      .where(sql`${table.guestIdentityId} is not null`),
    check(
      "notification_preferences_has_one_recipient",
      sql`num_nonnulls(${table.userId}, ${table.guestIdentityId}) = 1`,
    ),
  ],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    signingSecretEncrypted: text("signing_secret_encrypted").notNull(),
    subscribedEvents: jsonb("subscribed_events").$type<string[]>().notNull().default([]),
    isEnabled: boolean("is_enabled").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("webhook_endpoints_workspace_enabled_idx").on(table.workspaceId, table.isEnabled)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_claim_idx").on(table.status, table.availableAt, table.claimedAt),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id").references(() => reviews.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorGuestId: uuid("actor_guest_id").references(() => guestIdentities.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_events_review_created_idx").on(table.reviewId, table.createdAt),
    index("activity_events_issue_created_idx").on(table.issueId, table.createdAt),
    index("activity_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    check(
      "activity_events_at_most_one_actor",
      sql`num_nonnulls(${table.actorUserId}, ${table.actorGuestId}) <= 1`,
    ),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    plan: text("plan").notNull(),
    status: subscriptionStatus("status").notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("subscriptions_workspace_unique").on(table.workspaceId),
    uniqueIndex("subscriptions_provider_customer_unique").on(
      table.provider,
      table.providerCustomerId,
    ),
    uniqueIndex("subscriptions_provider_subscription_unique").on(
      table.provider,
      table.providerSubscriptionId,
    ),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("usage_records_workspace_metric_period_unique").on(
      table.workspaceId,
      table.metric,
      table.periodStart,
      table.periodEnd,
    ),
    check("usage_records_quantity_nonnegative", sql`${table.quantity} >= 0`),
    check("usage_records_period_order", sql`${table.periodEnd} > ${table.periodStart}`),
  ],
);

export const websiteAnalysisStatus = pgEnum("website_analysis_status", [
  "running",
  "succeeded",
  "failed",
  "unreachable",
  "fallback",
]);

/**
 * Cached website installation analysis for a review.
 * Stores only validated structured results and safe evidence summaries — never raw HTML or prompts.
 */
export const websiteAnalyses = pgTable(
  "website_analyses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").notNull(),
    status: websiteAnalysisStatus("status").notNull().default("running"),
    evidenceFingerprint: text("evidence_fingerprint"),
    evidenceSummary: jsonb("evidence_summary").$type<Record<string, unknown>>(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    modelId: text("model_id"),
    source: text("source"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("website_analyses_review_completed_idx").on(
      table.reviewId,
      table.completedAt,
    ),
    index("website_analyses_workspace_idx").on(table.workspaceId),
    uniqueIndex("website_analyses_review_running_unique")
      .on(table.reviewId)
      .where(sql`${table.status} = 'running'`),
    foreignKey({
      name: "website_analyses_environment_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);
