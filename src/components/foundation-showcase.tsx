"use client";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { LoadingState } from "@/components/loading-state";
import { OfflineState } from "@/components/offline-state";
import { PageHeader } from "@/components/page-header";
import { PermissionDeniedState } from "@/components/permission-denied-state";
import { ProjectsEmptyState } from "@/components/projects-empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ISSUE_STATUSES } from "@/lib/issues/statuses";

export function FoundationShowcase() {
  return (
    <main className="content-width mx-auto page-padding grid gap-12 pb-16">
      <header className="grid gap-3">
        <p className="type-supporting">Development only</p>
        <h1 className="type-page-title">Foundation showcase</h1>
        <p className="type-body max-w-prose">
          Inspect Passoff colors, type, controls, and shared states before
          building account, project, and review screens.
        </p>
      </header>

      <ShowcaseSection
        id="typography"
        title="Typography"
        description="Page titles, section titles, body copy, and supporting text."
      >
        <h2 className="type-page-title">Review the real website</h2>
        <h3 className="type-section-title">What reviewers need next</h3>
        <p className="type-body max-w-prose">
          Open the real work, point to what needs attention, and pass clear
          feedback to the person who can fix it.
        </p>
        <p className="type-supporting">
          Supporting text stays quieter than the main request.
        </p>
      </ShowcaseSection>

      <ShowcaseSection
        id="colors"
        title="Colors"
        description="Semantic tokens for surfaces, actions, and feedback."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Swatch name="Page" className="bg-background text-foreground" />
          <Swatch name="Card" className="bg-card text-card-foreground" />
          <Swatch name="Muted" className="bg-muted text-muted-foreground" />
          <Swatch name="Primary" className="bg-primary text-primary-foreground" />
          <Swatch name="Information" className="bg-info text-info-foreground" />
          <Swatch name="Success" className="bg-success text-success-foreground" />
          <Swatch name="Warning" className="bg-warning text-warning-foreground" />
          <Swatch
            name="Danger"
            className="bg-destructive text-destructive-foreground"
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="controls"
        title="Buttons and form controls"
        description="Persistent labels, inline errors, and keyboard-visible focus."
      >
        <div className="flex flex-wrap gap-3">
          <Button>Share review</Button>
          <Button variant="outline">Add feedback</Button>
          <Button variant="secondary">Ask for approval</Button>
          <Button variant="ghost">Mark as resolved</Button>
          <Button variant="destructive">Delete project</Button>
          <Button disabled>Saving changes</Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Help">
                ?
              </Button>
            </TooltipTrigger>
            <TooltipContent>Help with this review</TooltipContent>
          </Tooltip>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Project details</CardTitle>
            <CardDescription>
              Every field keeps its label after you start typing.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <FormField
              id="project-name"
              label="Project name"
              description="Use the client or campaign name so teammates can find it."
            >
              <Input name="project-name" autoComplete="off" />
            </FormField>
            <FormField
              id="review-summary"
              label="Review summary"
              error="Add a short summary so reviewers know what to look at."
            >
              <Textarea name="review-summary" />
            </FormField>
          </CardContent>
        </Card>
      </ShowcaseSection>

      <ShowcaseSection
        id="statuses"
        title="Status badges"
        description="Each status has a written label. Color only reinforces it."
      >
        <div className="flex flex-wrap gap-2">
          {ISSUE_STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="states"
        title="Product states"
        description="Empty, loading, error, offline, and permission-denied patterns."
      >
        <div className="grid gap-6">
          <ProjectsEmptyState onCreateProject={() => undefined} />
          <LoadingState />
          <ErrorState />
          <OfflineState />
          <PermissionDeniedState />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="dialogs"
        title="Dialogs and sheets"
        description="Focus stays inside while open and returns when closed."
      >
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open review details</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Review details</DialogTitle>
                <DialogDescription>
                  This review is open for client feedback until Friday.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            title="Delete this project?"
            description="This will permanently remove the Acme website review and its feedback. This cannot be undone."
            confirmLabel="Delete project"
            trigger={<Button variant="destructive">Delete project</Button>}
          />
        </div>
      </ShowcaseSection>

      <ShowcaseSection
        id="shell"
        title="Page header"
        description="Breadcrumbs, page title, status, secondary actions, and one primary action. The app shell itself lives in the signed-in layout."
      >
        <div className="rounded-xl border border-border bg-background p-4">
          <PageHeader
            headingLevel={2}
            title="Homepage review"
            breadcrumbs={[
              { href: "#shell", label: "Projects" },
              { href: "#shell", label: "Acme Launch" },
              { label: "Homepage review" },
            ]}
            description="Production · Version 2026-10-04"
            status={<StatusBadge status="ready_for_verification" />}
            primaryAction={<Button>Add review</Button>}
          />
        </div>
      </ShowcaseSection>
    </main>
  );
}

function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="grid gap-1">
        <h2 id={`${id}-title`} className="type-section-title">
          {title}
        </h2>
        <p className="type-supporting">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div
      className={`flex min-h-20 items-end rounded-lg border border-border p-3 text-sm font-medium ${className}`}
    >
      {name}
    </div>
  );
}
