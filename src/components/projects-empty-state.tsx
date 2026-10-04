import { FolderPlus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export function ProjectsEmptyState({
  onCreateProject,
}: {
  onCreateProject?: () => void;
}) {
  return (
    <EmptyState
      icon={<FolderPlus className="size-8" />}
      title="No projects yet"
      description="Create a project when you’re ready to share a website or video for review."
      action={
        onCreateProject ? (
          <Button type="button" onClick={onCreateProject}>
            Create project
          </Button>
        ) : undefined
      }
    />
  );
}
