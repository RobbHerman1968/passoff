export const PROJECT_NAME_MAX_LENGTH = 80;
export const REVIEW_NAME_MAX_LENGTH = 80;
export const ENVIRONMENT_NAME_MAX_LENGTH = 80;
export const WEBSITE_URL_MAX_LENGTH = 2048;
export const DEPLOYMENT_IDENTIFIER_MAX_LENGTH = 120;

export const PROJECT_ACTIVITY = {
  created: "project.created",
  renamed: "project.renamed",
  archived: "project.archived",
  restored: "project.restored",
  deleted: "project.deleted",
} as const;

export const REVIEW_ACTIVITY = {
  created: "review.created",
  renamed: "review.renamed",
  archived: "review.archived",
  restored: "review.restored",
  opened: "review.opened",
  closed: "review.closed",
} as const;

export const ENVIRONMENT_ACTIVITY = {
  created: "environment.created",
  updated: "environment.updated",
} as const;

export const DEPLOYMENT_ACTIVITY = {
  recorded: "deployment.recorded",
} as const;
