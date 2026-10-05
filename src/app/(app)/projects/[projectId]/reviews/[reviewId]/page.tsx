import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import type { ReactNode } from "react";

import { ErrorState } from "@/components/error-state";
import { IssueTriage } from "@/components/issues/issue-triage";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { ReviewActionsMenu } from "@/components/reviews/review-actions-menu";
import { ShareReviewPanel } from "@/components/reviews/share-review-panel";
import { WebsiteSetupPanel } from "@/components/reviews/website-setup-panel";
import { SetupChecklist, type SetupStep } from "@/components/setup-checklist";
import { SuccessNotice } from "@/components/success-notice";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ProjectStatusBadge,
  ReviewStatusBadge,
} from "@/components/workflow-status-badge";
import { getPassoffEmbedBaseUrl } from "@/lib/installations/embed-config";
import { buildInstallSnippet } from "@/lib/installations/snippet";
import {
  resolveInstallationStatus,
  type InstallationStatus,
} from "@/lib/installations/status";
import {
  getIssuePreviewForReview,
  listIssuesForReview,
} from "@/lib/issues/list";
import { parseIssueListSearchParams } from "@/lib/issues/schemas";
import { listShareLinksForReview } from "@/lib/reviews/share-links";
import { requireWorkspaceContext } from "@/lib/workspaces/context";
import {
  formatOpenIssueCount,
  formatRelativeActivity,
  formatVersionLabel,
} from "@/lib/projects/format";
import { getReviewForWorkspace } from "@/lib/projects/service";

type RouteParams = Promise<{ projectId: string; reviewId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { projectId, reviewId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    return { title: "Review" };
  }
  const review = await getReviewForWorkspace(auth.context, projectId, reviewId);
  return {
    title: review ? `${review.name} · ${review.projectName}` : "Review unavailable",
    description: "Review setup, issues, and current status.",
  };
}

const INSTALL_STEP_COPY: Record<InstallationStatus, string> = {
  installed: "Passoff is on the website and ready to collect issues.",
  checking: "Checking the website for Passoff…",
  not_detected:
    "Open Website setup, copy the install code into the site, then check again after it’s deployed.",
  needs_attention:
    "Passoff was seen once but not recently. Make sure the install code is still on the deployed site, then check again.",
  disabled:
    "Passoff is turned off for this website. Turn it back on from Website setup when you’re ready for feedback.",
};

export default async function ReviewDetailPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { projectId, reviewId } = await params;
  const auth = await requireWorkspaceContext();
  if (!auth.ok) {
    if (auth.reason === "unauthenticated") {
      redirect(
        `/sign-in?callbackUrl=/projects/${projectId}/reviews/${reviewId}`,
      );
    }
    redirect("/onboarding");
  }

  const review = await getReviewForWorkspace(auth.context, projectId, reviewId);
  if (!review) {
    return (
      <>
        <PageHeader
          title="Review unavailable"
          description="This review isn’t available in your workspace."
          breadcrumbs={[
            { href: "/dashboard", label: "Projects" },
            { label: "Unavailable" },
          ]}
        />
        <PermissionDeniedState />
      </>
    );
  }

  const paramsRecord = await searchParams;
  const notice =
    typeof paramsRecord.notice === "string" ? paramsRecord.notice : undefined;
  const issueFilters = parseIssueListSearchParams(paramsRecord);
  const archived = Boolean(review.archivedAt);
  const projectArchived = review.projectStatus === "archived";
  const readOnly = archived || projectArchived;

  const embed = getPassoffEmbedBaseUrl();
  let installSnippet: string | null = null;
  if (embed.ok && review.websitePublicKey) {
    try {
      installSnippet = buildInstallSnippet({
        installationKey: review.websitePublicKey,
        embedBaseUrl: embed.baseUrl,
      });
    } catch {
      installSnippet = null;
    }
  }

  const installStatus: InstallationStatus | null = review.websitePublicKey
    ? resolveInstallationStatus({
        isEnabled: Boolean(review.websiteIsEnabled),
        verifiedAt: review.websiteVerifiedAt ?? null,
        lastSeenAt: review.websiteLastSeenAt ?? null,
        allowedOrigins: review.websiteAllowedOrigins ?? [],
      })
    : null;
  const installed = installStatus === "installed";
  const shareLinks = await listShareLinksForReview(auth.context, review.id);
  const hasActiveShareLink = shareLinks.some((link) => !link.revokedAt);

  let issueListError = false;
  let issueList = null as Awaited<ReturnType<typeof listIssuesForReview>>;
  let selectedIssue = null as Awaited<
    ReturnType<typeof getIssuePreviewForReview>
  >;
  try {
    issueList = await listIssuesForReview(
      auth.context,
      review.projectId,
      review.id,
      issueFilters,
    );
    if (issueFilters.issue) {
      selectedIssue = await getIssuePreviewForReview(
        auth.context,
        review.projectId,
        review.id,
        issueFilters.issue,
      );
    }
  } catch {
    issueListError = true;
  }

  const steps: SetupStep[] = [
    {
      id: "address",
      title: "Add the website address",
      description: review.websiteStartingUrl ?? "Address saved with this review.",
      state: "done",
    },
    {
      id: "install",
      title: "Install Passoff on the website",
      description: installStatus
        ? INSTALL_STEP_COPY[installStatus]
        : "Website details aren’t available for this review yet.",
      state: installed ? "done" : "current",
    },
    {
      id: "share",
      title: "Share the review with your client",
      description: hasActiveShareLink
        ? "A guest link is ready. Reviewers open it on Passoff, then continue to the website."
        : "Create a guest link so your client can open the website review securely.",
      state: installed ? (hasActiveShareLink ? "done" : "current") : "upcoming",
    },
    {
      id: "verify",
      title: "Fix and verify issues",
      description:
        "Issues arrive below with their page and screenshot. Move each one to Ready for verification, then confirm it’s fixed.",
      state: "upcoming",
    },
  ];

  return (
    <>
      <PageHeader
        title={review.name}
        breadcrumbs={[
          { href: "/dashboard", label: "Projects" },
          { href: `/projects/${review.projectId}`, label: review.projectName },
          { label: review.name },
        ]}
        status={
          <span className="flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={review.status} archived={archived} />
            {projectArchived ? <ProjectStatusBadge status="archived" /> : null}
          </span>
        }
        description={
          <>
            {review.environmentName} ·{" "}
            {formatVersionLabel(review.deploymentIdentifier, review.isHistorical)}
          </>
        }
        primaryAction={
          !readOnly && review.websitePublicKey ? (
            <ShareReviewPanel
              projectId={review.projectId}
              reviewId={review.id}
              links={shareLinks.map((link) => ({
                id: link.id,
                canComment: link.canComment,
                expiresAt: link.expiresAt?.toISOString() ?? null,
                revokedAt: link.revokedAt?.toISOString() ?? null,
                createdAt: link.createdAt.toISOString(),
                lastOpenedAt: link.lastOpenedAt?.toISOString() ?? null,
              }))}
              disabled={readOnly}
            />
          ) : undefined
        }
        secondaryActions={
          <ReviewActionsMenu
            projectId={review.projectId}
            reviewId={review.id}
            reviewName={review.name}
            version={review.version}
            archived={archived}
            disabled={projectArchived}
          />
        }
      />
      <SuccessNotice notice={notice} />

      {readOnly ? (
        <Alert className="mb-6">
          <Archive aria-hidden="true" />
          <AlertTitle>
            {projectArchived ? "This project is archived" : "This review is archived"}
          </AlertTitle>
          <AlertDescription>
            {projectArchived
              ? "Restore the project to change this review or its website setup."
              : "Restore the review from its menu to change it or collect new issues."}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6">
        {!installed && !readOnly ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            <SetupChecklist
              headingId="review-setup-heading"
              title="Get this review ready"
              description="Finish these steps so your client can start pinning issues."
              steps={steps}
            />
            <aside aria-label="Review details" className="grid min-w-0 gap-4">
              <ReviewDetailsAside
                review={review}
                installSnippet={installSnippet}
                embedConfigured={embed.ok}
                readOnly={readOnly}
              />
            </aside>
          </div>
        ) : (
          <aside
            aria-label="Review details"
            className="grid min-w-0 gap-4 md:grid-cols-2"
          >
            <ReviewDetailsAside
              review={review}
              installSnippet={installSnippet}
              embedConfigured={embed.ok}
              readOnly={readOnly}
            />
          </aside>
        )}

        <section aria-labelledby="issues-heading" className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="issues-heading" className="type-section-title">
              Issues
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatOpenIssueCount(review.openIssueCount)}
            </p>
          </div>
          {issueListError || !issueList ? (
            <ErrorState
              title="We couldn’t load issues"
              description="Something went wrong while loading issues for this review. Try again in a moment."
            />
          ) : (
            <IssueTriage
              projectId={review.projectId}
              reviewId={review.id}
              pathname={`/projects/${review.projectId}/reviews/${review.id}`}
              filters={issueFilters}
              issues={issueList.items}
              total={issueList.total}
              page={issueList.page}
              pageCount={issueList.pageCount}
              facets={issueList.facets}
              selectedIssueNumber={issueFilters.issue}
              selectedIssue={
                selectedIssue && selectedIssue !== "unavailable"
                  ? selectedIssue
                  : null
              }
              selectedUnavailable={
                Boolean(issueFilters.issue) && selectedIssue === "unavailable"
              }
              installed={installed}
            />
          )}
        </section>
      </div>
    </>
  );
}

function ReviewDetailsAside({
  review,
  installSnippet,
  embedConfigured,
  readOnly,
}: {
  review: NonNullable<Awaited<ReturnType<typeof getReviewForWorkspace>>>;
  installSnippet: string | null;
  embedConfigured: boolean;
  readOnly: boolean;
}) {
  return (
    <>
      {review.websitePublicKey ? (
        <WebsiteSetupPanel
          projectId={review.projectId}
          reviewId={review.id}
          startingUrl={review.websiteStartingUrl ?? ""}
          allowedOrigins={review.websiteAllowedOrigins ?? []}
          publicKey={review.websitePublicKey}
          isEnabled={Boolean(review.websiteIsEnabled)}
          verifiedAt={review.websiteVerifiedAt?.toISOString() ?? null}
          lastSeenAt={review.websiteLastSeenAt?.toISOString() ?? null}
          installSnippet={installSnippet}
          embedConfigured={embedConfigured}
          disabled={readOnly}
        />
      ) : (
        <section
          aria-labelledby="website-setup-heading"
          className="rounded-xl border border-border bg-card p-4 text-card-foreground"
        >
          <h2 id="website-setup-heading" className="type-section-title">
            Website setup needs attention
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Website details aren’t available for this review. Add a new review
            with the website address to continue.
          </p>
        </section>
      )}

      <section
        aria-labelledby="review-details-heading"
        className="rounded-xl border border-border bg-card p-4 text-card-foreground"
      >
        <h2 id="review-details-heading" className="type-section-title">
          Details
        </h2>
        <dl className="mt-3 grid gap-3 text-sm">
          <DetailRow label="Project" value={review.projectName} />
          <DetailRow label="Environment" value={review.environmentName} />
          <DetailRow
            label="Version"
            value={formatVersionLabel(
              review.deploymentIdentifier,
              review.isHistorical,
            )}
          />
          <DetailRow label="Owner" value={review.ownerName} />
          <DetailRow
            label="Last activity"
            value={
              <time dateTime={review.updatedAt.toISOString()}>
                {formatRelativeActivity(review.updatedAt)}
              </time>
            }
          />
        </dl>
      </section>
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}
