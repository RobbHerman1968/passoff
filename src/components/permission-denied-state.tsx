import Link from "next/link";
import { Lock } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function PermissionDeniedState({
  onGoToProjects,
}: {
  onGoToProjects?: () => void;
}) {
  return (
    <EmptyState
      icon={<Lock className="size-8" />}
      title="You don't have access to this project"
      description="Ask a teammate to share the review, or go back to your projects."
      action={
        onGoToProjects ? (
          <Button type="button" onClick={onGoToProjects}>
            Go to projects
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Go to projects</Link>
          </Button>
        )
      }
    />
  );
}
