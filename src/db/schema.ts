import type { AdapterAccountType } from "@auth/core/adapters";
import {
  boolean,
  index,
  integer,
  numeric,
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

/** Auth.js-compatible users table, plus Pass-Off provider identity fields. */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
  image: text("image"),
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider"),
  authProviderUserId: text("auth_provider_user_id"),
  ...timestamps,
}, (table) => [
  uniqueIndex("users_auth_provider_identity_unique").on(table.authProvider, table.authProviderUserId),
]);

export const accounts = pgTable("accounts", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
}, (table) => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
  index("accounts_user_idx").on(table.userId),
]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  index("sessions_user_idx").on(table.userId),
]);

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.identifier, table.token] }),
]);

export const authenticators = pgTable("authenticators", {
  credentialID: text("credential_id").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  providerAccountId: text("provider_account_id").notNull(),
  credentialPublicKey: text("credential_public_key").notNull(),
  counter: integer("counter").notNull(),
  credentialDeviceType: text("credential_device_type").notNull(),
  credentialBackedUp: boolean("credential_backed_up").notNull(),
  transports: text("transports"),
}, (table) => [
  primaryKey({ columns: [table.userId, table.credentialID] }),
]);

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").notNull().default("active"),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoKey: text("logo_key"),
  brandColor: text("brand_color").default("#6354d4"),
  replyToEmail: text("reply_to_email"),
  /** Owner notification inbox; defaults to the workspace owner's account email. */
  notificationEmail: text("notification_email"),
  ...timestamps,
}, (table) => [
  uniqueIndex("workspaces_organization_slug_unique").on(table.organizationId, table.slug),
  index("workspaces_organization_idx").on(table.organizationId),
]);

export const organizationMemberships = pgTable("organization_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  status: text("status").notNull().default("active"),
  ...timestamps,
}, (table) => [
  uniqueIndex("organization_memberships_org_user_unique").on(table.organizationId, table.userId),
  index("organization_memberships_user_idx").on(table.userId),
]);

export const workspaceMemberships = pgTable("workspace_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  ...timestamps,
}, (table) => [
  uniqueIndex("workspace_memberships_workspace_user_unique").on(table.workspaceId, table.userId),
  index("workspace_memberships_user_idx").on(table.userId),
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  plan: text("plan").notNull(),
  status: text("status").notNull(),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: integer("cancel_at_period_end").notNull().default(0),
  ...timestamps,
}, (table) => [
  index("subscriptions_organization_idx").on(table.organizationId),
  uniqueIndex("subscriptions_provider_subscription_unique").on(table.provider, table.providerSubscriptionId),
]);

/** Client approval room. Status: DRAFT | SENT | VIEWED | CHANGES_REQUESTED | APPROVED | ARCHIVED */
export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  clientName: text("client_name").notNull().default(""),
  slug: text("slug").notNull(),
  status: text("status").notNull().default("DRAFT"),
  currentPublishedRevisionId: uuid("current_published_revision_id"),
  approvedRevisionId: uuid("approved_revision_id"),
  handoffReleasedAt: timestamp("handoff_released_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("projects_workspace_slug_unique").on(table.workspaceId, table.slug),
  index("projects_organization_idx").on(table.organizationId),
  index("projects_workspace_status_updated_idx").on(table.workspaceId, table.status, table.updatedAt),
]);

/** Revision status: DRAFT | PUBLISHED | SUPERSEDED | APPROVED */
export const revisions = pgTable("revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  status: text("status").notNull().default("DRAFT"),
  contentDigest: text("content_digest"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("revisions_project_number_unique").on(table.projectId, table.number),
  index("revisions_project_number_desc_idx").on(table.projectId, table.number),
  index("revisions_workspace_idx").on(table.workspaceId),
]);

/** Stored file or external review URL. */
export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // image | pdf | screenshot | url
  label: text("label").notNull(),
  objectKey: text("object_key"),
  /** vercel_blob | local | external */
  storageProvider: text("storage_provider").notNull().default("local"),
  /** Private Blob URL when storageProvider = vercel_blob. Never treat as authorization. */
  blobUrl: text("blob_url"),
  /** pending | ready | orphaned */
  uploadStatus: text("upload_status").notNull().default("ready"),
  uploadSessionId: text("upload_session_id"),
  revisionId: uuid("revision_id").references(() => revisions.id, { onDelete: "set null" }),
  externalUrl: text("external_url"),
  mime: text("mime"),
  bytes: integer("bytes"),
  checksum: text("checksum"),
  width: integer("width"),
  height: integer("height"),
  pageCount: integer("page_count"),
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  index("assets_workspace_project_idx").on(table.workspaceId, table.projectId),
  index("assets_project_idx").on(table.projectId),
  index("assets_upload_status_created_idx").on(table.uploadStatus, table.createdAt),
  uniqueIndex("assets_upload_session_unique").on(table.uploadSessionId),
]);

export const revisionAssets = pgTable("revision_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  revisionId: uuid("revision_id").notNull().references(() => revisions.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "restrict" }),
  sortOrder: integer("sort_order").notNull().default(0),
  displayMetaJson: text("display_meta_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("revision_assets_revision_asset_unique").on(table.revisionId, table.assetId),
  index("revision_assets_revision_sort_idx").on(table.revisionId, table.sortOrder),
]);

export const shareLinks = pgTable("share_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  scope: text("scope").notNull().default("review"), // review | view_only
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | REVOKED | EXPIRED
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  viewCount: integer("view_count").notNull().default(0),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  uniqueIndex("share_links_token_hash_unique").on(table.tokenHash),
  index("share_links_project_idx").on(table.projectId, table.revokedAt),
]);

export const reviewers = pgTable("reviewers", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("reviewers_project_email_unique").on(table.projectId, table.email),
  index("reviewers_project_idx").on(table.projectId),
]);

/** Comment status: OPEN | RESOLVED | WONT_FIX */
export const roomComments = pgTable("room_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => revisions.id, { onDelete: "cascade" }),
  revisionAssetId: uuid("revision_asset_id").notNull().references(() => revisionAssets.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").references(() => reviewers.id, { onDelete: "set null" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  parentCommentId: uuid("parent_comment_id"),
  xPercent: numeric("x_percent", { precision: 8, scale: 5 }).notNull(),
  yPercent: numeric("y_percent", { precision: 8, scale: 5 }).notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("OPEN"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  index("room_comments_revision_asset_created_idx").on(table.revisionAssetId, table.createdAt),
  index("room_comments_project_status_idx").on(table.projectId, table.status),
  index("room_comments_revision_idx").on(table.revisionId),
]);

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  revisionId: uuid("revision_id").notNull().references(() => revisions.id, { onDelete: "restrict" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => reviewers.id, { onDelete: "restrict" }),
  acceptanceStatement: text("acceptance_statement").notNull(),
  contentDigest: text("content_digest").notNull(),
  decision: text("decision").notNull().default("approved"), // approved | changes_requested
  approvedAt: timestamp("approved_at", { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("approvals_revision_idx").on(table.revisionId),
  index("approvals_project_idx").on(table.projectId),
]);

export const handoffItems = pgTable("handoff_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
  externalUrl: text("external_url"),
  label: text("label").notNull(),
  category: text("category").notNull().default("file"), // file | note | credential | link
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => [
  index("handoff_items_project_sort_idx").on(table.projectId, table.sortOrder),
]);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  actorType: text("actor_type").notNull(), // user | reviewer | system
  actorId: text("actor_id"),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("audit_events_project_created_idx").on(table.projectId, table.createdAt),
]);

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  /** Stable key for outbound message deduplication across retries. */
  idempotencyKey: text("idempotency_key"),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  claimToken: text("claim_token"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("outbox_events_pending_idx").on(table.processedAt, table.availableAt),
  uniqueIndex("outbox_events_idempotency_unique").on(table.idempotencyKey),
  index("outbox_events_claim_idx").on(table.claimedAt, table.processedAt),
]);

/** Idempotent Stripe webhook processing. */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  stripeEventId: text("stripe_event_id").notNull(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("stripe_webhook_events_event_id_unique").on(table.stripeEventId),
]);

/** Retryable Blob deletion queue — never delete objects still referenced by published revisions. */
export const blobDeletionJobs = pgTable("blob_deletion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  blobUrl: text("blob_url"),
  reason: text("reason").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("blob_deletion_jobs_pending_idx").on(table.processedAt, table.availableAt),
]);

/** Password reset tokens (hashed). */
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
  index("password_reset_tokens_user_idx").on(table.userId),
]);

export const figmaConnections = pgTable("figma_connections", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  connectedByUserId: uuid("connected_by_user_id").references(() => users.id, { onDelete: "set null" }),
  figmaUserId: text("figma_user_id").notNull(),
  encryptedAccessToken: text("encrypted_access_token").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  index("figma_connections_organization_idx").on(table.organizationId),
  index("figma_connections_workspace_idx").on(table.workspaceId),
]);

export const figmaQuestions = pgTable("figma_questions", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  askedByUserId: uuid("asked_by_user_id").references(() => users.id, { onDelete: "set null" }),
  figmaConnectionId: uuid("figma_connection_id").references(() => figmaConnections.id, { onDelete: "set null" }),
  figmaFileKey: text("figma_file_key").notNull(),
  figmaFileName: text("figma_file_name").notNull(),
  screenId: text("screen_id").notNull(),
  screenName: text("screen_name").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  analysisSource: text("analysis_source").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  gapsJson: text("gaps_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("figma_questions_project_created_idx").on(table.projectId, table.createdAt),
  index("figma_questions_user_created_idx").on(table.askedByUserId, table.createdAt),
  index("figma_questions_file_idx").on(table.figmaConnectionId, table.figmaFileKey),
]);

export const figmaComments = pgTable("figma_comments", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
  figmaFileKey: text("figma_file_key").notNull(),
  figmaFileName: text("figma_file_name").notNull(),
  screenId: text("screen_id").notNull(),
  screenName: text("screen_name").notNull(),
  xBasisPoints: integer("x_basis_points").notNull(),
  yBasisPoints: integer("y_basis_points").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("open"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index("figma_comments_screen_created_idx").on(table.organizationId, table.projectId, table.figmaFileKey, table.screenId, table.createdAt),
  index("figma_comments_author_created_idx").on(table.authorUserId, table.createdAt),
]);

export const figmaImports = pgTable("figma_imports", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  figmaConnectionId: uuid("figma_connection_id").references(() => figmaConnections.id, { onDelete: "set null" }),
  importedByUserId: uuid("imported_by_user_id").references(() => users.id, { onDelete: "set null" }),
  figmaFileKey: text("figma_file_key").notNull(),
  figmaFileName: text("figma_file_name").notNull(),
  figmaVersion: text("figma_version").notNull(),
  importSource: text("import_source").notNull().default("api"),
  figmaLastModified: timestamp("figma_last_modified", { withTimezone: true }).notNull(),
  thumbnailUrl: text("thumbnail_url"),
  mainScreenId: text("main_screen_id"),
  warningsJson: text("warnings_json").notNull().default("[]"),
  screenCount: integer("screen_count").notNull().default(0),
  previewCount: integer("preview_count").notNull().default(0),
  interactionCount: integer("interaction_count").notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex("figma_imports_project_file_unique").on(table.projectId, table.figmaFileKey),
  index("figma_imports_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
]);

export const figmaImportScreens = pgTable("figma_import_screens", {
  id: uuid("id").primaryKey(),
  figmaImportId: uuid("figma_import_id").notNull().references(() => figmaImports.id, { onDelete: "cascade" }),
  figmaNodeId: text("figma_node_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  imageUrl: text("image_url"),
  width: integer("width"),
  height: integer("height"),
  x: integer("x"),
  y: integer("y"),
  interactionCount: integer("interaction_count").notNull().default(0),
  sortOrder: integer("sort_order").notNull(),
  breakpointGroupId: text("breakpoint_group_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("figma_import_screens_import_node_unique").on(table.figmaImportId, table.figmaNodeId),
  index("figma_import_screens_import_sort_idx").on(table.figmaImportId, table.sortOrder),
  index("figma_import_screens_group_idx").on(table.figmaImportId, table.breakpointGroupId),
]);

export const figmaImportBreakpointGroups = pgTable("figma_import_breakpoint_groups", {
  id: text("id").primaryKey(),
  figmaImportId: uuid("figma_import_id").notNull().references(() => figmaImports.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  primaryScreenId: text("primary_screen_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("figma_import_breakpoint_groups_import_idx").on(table.figmaImportId),
]);

export const figmaImportInteractions = pgTable("figma_import_interactions", {
  id: uuid("id").primaryKey(),
  figmaImportId: uuid("figma_import_id").notNull().references(() => figmaImports.id, { onDelete: "cascade" }),
  sourceNodeId: text("source_node_id").notNull(),
  sourceNodeName: text("source_node_name").notNull(),
  sourceScreenId: text("source_screen_id").notNull(),
  destinationNodeId: text("destination_node_id"),
  destinationScreenId: text("destination_screen_id"),
  trigger: text("trigger").notNull(),
  actionsJson: text("actions_json").notNull(),
  sourceX: integer("source_x"),
  sourceY: integer("source_y"),
  sourceWidth: integer("source_width"),
  sourceHeight: integer("source_height"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("figma_import_interactions_import_sort_idx").on(table.figmaImportId, table.sortOrder),
  index("figma_import_interactions_source_idx").on(table.figmaImportId, table.sourceScreenId),
]);

/** Slim inspect trees (JSON) keyed by screen node id — powers Dev Mode–style inspect/CSS. */
export const figmaImportScreenTrees = pgTable("figma_import_screen_trees", {
  id: uuid("id").primaryKey(),
  figmaImportId: uuid("figma_import_id").notNull().references(() => figmaImports.id, { onDelete: "cascade" }),
  figmaNodeId: text("figma_node_id").notNull(),
  treeJson: text("tree_json").notNull(),
  source: text("source").notNull().default("import"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("figma_import_screen_trees_import_node_unique").on(table.figmaImportId, table.figmaNodeId),
  index("figma_import_screen_trees_import_idx").on(table.figmaImportId),
]);

export const openaiRuns = pgTable("openai_runs", {
  id: uuid("id").primaryKey(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  questionId: uuid("question_id").notNull(),
  figmaConnectionId: uuid("figma_connection_id").references(() => figmaConnections.id, { onDelete: "set null" }),
  figmaFileKey: text("figma_file_key").notNull(),
  figmaFileName: text("figma_file_name").notNull(),
  screenId: text("screen_id").notNull(),
  screenName: text("screen_name").notNull(),
  question: text("question").notNull(),
  provider: text("provider").notNull().default("openai"),
  model: text("model").notNull(),
  responseId: text("response_id"),
  status: text("status").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  inputRatePerMillion: numeric("input_rate_per_million", { precision: 12, scale: 6 }),
  cachedInputRatePerMillion: numeric("cached_input_rate_per_million", { precision: 12, scale: 6 }),
  outputRatePerMillion: numeric("output_rate_per_million", { precision: 12, scale: 6 }),
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 18, scale: 8 }),
  latencyMs: integer("latency_ms").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("openai_runs_organization_created_idx").on(table.organizationId, table.createdAt),
  index("openai_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
  index("openai_runs_project_created_idx").on(table.projectId, table.createdAt),
  index("openai_runs_user_created_idx").on(table.userId, table.createdAt),
  index("openai_runs_question_idx").on(table.questionId),
]);
