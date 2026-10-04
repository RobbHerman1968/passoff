"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  canDeleteProjects,
  requireWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/workspaces/context";
import { withNotice } from "@/lib/projects/notices";
import {
  createProjectSchema,
  createReviewSchema,
  deleteProjectSchema,
  projectVersionActionSchema,
  renameProjectSchema,
  renameReviewSchema,
  reviewVersionActionSchema,
  zodFieldErrors,
  type FieldErrors,
} from "@/lib/projects/schemas";
import {
  getWebsiteInstallationForReview,
  setWebsiteInstallationEnabled,
  type WebsiteInstallationDetail,
} from "@/lib/installations/service";
import {
  analyzeWebsiteForReview,
  getLatestWebsiteAnalysis,
} from "@/lib/website-analysis/service";
import type { WebsiteAnalysisPublic } from "@/lib/website-analysis/types";
import {
  archiveProject,
  archiveReview,
  createProject,
  createWebsiteReview,
  getProjectForWorkspace,
  getReviewForWorkspace,
  renameProject,
  renameReview,
  restoreProject,
  restoreReview,
  softDeleteProject,
} from "@/lib/projects/service";
import { normalizeWebsiteUrl } from "@/lib/projects/urls";
import {
  createShareLink,
  revokeShareLink,
} from "@/lib/reviews/share-links";

export type ProjectActionResult = {
  status: "idle" | "error" | "success" | "conflict" | "forbidden" | "unavailable";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  version?: number;
};

const CONFLICT_MESSAGE =
  "This changed while you were editing. Review the latest version and try again.";

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function requireMutableContext(): Promise<
  | { ok: true; context: WorkspaceContext }
  | { ok: false; result: ProjectActionResult }
> {
  const result = await requireWorkspaceContext();
  if (!result.ok) {
    return {
      ok: false,
      result: {
        status: "forbidden",
        message:
          result.reason === "unauthenticated"
            ? "Sign in to continue."
            : "You don’t have access to this workspace.",
      },
    };
  }
  return { ok: true, context: result.context };
}

export async function createProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const values = { name: formString(formData, "name") };
  const parsed = createProjectSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the project name and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values,
    };
  }

  const created = await createProject(auth.context, parsed.data.name);
  if (!created.ok) {
    return {
      status: created.error === "forbidden" ? "forbidden" : "unavailable",
      message:
        created.message ??
        "We couldn’t create this project. Your project name is still here. Try again.",
      values,
    };
  }

  revalidatePath("/dashboard");
  redirect(
    withNotice(`/projects/${created.project.id}`, "project-created"),
  );
}

export async function renameProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const values = {
    projectId: formString(formData, "projectId"),
    name: formString(formData, "name"),
    version: formString(formData, "version"),
  };
  const parsed = renameProjectSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the project name and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: { name: values.name, version: values.version },
    };
  }

  const result = await renameProject(auth.context, parsed.data);
  if (!result.ok) {
    if (result.error === "conflict") {
      return {
        status: "conflict",
        message: CONFLICT_MESSAGE,
        values: {
          name: result.project?.name ?? values.name,
          version: String(result.project?.version ?? values.version),
        },
        version: result.project?.version,
      };
    }
    return {
      status: result.error === "forbidden" ? "forbidden" : "error",
      message:
        result.error === "archived_readonly"
          ? "Restore this project before renaming it."
          : "We couldn’t update the project name. Your entry is still here. Try again.",
      values: { name: values.name, version: values.version },
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(
    withNotice(`/projects/${parsed.data.projectId}`, "project-renamed"),
  );
}

export async function archiveProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const parsed = projectVersionActionSchema.safeParse({
    projectId: formString(formData, "projectId"),
    version: formString(formData, "version"),
  });
  if (!parsed.success) {
    return { status: "error", message: "We couldn’t archive this project. Try again." };
  }

  const result = await archiveProject(auth.context, parsed.data);
  if (!result.ok) {
    return {
      status: result.error === "conflict" ? "conflict" : "error",
      message:
        result.error === "conflict"
          ? CONFLICT_MESSAGE
          : "We couldn’t archive this project. Try again.",
      version: result.project?.version,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(withNotice("/dashboard?status=archived", "project-archived"));
}

export async function restoreProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const parsed = projectVersionActionSchema.safeParse({
    projectId: formString(formData, "projectId"),
    version: formString(formData, "version"),
  });
  if (!parsed.success) {
    return { status: "error", message: "We couldn’t restore this project. Try again." };
  }

  const result = await restoreProject(auth.context, parsed.data);
  if (!result.ok) {
    return {
      status: result.error === "conflict" ? "conflict" : "error",
      message:
        result.error === "conflict"
          ? CONFLICT_MESSAGE
          : "We couldn’t restore this project. Try again.",
      version: result.project?.version,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(
    withNotice(`/projects/${parsed.data.projectId}`, "project-restored"),
  );
}

export async function deleteProjectAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  if (!canDeleteProjects(auth.context)) {
    return {
      status: "forbidden",
      message: "Only the workspace owner can delete a project.",
    };
  }

  const values = {
    projectId: formString(formData, "projectId"),
    version: formString(formData, "version"),
    confirmationName: formString(formData, "confirmationName"),
  };
  const parsed = deleteProjectSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Type the project name exactly to confirm deletion.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: { confirmationName: values.confirmationName },
    };
  }

  const result = await softDeleteProject(auth.context, parsed.data);
  if (!result.ok) {
    return {
      status:
        result.error === "conflict"
          ? "conflict"
          : result.error === "forbidden"
            ? "forbidden"
            : "error",
      message:
        result.message ??
        (result.error === "conflict"
          ? CONFLICT_MESSAGE
          : "We couldn’t delete this project. Try again."),
      values: { confirmationName: values.confirmationName },
      version: result.project?.version,
    };
  }

  revalidatePath("/dashboard");
  redirect(withNotice("/dashboard", "project-deleted"));
}

export async function createReviewAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const values = {
    projectId: formString(formData, "projectId"),
    name: formString(formData, "name"),
    websiteUrl: formString(formData, "websiteUrl"),
  };
  const parsed = createReviewSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the review details and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values,
    };
  }

  const normalized = normalizeWebsiteUrl(parsed.data.websiteUrl);
  if (!normalized.ok) {
    return {
      status: "error",
      message: "Check the website address and try again.",
      fieldErrors: { websiteUrl: normalized.message },
      values,
    };
  }

  const created = await createWebsiteReview(auth.context, {
    projectId: parsed.data.projectId,
    name: parsed.data.name,
    websiteUrl: parsed.data.websiteUrl,
  });
  if (!created.ok) {
    return {
      status:
        created.error === "forbidden"
          ? "forbidden"
          : created.error === "archived_readonly"
            ? "error"
            : "unavailable",
      message:
        created.message ??
        (created.error === "archived_readonly"
          ? "Restore this project before adding a review."
          : "We couldn’t add this review. Your details are still here. Try again."),
      values,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(
    withNotice(
      `/projects/${created.review.projectId}/reviews/${created.review.id}`,
      "website-review-added",
    ),
  );
}

export async function renameReviewAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const values = {
    projectId: formString(formData, "projectId"),
    reviewId: formString(formData, "reviewId"),
    name: formString(formData, "name"),
    version: formString(formData, "version"),
  };
  const parsed = renameReviewSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the review name and try again.",
      fieldErrors: zodFieldErrors(parsed.error),
      values: { name: values.name, version: values.version },
    };
  }

  const result = await renameReview(auth.context, parsed.data);
  if (!result.ok) {
    if (result.error === "conflict") {
      return {
        status: "conflict",
        message: CONFLICT_MESSAGE,
        values: {
          name: result.review?.name ?? values.name,
          version: String(result.review?.version ?? values.version),
        },
        version: result.review?.version,
      };
    }
    return {
      status: "error",
      message:
        result.error === "archived_readonly"
          ? "Restore this review before renaming it."
          : "We couldn’t update the review name. Your entry is still here. Try again.",
      values: { name: values.name, version: values.version },
    };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(
    `/projects/${parsed.data.projectId}/reviews/${parsed.data.reviewId}`,
  );
  redirect(
    withNotice(
      `/projects/${parsed.data.projectId}/reviews/${parsed.data.reviewId}`,
      "review-renamed",
    ),
  );
}

export async function archiveReviewAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const parsed = reviewVersionActionSchema.safeParse({
    projectId: formString(formData, "projectId"),
    reviewId: formString(formData, "reviewId"),
    version: formString(formData, "version"),
  });
  if (!parsed.success) {
    return { status: "error", message: "We couldn’t archive this review. Try again." };
  }

  const result = await archiveReview(auth.context, parsed.data);
  if (!result.ok) {
    return {
      status: result.error === "conflict" ? "conflict" : "error",
      message:
        result.error === "conflict"
          ? CONFLICT_MESSAGE
          : "We couldn’t archive this review. Try again.",
      version: result.review?.version,
    };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(
    `/projects/${parsed.data.projectId}/reviews/${parsed.data.reviewId}`,
  );
  redirect(
    withNotice(`/projects/${parsed.data.projectId}`, "review-archived"),
  );
}

export async function restoreReviewAction(
  _prev: ProjectActionResult,
  formData: FormData,
): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return auth.result;

  const parsed = reviewVersionActionSchema.safeParse({
    projectId: formString(formData, "projectId"),
    reviewId: formString(formData, "reviewId"),
    version: formString(formData, "version"),
  });
  if (!parsed.success) {
    return { status: "error", message: "We couldn’t restore this review. Try again." };
  }

  const result = await restoreReview(auth.context, parsed.data);
  if (!result.ok) {
    return {
      status: result.error === "conflict" ? "conflict" : "error",
      message:
        result.error === "conflict"
          ? CONFLICT_MESSAGE
          : "We couldn’t restore this review. Try again.",
      version: result.review?.version,
    };
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath(
    `/projects/${parsed.data.projectId}/reviews/${parsed.data.reviewId}`,
  );
  redirect(
    withNotice(
      `/projects/${parsed.data.projectId}/reviews/${parsed.data.reviewId}`,
      "review-restored",
    ),
  );
}

export async function loadProjectVersion(projectId: string) {
  const auth = await requireMutableContext();
  if (!auth.ok) return null;
  return getProjectForWorkspace(auth.context, projectId);
}

export async function loadReviewVersion(projectId: string, reviewId: string) {
  const auth = await requireMutableContext();
  if (!auth.ok) return null;
  return getReviewForWorkspace(auth.context, projectId, reviewId);
}

export type InstallationActionResult = {
  status: "idle" | "error" | "success" | "forbidden" | "unavailable";
  message?: string;
  installation?: WebsiteInstallationDetail;
};

export async function checkWebsiteInstallationAction(input: {
  projectId: string;
  reviewId: string;
}): Promise<InstallationActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      status: auth.reason === "unauthenticated" ? "forbidden" : "unavailable",
      message: "Sign in to check this website installation.",
    };
  }

  try {
    const installation = await getWebsiteInstallationForReview(
      auth.context,
      input.projectId,
      input.reviewId,
    );
    if (!installation) {
      return {
        status: "error",
        message: "We couldn’t find website setup for this review.",
      };
    }
    return { status: "success", installation };
  } catch {
    return {
      status: "unavailable",
      message: "We couldn’t check the installation right now. Try again.",
    };
  }
}

export type WebsiteAnalysisActionResult = {
  status:
    | "idle"
    | "error"
    | "success"
    | "forbidden"
    | "unavailable"
    | "rate_limited"
    | "in_progress";
  message?: string;
  analysis?: WebsiteAnalysisPublic;
  retryAfterSeconds?: number;
};

export async function analyzeWebsiteAction(input: {
  projectId: string;
  reviewId: string;
  force?: boolean;
  manualPlatform?: string;
}): Promise<WebsiteAnalysisActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) {
    return { status: "forbidden", message: auth.result.message };
  }

  const result = await analyzeWebsiteForReview(auth.context, {
    projectId: input.projectId,
    reviewId: input.reviewId,
    force: input.force,
    manualPlatform: input.manualPlatform,
  });

  if (!result.ok) {
    return {
      status:
        result.error === "forbidden"
          ? "forbidden"
          : result.error === "rate_limited"
            ? "rate_limited"
            : result.error === "in_progress"
              ? "in_progress"
              : result.error === "not_found"
                ? "error"
                : "unavailable",
      message: result.message,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  return {
    status: "success",
    analysis: result.analysis,
    message: result.analysis.message ?? undefined,
  };
}

export async function loadWebsiteAnalysisAction(input: {
  projectId: string;
  reviewId: string;
}): Promise<WebsiteAnalysisActionResult> {
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return {
      status: auth.reason === "unauthenticated" ? "forbidden" : "unavailable",
      message: "Sign in to view website analysis.",
    };
  }

  try {
    const analysis = await getLatestWebsiteAnalysis(
      auth.context,
      input.projectId,
      input.reviewId,
    );
    return { status: "success", analysis: analysis ?? undefined };
  } catch {
    return {
      status: "unavailable",
      message: "We couldn’t load website analysis right now.",
    };
  }
}

export async function setWebsiteInstallationEnabledAction(input: {
  projectId: string;
  reviewId: string;
  enabled: boolean;
}): Promise<InstallationActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return { status: "forbidden", message: auth.result.message };

  const result = await setWebsiteInstallationEnabled(auth.context, input);
  if (!result.ok) {
    return {
      status:
        result.error === "forbidden"
          ? "forbidden"
          : result.error === "not_found"
            ? "error"
            : "unavailable",
      message:
        result.message ??
        (input.enabled
          ? "We couldn’t enable Passoff for this website. Try again."
          : "We couldn’t disable Passoff for this website. Try again."),
    };
  }

  revalidatePath(
    `/projects/${input.projectId}/reviews/${input.reviewId}`,
  );
  return {
    status: "success",
    installation: result.installation,
    message: input.enabled
      ? "Passoff is enabled for this website."
      : "Passoff is disabled for this website.",
  };
}

export async function createShareLinkAction(input: {
  projectId: string;
  reviewId: string;
}): Promise<
  ProjectActionResult & {
    url?: string;
  }
> {
  const auth = await requireMutableContext();
  if (!auth.ok) return { status: "forbidden", message: auth.result.message };

  const created = await createShareLink(auth.context, {
    projectId: input.projectId,
    reviewId: input.reviewId,
    canComment: true,
  });

  if (!created.ok) {
    return {
      status:
        created.error === "forbidden"
          ? "forbidden"
          : created.error === "not_found"
            ? "error"
            : created.error === "validation"
              ? "error"
              : "unavailable",
      message:
        created.message ??
        "We couldn’t create a guest link. Try again.",
    };
  }

  revalidatePath(`/projects/${input.projectId}/reviews/${input.reviewId}`);
  return {
    status: "success",
    url: created.url,
    message: "Guest link ready.",
  };
}

export async function revokeShareLinkAction(input: {
  projectId: string;
  reviewId: string;
  shareLinkId: string;
}): Promise<ProjectActionResult> {
  const auth = await requireMutableContext();
  if (!auth.ok) return { status: "forbidden", message: auth.result.message };

  const revoked = await revokeShareLink(auth.context, input);
  if (!revoked.ok) {
    return {
      status: revoked.error === "forbidden" ? "forbidden" : "error",
      message: "We couldn’t turn off that guest link. Try again.",
    };
  }

  revalidatePath(`/projects/${input.projectId}/reviews/${input.reviewId}`);
  return {
    status: "success",
    message: "Guest link turned off.",
  };
}
