import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "We couldn't load this page",
  description = "Something went wrong while opening this page. Try again, or go back to your projects.",
  onRetry,
  onGoToProjects,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  onGoToProjects?: () => void;
}) {
  return (
    <EmptyState
      icon={<AlertCircle className="size-8" />}
      title={title}
      description={description}
      action={
        <>
          {onRetry ? (
            <Button type="button" onClick={onRetry}>
              Try again
            </Button>
          ) : (
            <Button asChild>
              <Link href="/dashboard">Try again</Link>
            </Button>
          )}
          {onGoToProjects ? (
            <Button type="button" variant="outline" onClick={onGoToProjects}>
              Go to projects
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/dashboard">Go to projects</Link>
            </Button>
          )}
        </>
      }
    />
  );
}
