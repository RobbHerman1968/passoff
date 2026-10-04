import { z } from "zod";

import {
  ENVIRONMENT_NAME_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  REVIEW_NAME_MAX_LENGTH,
  WEBSITE_URL_MAX_LENGTH,
} from "@/lib/projects/constants";
import { ENVIRONMENT_KINDS, REVIEW_STATUSES } from "@/lib/projects/statuses";
import { normalizeWebsiteUrl } from "@/lib/projects/urls";
import { zodFieldErrors, type FieldErrors } from "@/lib/auth/schemas";

export { zodFieldErrors, type FieldErrors };

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a project name.")
  .max(
    PROJECT_NAME_MAX_LENGTH,
    `Enter a shorter project name (up to ${PROJECT_NAME_MAX_LENGTH} characters).`,
  );

export const createProjectSchema = z.object({
  name: projectNameSchema,
});

export const renameProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: projectNameSchema,
  version: z.coerce.number().int().positive(),
});

export const projectVersionActionSchema = z.object({
  projectId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export const deleteProjectSchema = z.object({
  projectId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  confirmationName: z.string(),
});

export const reviewNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a review name.")
  .max(
    REVIEW_NAME_MAX_LENGTH,
    `Enter a shorter review name (up to ${REVIEW_NAME_MAX_LENGTH} characters).`,
  );

export const createReviewSchema = z
  .object({
    projectId: z.string().uuid(),
    name: reviewNameSchema,
    websiteUrl: z.string().max(WEBSITE_URL_MAX_LENGTH),
  })
  .superRefine((value, ctx) => {
    const result = normalizeWebsiteUrl(value.websiteUrl);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["websiteUrl"],
        message: result.message,
      });
    }
  });

export const renameReviewSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  name: reviewNameSchema,
  version: z.coerce.number().int().positive(),
});

export const reviewVersionActionSchema = z.object({
  projectId: z.string().uuid(),
  reviewId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export const projectListFiltersSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z.enum(["active", "archived", "all"]).optional().default("active"),
});

export const reviewListFiltersSchema = z.object({
  q: z.string().trim().max(120).optional().default(""),
  status: z
    .enum(["all", "archived", ...REVIEW_STATUSES])
    .optional()
    .default("all"),
});

export const environmentNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an environment name.")
  .max(
    ENVIRONMENT_NAME_MAX_LENGTH,
    `Enter a shorter environment name (up to ${ENVIRONMENT_NAME_MAX_LENGTH} characters).`,
  );

export const createEnvironmentSchema = z
  .object({
    projectId: z.string().uuid(),
    name: environmentNameSchema,
    kind: z.enum(ENVIRONMENT_KINDS),
    websiteUrl: z.string().max(WEBSITE_URL_MAX_LENGTH),
  })
  .superRefine((value, ctx) => {
    const result = normalizeWebsiteUrl(value.websiteUrl);
    if (!result.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["websiteUrl"],
        message: result.message,
      });
    }
  });
