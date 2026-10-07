import type { AdapterAccountType } from "@auth/core/adapters";
import { sql } from "drizzle-orm";

import type { VideoLifecycle, VideoRemovalReason } from "@/lib/video/states";
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
export const approvalRequestState = pgEnum("approval_request_state", [
  "awaiting_decision",
  "approved",
  "changes_requested",
  "cancelled",
  "superseded",
]);
export const notificationFrequency = pgEnum("notification_frequency", [
  "immediate",
  "digest",
  "muted",
]);
export const notificationEmailStatus = pgEnum("notification_email_status", [
  "pending",
  "sent",
  "skipped",
  "failed",
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
export const telemetryCollectionMode = pgEnum("telemetry_collection_mode", [
  "off",
  "strict_consent",
  "privacy_first_aggregate",
]);
export const telemetryEventType = pgEnum("telemetry_event_type", [
  "page_view",
  "element_click",
  "scroll_milestone",
  "repeat_click_signal",
  "dead_click_candidate",
  "sanitized_javascript_error",
]);
export const telemetryViewportGroup = pgEnum("telemetry_viewport_group", [
  "mobile",
  "tablet",
  "desktop",
]);
export const telemetryTrafficKind = pgEnum("telemetry_traffic_kind", [
  "production",
  "test",
]);
export const telemetryConsentState = pgEnum("telemetry_consent_state", [
  "granted",
  "aggregate_notice",
]);
export const behavioralFindingType = pgEnum("behavioral_finding_type", [
  "click_concentration",
  "repeat_click_concentration",
  "possible_dead_click",
  "scroll_drop_off",
  "sanitized_js_error_concentration",
  "material_version_change",
]);
export const behavioralFindingDisposition = pgEnum(
  "behavioral_finding_disposition",
  [
    "needs_review",
    "attached_to_issue",
    "issue_created",
    "dismissed",
    "watching",
    "insufficient_data",
    "no_longer_occurring",
  ],
);
export const behavioralComparisonOutcome = pgEnum(
  "behavioral_comparison_outcome",
  [
    "appears_improved",
    "appears_unchanged",
    "appears_worse",
    "not_enough_data",
    "incompatible",
  ],
);

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
    /**
     * Set when an owner deletes the workspace. From that moment nobody can open it. The
     * data stays until purgeAfter so the cleanup job can finish removing stored files.
     */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("workspaces_slug_unique").on(table.slug),
    index("workspaces_purge_after_idx")
      .on(table.purgeAfter)
      .where(sql`${table.deletedAt} IS NOT NULL`),
  ],
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
    // A workspace has exactly one active owner. Ownership moves in one transaction.
    uniqueIndex("workspace_memberships_one_active_owner_unique")
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner' AND ${table.status} = 'active'`),
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
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).defaultNow().notNull(),
    sendCount: integer("send_count").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("workspace_invitations_token_hash_unique").on(table.tokenHash),
    index("workspace_invitations_workspace_email_idx").on(table.workspaceId, table.email),
    // One open invitation per person per workspace. Email is always stored lowercase.
    uniqueIndex("workspace_invitations_pending_email_unique")
      .on(table.workspaceId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    check(
      "workspace_invitations_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
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
    verificationHookAllowlist: jsonb("verification_hook_allowlist")
      .$type<string[]>()
      .notNull()
      .default([]),
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
    /** Explicit guest approval permission — independent of commenting. */
    canApprove: boolean("can_approve").notNull().default(false),
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
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, {
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
    index("issues_workspace_assignee_idx").on(table.workspaceId, table.assigneeUserId),
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
    /** Snapshot so the thread stays readable if the account or guest later goes away. */
    authorDisplayName: text("author_display_name").notNull().default("Someone"),
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
    /** The removal date members were last warned about. Prevents repeat warnings. */
    retentionWarnedFor: timestamp("retention_warned_for", { withTimezone: true }),
    processingAttempt: integer("processing_attempt").notNull().default(0),
    /** The issue this clip belongs to. Kept even if the evidence row is removed. */
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    /**
     * `current` is the clip people see, `replacement` is an upload waiting to take its
     * place, `retired` was replaced or abandoned, `removed` was deleted on purpose.
     */
    lifecycle: text("lifecycle").$type<VideoLifecycle>().notNull().default("current"),
    /** Size and length the browser reported. Mux's measured values replace them when ready. */
    declaredDurationMs: integer("declared_duration_ms"),
    declaredBytes: bigint("declared_bytes", { mode: "number" }),
    /** Tallest video track Mux reported, in pixels. */
    maxHeight: integer("max_height"),
    metadataVerifiedAt: timestamp("metadata_verified_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByUserId: uuid("removed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    removalReason: text("removal_reason").$type<VideoRemovalReason>(),
    providerDeleteRequestedAt: timestamp("provider_delete_requested_at", {
      withTimezone: true,
    }),
    providerDeletedAt: timestamp("provider_deleted_at", { withTimezone: true }),
    providerDeleteAttempts: integer("provider_delete_attempts").notNull().default(0),
    providerDeleteNextAttemptAt: timestamp("provider_delete_next_attempt_at", {
      withTimezone: true,
    }),
    /** A short code such as `provider_error`. Never a raw provider message. */
    providerDeleteLastError: text("provider_delete_last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("video_assets_one_current_per_issue")
      .on(table.issueId)
      .where(sql`${table.lifecycle} = 'current' and ${table.issueId} is not null`),
    uniqueIndex("video_assets_one_replacement_per_issue")
      .on(table.issueId)
      .where(sql`${table.lifecycle} = 'replacement' and ${table.issueId} is not null`),
    index("video_assets_issue_idx").on(table.issueId),
    index("video_assets_retention_idx")
      .on(table.retentionEndsAt)
      .where(
        sql`${table.retentionEndsAt} is not null and ${table.lifecycle} in ('current', 'replacement')`,
      ),
    index("video_assets_provider_delete_pending_idx")
      .on(table.providerDeleteNextAttemptAt)
      .where(
        sql`${table.providerDeleteRequestedAt} is not null and ${table.providerDeletedAt} is null`,
      ),
    check(
      "video_assets_lifecycle_valid",
      sql`${table.lifecycle} in ('current', 'replacement', 'retired', 'removed')`,
    ),
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

/**
 * A note left at one moment of one clip. The words live in the linked comment so the
 * discussion stays the single place for replies; this row adds the time and the optional
 * pin. Notes stay on the clip they were written for, even after it is replaced or removed.
 */
export const videoAnnotations = pgTable(
  "video_annotations",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id")
      .notNull()
      .references(() => issueComments.id, { onDelete: "cascade" }),
    videoAssetId: uuid("video_asset_id")
      .notNull()
      .references(() => videoAssets.id, { onDelete: "cascade" }),
    timestampMs: integer("timestamp_ms").notNull(),
    /** Position inside the picture itself (0 to 1), never the player or its black bars. */
    normalizedX: numeric("normalized_x", { precision: 8, scale: 7 }),
    normalizedY: numeric("normalized_y", { precision: 8, scale: 7 }),
    /** Length of the clip when the note was written. Set by the server, never the browser. */
    durationAtCreationMs: integer("duration_at_creation_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("video_annotations_comment_unique").on(table.commentId),
    index("video_annotations_asset_time_idx").on(table.videoAssetId, table.timestampMs),
    index("video_annotations_issue_idx").on(table.issueId),
    check("video_annotations_timestamp_nonnegative", sql`${table.timestampMs} >= 0`),
    check(
      "video_annotations_pin_complete",
      sql`(${table.normalizedX} is null) = (${table.normalizedY} is null)`,
    ),
    check(
      "video_annotations_pin_range",
      sql`${table.normalizedX} is null or (${table.normalizedX} between 0 and 1 and ${table.normalizedY} between 0 and 1)`,
    ),
  ],
);

export const issueAttachments = pgTable(
  "issue_attachments",
  {
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
    commentId: uuid("comment_id").references(() => issueComments.id, { onDelete: "cascade" }),
    /** Private attachments are for workspace members only. Fail closed by default. */
    isPrivate: boolean("is_private").notNull().default(true),
    attachedByUserId: uuid("attached_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assetId] }),
    index("issue_attachments_issue_idx").on(table.issueId),
    index("issue_attachments_issue_public_idx")
      .on(table.issueId)
      .where(sql`${table.isPrivate} = false`),
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
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => projectEnvironments.id, { onDelete: "cascade" }),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "restrict" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
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
    check(
      "approvals_has_one_reviewer",
      sql`num_nonnulls(${table.reviewerUserId}, ${table.reviewerGuestId}) = 1`,
    ),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => projectEnvironments.id, { onDelete: "cascade" }),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    deploymentId: uuid("deployment_id")
      .notNull()
      .references(() => deployments.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewerUserId: uuid("reviewer_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    shareLinkId: uuid("share_link_id").references(() => shareLinks.id, {
      onDelete: "set null",
    }),
    message: text("message"),
    state: approvalRequestState("state").notNull().default("awaiting_decision"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    supersededByRequestId: uuid("superseded_by_request_id"),
    decisionApprovalId: uuid("decision_approval_id").references(() => approvals.id, {
      onDelete: "set null",
    }),
    openIssueCount: integer("open_issue_count").notNull().default(0),
    awaitingVerificationCount: integer("awaiting_verification_count").notNull().default(0),
    verifiedIssueCount: integer("verified_issue_count").notNull().default(0),
    unresolvedAcknowledged: boolean("unresolved_acknowledged").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index("approval_requests_review_created_idx").on(table.reviewId, table.createdAt),
    index("approval_requests_deployment_idx").on(table.deploymentId),
    uniqueIndex("approval_requests_active_review_deployment_unique")
      .on(table.reviewId, table.deploymentId)
      .where(sql`${table.state} = 'awaiting_decision'`),
    foreignKey({
      name: "approval_requests_superseded_by_request_id_approval_requests_id_fk",
      columns: [table.supersededByRequestId],
      foreignColumns: [table.id],
    }).onDelete("set null"),
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

export const userNotificationSettings = pgTable(
  "user_notification_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailAssignments: boolean("email_assignments").notNull().default(true),
    emailReplies: boolean("email_replies").notNull().default(true),
    emailVerification: boolean("email_verification").notNull().default(true),
    emailApproval: boolean("email_approval").notNull().default(true),
    ...timestamps,
  },
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    recipientUserId: uuid("recipient_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    reviewId: uuid("review_id").references(() => reviews.id, {
      onDelete: "cascade",
    }),
    issueId: uuid("issue_id").references(() => issues.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    hrefPath: text("href_path").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailStatus: notificationEmailStatus("email_status").notNull().default("pending"),
    emailError: text("email_error"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("notifications_dedupe_unique").on(table.dedupeKey),
    index("notifications_recipient_created_idx").on(
      table.recipientUserId,
      table.createdAt,
    ),
    index("notifications_recipient_unread_idx")
      .on(table.recipientUserId, table.createdAt)
      .where(sql`${table.readAt} is null`),
    index("notifications_workspace_idx").on(table.workspaceId),
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
    eventId: uuid("event_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: deliveryStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedBy: text("claimed_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastHttpStatus: integer("last_http_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("webhook_deliveries_claim_idx").on(table.status, table.availableAt, table.claimedAt),
    uniqueIndex("webhook_deliveries_endpoint_event_unique").on(table.endpointId, table.eventId),
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
    /** "month" or "year". Null for the free placeholder row. */
    billingInterval: text("billing_interval"),
    /** The price the provider is charging. Only used to tell plans apart, never shown. */
    providerPriceId: text("provider_price_id"),
    /**
     * Set the first time this workspace starts a trial and never cleared, so a
     * workspace gets one trial no matter how many times it subscribes.
     */
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /** When the first unpaid invoice in the current run of failures appeared. */
    pastDueSince: timestamp("past_due_since", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /** Provider time of the newest event applied, so an older event never undoes a newer one. */
    providerEventAt: timestamp("provider_event_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check(
      "subscriptions_billing_interval_valid",
      sql`${table.billingInterval} is null or ${table.billingInterval} in ('month', 'year')`,
    ),
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

export type TelemetryCollectionMode =
  (typeof telemetryCollectionMode.enumValues)[number];
export type TelemetryEventType = (typeof telemetryEventType.enumValues)[number];
export type TelemetryViewportGroup =
  (typeof telemetryViewportGroup.enumValues)[number];
export type TelemetryTrafficKind =
  (typeof telemetryTrafficKind.enumValues)[number];

export const DEFAULT_TELEMETRY_RAW_RETENTION_HOURS = 72;
export const MAX_TELEMETRY_RAW_RETENTION_HOURS = 168;
export const DEFAULT_TELEMETRY_AGGREGATE_RETENTION_DAYS = 90;
export const DEFAULT_TELEMETRY_SAMPLING_PERCENT = 100;
export const DEFAULT_TELEMETRY_MIN_SAMPLE_SESSIONS = 10;

/**
 * Owner-configured visitor analytics for one environment.
 * Disabled by default. Distinct from review screenshot consentSettings.
 */
export const environmentTelemetrySettings = pgTable(
  "environment_telemetry_settings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    collectionMode: telemetryCollectionMode("collection_mode")
      .notNull()
      .default("off"),
    enabledOrigins: jsonb("enabled_origins").$type<string[]>().notNull().default([]),
    excludedRoutes: jsonb("excluded_routes").$type<string[]>().notNull().default([]),
    samplingPercent: integer("sampling_percent").notNull().default(100),
    rawRetentionHours: integer("raw_retention_hours").notNull().default(72),
    aggregateRetentionDays: integer("aggregate_retention_days")
      .notNull()
      .default(90),
    minSampleSessions: integer("min_sample_sessions").notNull().default(10),
    organizationName: text("organization_name"),
    privacyPolicyUrl: text("privacy_policy_url"),
    hideBuiltInPrivacyLink: boolean("hide_built_in_privacy_link")
      .notNull()
      .default(false),
    testModeEnabled: boolean("test_mode_enabled").notNull().default(false),
    environmentKillSwitch: boolean("environment_kill_switch")
      .notNull()
      .default(false),
    lastAcceptedEventAt: timestamp("last_accepted_event_at", {
      withTimezone: true,
    }),
    lastAggregatedAt: timestamp("last_aggregated_at", { withTimezone: true }),
    lastLimitNotifiedAt: timestamp("last_limit_notified_at", {
      withTimezone: true,
    }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("environment_telemetry_settings_environment_unique").on(
      table.environmentId,
    ),
    index("environment_telemetry_settings_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "environment_telemetry_settings_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
    check(
      "environment_telemetry_sampling_range",
      sql`${table.samplingPercent} >= 1 AND ${table.samplingPercent} <= 100`,
    ),
    check(
      "environment_telemetry_raw_retention_range",
      sql`${table.rawRetentionHours} >= 1 AND ${table.rawRetentionHours} <= 168`,
    ),
    check(
      "environment_telemetry_aggregate_retention_range",
      sql`${table.aggregateRetentionDays} >= 1 AND ${table.aggregateRetentionDays} <= 365`,
    ),
    check("environment_telemetry_version_positive", sql`${table.version} > 0`),
  ],
);

/**
 * Short-retention raw events. Inaccessible from ordinary product UI.
 * tab_session_hash is a keyed HMAC, never the client value, never shown.
 */
export const telemetryRawEvents = pgTable(
  "telemetry_raw_events",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    schemaVersion: integer("schema_version").notNull(),
    eventId: text("event_id").notNull(),
    batchId: text("batch_id").notNull(),
    eventType: telemetryEventType("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    trafficKind: telemetryTrafficKind("traffic_kind").notNull().default("production"),
    consentState: telemetryConsentState("consent_state").notNull(),
    normalizedRoute: text("normalized_route").notNull(),
    deploymentVersion: text("deployment_version").notNull().default(""),
    viewportGroup: telemetryViewportGroup("viewport_group").notNull(),
    samplingPercent: integer("sampling_percent").notNull(),
    coordinateBucketX: integer("coordinate_bucket_x"),
    coordinateBucketY: integer("coordinate_bucket_y"),
    elementCategory: text("element_category"),
    analyticsLabel: text("analytics_label"),
    scrollMilestone: integer("scroll_milestone"),
    errorCategory: text("error_category"),
    errorFingerprint: text("error_fingerprint"),
    sourceCategory: text("source_category"),
    tabSessionHash: text("tab_session_hash").notNull(),
    hourBucket: timestamp("hour_bucket", { withTimezone: true }).notNull(),
    aggregatedAt: timestamp("aggregated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("telemetry_raw_events_event_id_unique").on(table.eventId),
    index("telemetry_raw_events_env_received_idx").on(
      table.environmentId,
      table.receivedAt,
    ),
    index("telemetry_raw_events_unaggregated_idx")
      .on(table.environmentId, table.receivedAt)
      .where(sql`${table.aggregatedAt} IS NULL`),
    index("telemetry_raw_events_expires_idx").on(table.expiresAt),
    foreignKey({
      name: "telemetry_raw_events_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

export const telemetryIngestDedup = pgTable(
  "telemetry_ingest_dedup",
  {
    id: id(),
    environmentId: uuid("environment_id").notNull(),
    kind: text("kind").notNull(),
    dedupKey: text("dedup_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telemetry_ingest_dedup_key_unique").on(
      table.environmentId,
      table.kind,
      table.dedupKey,
    ),
    index("telemetry_ingest_dedup_expires_idx").on(table.expiresAt),
  ],
);

export const telemetryAggregates = pgTable(
  "telemetry_aggregates",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    trafficKind: telemetryTrafficKind("traffic_kind").notNull().default("production"),
    hourBucket: timestamp("hour_bucket", { withTimezone: true }).notNull(),
    deploymentVersion: text("deployment_version").notNull().default(""),
    normalizedRoute: text("normalized_route").notNull(),
    viewportGroup: telemetryViewportGroup("viewport_group").notNull(),
    eventType: telemetryEventType("event_type").notNull(),
    elementCategory: text("element_category").notNull().default(""),
    analyticsLabel: text("analytics_label").notNull().default(""),
    coordinateBucketX: integer("coordinate_bucket_x").notNull().default(-1),
    coordinateBucketY: integer("coordinate_bucket_y").notNull().default(-1),
    scrollMilestone: integer("scroll_milestone").notNull().default(-1),
    errorCategory: text("error_category").notNull().default(""),
    errorFingerprint: text("error_fingerprint").notNull().default(""),
    eventCount: bigint("event_count", { mode: "number" }).notNull().default(0),
    tabSessionCount: bigint("tab_session_count", { mode: "number" })
      .notNull()
      .default(0),
    firstOccurredAt: timestamp("first_occurred_at", { withTimezone: true }),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telemetry_aggregates_dimension_unique").on(
      table.environmentId,
      table.trafficKind,
      table.hourBucket,
      table.deploymentVersion,
      table.normalizedRoute,
      table.viewportGroup,
      table.eventType,
      table.elementCategory,
      table.analyticsLabel,
      table.coordinateBucketX,
      table.coordinateBucketY,
      table.scrollMilestone,
      table.errorCategory,
      table.errorFingerprint,
    ),
    index("telemetry_aggregates_query_idx").on(
      table.environmentId,
      table.trafficKind,
      table.hourBucket,
      table.normalizedRoute,
      table.eventType,
    ),
    index("telemetry_aggregates_expires_idx").on(table.expiresAt),
    foreignKey({
      name: "telemetry_aggregates_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

/**
 * One scoped row per tab session and aggregate dimension. This preserves exact
 * distinct-session counts across cron batches and hour buckets without storing
 * a stable visitor identity or exposing the keyed session hash to product UI.
 */
export const telemetryAggregateSessions = pgTable(
  "telemetry_aggregate_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    trafficKind: telemetryTrafficKind("traffic_kind").notNull().default("production"),
    hourBucket: timestamp("hour_bucket", { withTimezone: true }).notNull(),
    deploymentVersion: text("deployment_version").notNull().default(""),
    normalizedRoute: text("normalized_route").notNull(),
    viewportGroup: telemetryViewportGroup("viewport_group").notNull(),
    eventType: telemetryEventType("event_type").notNull(),
    elementCategory: text("element_category").notNull().default(""),
    analyticsLabel: text("analytics_label").notNull().default(""),
    coordinateBucketX: integer("coordinate_bucket_x").notNull().default(-1),
    coordinateBucketY: integer("coordinate_bucket_y").notNull().default(-1),
    scrollMilestone: integer("scroll_milestone").notNull().default(-1),
    errorCategory: text("error_category").notNull().default(""),
    errorFingerprint: text("error_fingerprint").notNull().default(""),
    tabSessionHash: text("tab_session_hash").notNull(),
    firstOccurredAt: timestamp("first_occurred_at", { withTimezone: true }).notNull(),
    lastOccurredAt: timestamp("last_occurred_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telemetry_aggregate_sessions_dimension_unique").on(
      table.environmentId,
      table.trafficKind,
      table.hourBucket,
      table.deploymentVersion,
      table.normalizedRoute,
      table.viewportGroup,
      table.eventType,
      table.elementCategory,
      table.analyticsLabel,
      table.coordinateBucketX,
      table.coordinateBucketY,
      table.scrollMilestone,
      table.errorCategory,
      table.errorFingerprint,
      table.tabSessionHash,
    ),
    index("telemetry_aggregate_sessions_query_idx").on(
      table.environmentId,
      table.trafficKind,
      table.normalizedRoute,
      table.deploymentVersion,
      table.viewportGroup,
      table.eventType,
      table.hourBucket,
    ),
    index("telemetry_aggregate_sessions_expires_idx").on(table.expiresAt),
    foreignKey({
      name: "telemetry_aggregate_sessions_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

export const telemetryAggregationCheckpoints = pgTable(
  "telemetry_aggregation_checkpoints",
  {
    id: id(),
    environmentId: uuid("environment_id").notNull(),
    lastAggregatedAt: timestamp("last_aggregated_at", { withTimezone: true }),
    lastRawEventId: uuid("last_raw_event_id"),
    acceptedEventCount: bigint("accepted_event_count", {
      mode: "number",
    })
      .notNull()
      .default(0),
    aggregatedEventCount: bigint("aggregated_event_count", {
      mode: "number",
    })
      .notNull()
      .default(0),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telemetry_aggregation_checkpoints_env_unique").on(
      table.environmentId,
    ),
  ],
);

export const telemetryUsageCounters = pgTable(
  "telemetry_usage_counters",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    acceptedEvents: bigint("accepted_events", { mode: "number" })
      .notNull()
      .default(0),
    droppedEvents: bigint("dropped_events", { mode: "number" })
      .notNull()
      .default(0),
    sampledOutEvents: bigint("sampled_out_events", { mode: "number" })
      .notNull()
      .default(0),
    errorEvents: bigint("error_events", { mode: "number" }).notNull().default(0),
    testEvents: bigint("test_events", { mode: "number" }).notNull().default(0),
    limitedAt: timestamp("limited_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telemetry_usage_counters_env_period_unique").on(
      table.environmentId,
      table.periodStart,
    ),
    index("telemetry_usage_counters_workspace_period_idx").on(
      table.workspaceId,
      table.periodStart,
    ),
  ],
);

/**
 * One-time codes for authorized live heatmap viewing.
 * Distinct from review share-link exchanges.
 */
export const telemetryViewExchanges = pgTable(
  "telemetry_view_exchanges",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    codeHash: text("code_hash").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    viewScope: jsonb("view_scope").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telemetry_view_exchanges_code_hash_unique").on(table.codeHash),
    index("telemetry_view_exchanges_expiry_idx").on(table.expiresAt),
  ],
);

export const telemetryViewSessions = pgTable(
  "telemetry_view_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    viewScope: jsonb("view_scope").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("telemetry_view_sessions_token_hash_unique").on(table.tokenHash),
    index("telemetry_view_sessions_expiry_idx").on(table.expiresAt),
  ],
);

/** Singleton-style platform emergency switch. Id is always `platform`. */
export const platformTelemetryControls = pgTable("platform_telemetry_controls", {
  id: text("id").primaryKey(),
  killSwitch: boolean("kill_switch").notNull().default(false),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BehavioralFindingType =
  (typeof behavioralFindingType.enumValues)[number];
export type BehavioralFindingDisposition =
  (typeof behavioralFindingDisposition.enumValues)[number];

export const behavioralFindings = pgTable(
  "behavioral_findings",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    findingType: behavioralFindingType("finding_type").notNull(),
    ruleVersion: text("rule_version").notNull(),
    scopeKey: text("scope_key").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    uncertainty: text("uncertainty").notNull(),
    normalizedRoute: text("normalized_route").notNull(),
    deploymentVersion: text("deployment_version").notNull().default(""),
    viewportGroup: telemetryViewportGroup("viewport_group").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
    elementCategory: text("element_category").notNull().default(""),
    analyticsLabel: text("analytics_label").notNull().default(""),
    metricName: text("metric_name").notNull(),
    metricValue: numeric("metric_value", { precision: 12, scale: 6 }).notNull(),
    denominatorName: text("denominator_name").notNull(),
    denominatorValue: bigint("denominator_value", { mode: "number" }).notNull(),
    eventCount: bigint("event_count", { mode: "number" }).notNull(),
    eligibleSessionCount: bigint("eligible_session_count", {
      mode: "number",
    }).notNull(),
    samplingPercent: integer("sampling_percent").notNull(),
    coverageStatus: text("coverage_status").notNull(),
    dataQuality: text("data_quality").notNull(),
    disposition: behavioralFindingDisposition("disposition")
      .notNull()
      .default("needs_review"),
    relatedIssueId: uuid("related_issue_id"),
    relatedReviewId: uuid("related_review_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("behavioral_findings_active_scope_unique")
      .on(table.environmentId, table.scopeKey)
      .where(
        sql`${table.disposition} IN ('needs_review', 'watching', 'attached_to_issue', 'issue_created')`,
      ),
    index("behavioral_findings_workspace_idx").on(
      table.workspaceId,
      table.updatedAt,
    ),
    foreignKey({
      name: "behavioral_findings_scope_fk",
      columns: [table.environmentId, table.workspaceId, table.projectId],
      foreignColumns: [
        projectEnvironments.id,
        projectEnvironments.workspaceId,
        projectEnvironments.projectId,
      ],
    }).onDelete("cascade"),
  ],
);

export const behavioralEvidenceSnapshots = pgTable(
  "behavioral_evidence_snapshots",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    findingId: uuid("finding_id").notNull(),
    issueId: uuid("issue_id"),
    reviewId: uuid("review_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("behavioral_evidence_snapshots_issue_idx").on(table.issueId),
    index("behavioral_evidence_snapshots_finding_idx").on(table.findingId),
    uniqueIndex("behavioral_evidence_snapshots_finding_issue_unique").on(
      table.findingId,
      table.issueId,
    ),
  ],
);

export const behavioralComparisons = pgTable(
  "behavioral_comparisons",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    issueId: uuid("issue_id"),
    findingId: uuid("finding_id"),
    baselineSnapshotId: uuid("baseline_snapshot_id").notNull(),
    baselineVersion: text("baseline_version").notNull(),
    comparisonVersion: text("comparison_version").notNull(),
    metricName: text("metric_name").notNull(),
    viewportGroup: telemetryViewportGroup("viewport_group").notNull(),
    baselineValue: numeric("baseline_value", { precision: 12, scale: 6 }),
    comparisonValue: numeric("comparison_value", { precision: 12, scale: 6 }),
    baselineSample: bigint("baseline_sample", { mode: "number" }).notNull().default(0),
    comparisonSample: bigint("comparison_sample", { mode: "number" })
      .notNull()
      .default(0),
    outcome: behavioralComparisonOutcome("outcome").notNull(),
    summary: text("summary").notNull(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("behavioral_comparisons_issue_idx").on(table.issueId)],
);

export const behavioralAiAnalyses = pgTable(
  "behavioral_ai_analyses",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id").notNull(),
    requestedByUserId: uuid("requested_by_user_id").notNull(),
    modelId: text("model_id"),
    status: text("status").notNull(),
    inputFingerprint: text("input_fingerprint").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    tokenUsage: jsonb("token_usage").$type<Record<string, unknown>>(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("behavioral_ai_analyses_finding_idx").on(table.findingId, table.createdAt),
    uniqueIndex("behavioral_ai_analyses_inflight_unique")
      .on(table.findingId, table.inputFingerprint)
      .where(sql`${table.status} = 'running'`),
  ],
);

export const verificationRunState = pgEnum("verification_run_state", [
  "preparing",
  "locating",
  "running",
  "capturing",
  "complete",
  "needs_attention",
  "cancelled",
]);

export const verificationRunOverall = pgEnum("verification_run_overall", [
  "passed",
  "failed",
  "uncertain",
  "cancelled",
]);

export const verificationCheckKind = pgEnum("verification_check_kind", [
  "element_visibility",
  "bounding_box_overlap",
  "named_test_hook",
]);

export const verificationVersionSource = pgEnum("verification_version_source", [
  "installation_deployment",
  "application_release",
  "environment_metadata",
  "manual_confirmation",
  "missing",
]);

export const verificationEvidenceCaptureState = pgEnum(
  "verification_evidence_capture_state",
  ["not_requested", "pending", "ready", "failed", "skipped"],
);

/**
 * One-time codes that hand an authorized workspace member over to a
 * cross-origin verification session. Raw codes are never stored.
 */
export const verificationExchanges = pgTable(
  "verification_exchanges",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    codeHash: text("code_hash").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    pageRoute: text("page_route"),
    targetUrl: text("target_url").notNull(),
    selectedChecks: jsonb("selected_checks").$type<string[]>().notNull(),
    namedHook: text("named_hook"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("verification_exchanges_code_hash_unique").on(table.codeHash),
    index("verification_exchanges_expiry_idx").on(table.expiresAt),
    index("verification_exchanges_run_idx").on(table.runId),
  ],
);

export const verificationSessions = pgTable(
  "verification_sessions",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("run_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    allowedOrigin: text("allowed_origin").notNull(),
    pageRoute: text("page_route"),
    selectedChecks: jsonb("selected_checks").$type<string[]>().notNull(),
    namedHook: text("named_hook"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("verification_sessions_token_hash_unique").on(table.tokenHash),
    index("verification_sessions_expiry_idx").on(table.expiresAt),
    index("verification_sessions_run_idx").on(table.runId),
  ],
);

export const verificationRuns = pgTable(
  "verification_runs",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    issueId: uuid("issue_id").notNull(),
    environmentId: uuid("environment_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    initiatingUserId: uuid("initiating_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    state: verificationRunState("state").notNull().default("preparing"),
    overallResult: verificationRunOverall("overall_result"),
    selectedChecks: jsonb("selected_checks").$type<string[]>().notNull(),
    namedHook: text("named_hook"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    actualUrl: text("actual_url"),
    actualRoute: text("actual_route"),
    viewportWidth: integer("viewport_width"),
    viewportHeight: integer("viewport_height"),
    devicePixelRatio: numeric("device_pixel_ratio", { precision: 6, scale: 3 }),
    orientation: text("orientation"),
    viewportGroup: text("viewport_group"),
    versionDetectionMethod: verificationVersionSource("version_detection_method"),
    expectedVersion: text("expected_version"),
    detectedVersion: text("detected_version"),
    anchorMatchConfidence: matchConfidence("anchor_match_confidence"),
    evidenceId: uuid("evidence_id").references(() => issueEvidence.id, {
      onDelete: "set null",
    }),
    evidenceCaptureState: verificationEvidenceCaptureState("evidence_capture_state")
      .notNull()
      .default("not_requested"),
    limitations: jsonb("limitations").$type<string[]>().notNull().default([]),
    failureCode: text("failure_code"),
    runnerVersion: text("runner_version"),
    contractVersion: integer("contract_version").notNull().default(1),
    resultIdempotencyKey: text("result_idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verification_runs_issue_created_idx").on(table.issueId, table.createdAt),
    index("verification_runs_workspace_idx").on(table.workspaceId),
    foreignKey({
      name: "verification_runs_issue_fk",
      columns: [table.issueId],
      foreignColumns: [issues.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "verification_runs_deployment_fk",
      columns: [table.deploymentId],
      foreignColumns: [deployments.id],
    }).onDelete("restrict"),
  ],
);

export const verificationCheckResults = pgTable(
  "verification_check_results",
  {
    id: id(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    runId: uuid("run_id")
      .notNull()
      .references(() => verificationRuns.id, { onDelete: "cascade" }),
    kind: verificationCheckKind("kind").notNull(),
    outcome: verificationOutcome("outcome").notNull(),
    summary: text("summary").notNull(),
    measurements: jsonb("measurements").$type<Record<string, unknown>>().notNull().default({}),
    limitations: jsonb("limitations").$type<string[]>().notNull().default([]),
    hookName: text("hook_name").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("verification_check_results_run_idx").on(table.runId),
    uniqueIndex("verification_check_results_run_kind_hook_unique").on(
      table.runId,
      table.kind,
      table.hookName,
    ),
  ],
);
