import type { Metadata } from "next";

import { ReviewLaunchForm } from "@/app/r/[token]/launch-form";
import { LogoMark } from "@/components/logo";
import { resolveShareLinkToken } from "@/lib/reviews/share-links";
import { getReviewForSharePage } from "@/lib/reviews/share-page";

type RouteParams = Promise<{ token: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}): Promise<Metadata> {
  const { token } = await params;
  const resolved = await resolveShareLinkToken(token);
  if (!resolved.ok) {
    return { title: "Review link unavailable" };
  }
  const detail = await getReviewForSharePage(resolved.reviewId, resolved.workspaceId);
  return {
    title: detail ? `Open ${detail.name}` : "Open website review",
    robots: { index: false, follow: false },
  };
}

function unavailableCopy(
  reason: "invalid" | "expired" | "revoked" | "closed" | "archived" | "disabled",
) {
  switch (reason) {
    case "expired":
      return {
        title: "Review link expired",
        body: "This review link has expired. Ask the team for a new link.",
      };
    case "revoked":
      return {
        title: "Review link turned off",
        body: "This review link was turned off. Ask the team for a new link.",
      };
    case "closed":
      return {
        title: "Review closed",
        body: "This review is closed, so it can’t be opened.",
      };
    case "archived":
      return {
        title: "Review unavailable",
        body: "This review isn’t available anymore.",
      };
    case "disabled":
      return {
        title: "Passoff is turned off",
        body: "Passoff is turned off for this website right now.",
      };
    default:
      return {
        title: "Review link unavailable",
        body: "This review link isn’t valid.",
      };
  }
}

export default async function ReviewLaunchPage({
  params,
}: {
  params: RouteParams;
}) {
  const { token } = await params;
  const resolved = await resolveShareLinkToken(token);

  if (!resolved.ok) {
    const copy = unavailableCopy(resolved.reason);
    return (
      <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center px-4 py-10">
        <div className="mb-8">
          <LogoMark
            width={40}
            height={25}
            className="text-foreground"
          />
        </div>
        <div className="mx-auto w-full max-w-md space-y-3 text-center">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            {copy.title}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{copy.body}</p>
        </div>
      </main>
    );
  }

  const detail = await getReviewForSharePage(resolved.reviewId, resolved.workspaceId);
  let websiteHost = "the website";
  try {
    websiteHost = new URL(resolved.startingUrl).host;
  } catch {
    // keep fallback
  }

  return (
    <main className="bg-background text-foreground flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8">
        <LogoMark
          width={40}
          height={25}
          className="text-foreground"
        />
      </div>
      <ReviewLaunchForm
        token={token}
        reviewName={detail?.name ?? "this review"}
        websiteHost={websiteHost}
      />
    </main>
  );
}
