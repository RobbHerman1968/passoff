"use client";

import { useState } from "react";

import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { Button } from "@/components/ui/button";

export function DashboardCreateProjectButton() {
  const [open, setOpen] = useState(false);

  return (
    <CreateProjectDialog
      open={open}
      onOpenChange={setOpen}
      trigger={<Button type="button">Create project</Button>}
    />
  );
}
