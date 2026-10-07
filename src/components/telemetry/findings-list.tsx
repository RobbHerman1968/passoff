"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  analyzeFindingAction,
  attachFindingToIssueAction,
  createIssueFromFindingAction,
  searchFindingIssuesAction,
  updateFindingDispositionAction,
} from "@/app/(app)/usability/actions";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FINDING_DISPOSITION_LABELS,
  FINDING_TYPE_LABELS,
  findingPrimaryAction,
} from "@/lib/findings/copy";
import type { BehavioralAiResult } from "@/lib/findings/ai-schema";
import type {
  BehavioralFindingDisposition,
  BehavioralFindingType,
} from "@/db/schema";
import type { IssuePriority } from "@/lib/issues/statuses";

type FindingCard = {
  id: string;
  findingType: BehavioralFindingType;
  title: string;
  explanation: string;
  uncertainty: string;
  normalizedRoute: string;
  deploymentVersion: string;
  viewportGroup: string;
  windowStart: string;
  windowEnd: string;
  eligibleSessionCount: number;
  eventCount: number;
  metricName: string;
  metricValue: string;
  denominatorName: string;
  denominatorValue: number;
  coverageStatus: string;
  dataQuality: string;
  disposition: BehavioralFindingDisposition;
  samplingPercent: number;
  relatedIssueHref: string | null;
  relatedIssueNumber: number | null;
  environmentName: string;
  investigationSteps: string[];
};

type ReviewOption = { id: string; name: string };
type MemberOption = { userId: string; displayName: string };

type AnalysisView = {
  id: string;
  status: string;
  modelId: string | null;
  createdAt: string;
  result: BehavioralAiResult | null;
};

export function FindingsList({
  findings,
  reviews,
  members,
  analysisByFindingId,
  aiUsage,
}: {
  findings: FindingCard[];
  reviews: ReviewOption[];
  members: MemberOption[];
  analysisByFindingId: Record<string, AnalysisView | undefined>;
  aiUsage: { used: number; limit: number };
}) {
  if (findings.length === 0) {
    return (
      <EmptyState
        title="No findings yet"
        description="Passoff creates findings from aggregate thresholds after enough eligible sessions. Findings are observations, not confirmed defects."
      />
    );
  }

  return (
    <div className="grid gap-4">
      <p className="type-supporting" role="status">
        Assisted analysis used {aiUsage.used} of {aiUsage.limit} requests this month.
      </p>
      <ul className="grid gap-4">
        {findings.map((finding) => (
          <li key={finding.id}>
            <FindingRow
              finding={finding}
              reviews={reviews}
              members={members}
              analysis={analysisByFindingId[finding.id] ?? null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FindingRow({
  finding,
  reviews,
  members,
  analysis,
}: {
  finding: FindingCard;
  reviews: ReviewOption[];
  members: MemberOption[];
  analysis: AnalysisView | null;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const metricPercent = `${(Number(finding.metricValue) * 100).toFixed(1)}%`;

  return (
    <article className="grid gap-3 rounded-xl border border-border bg-card p-4">
      <header className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {FINDING_TYPE_LABELS[finding.findingType]}
        </p>
        <h2 className="type-section-title">{finding.title}</h2>
      </header>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Route</dt>
          <dd>{finding.normalizedRoute}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Environment and version</dt>
          <dd>
            {finding.environmentName} · {finding.deploymentVersion || "unspecified"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Viewport</dt>
          <dd>{finding.viewportGroup}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Time window</dt>
          <dd>
            {finding.windowStart.slice(0, 10)} to {finding.windowEnd.slice(0, 10)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Sample</dt>
          <dd>{finding.eligibleSessionCount} eligible sessions</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Metric</dt>
          <dd>
            {metricPercent} of {finding.denominatorValue} {finding.denominatorName.replaceAll("_", " ")}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Coverage</dt>
          <dd>{finding.coverageStatus.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Disposition</dt>
          <dd>{FINDING_DISPOSITION_LABELS[finding.disposition]}</dd>
        </div>
      </dl>
      <p>{finding.explanation}</p>
      <p className="type-supporting">{finding.uncertainty}</p>
      {finding.relatedIssueHref ? (
        <p>
          Related issue:{" "}
          <Link className="underline" href={finding.relatedIssueHref}>
            Issue #{finding.relatedIssueNumber}
          </Link>
        </p>
      ) : (
        <p className="type-supporting">No related issue.</p>
      )}
      <p className="font-medium">{findingPrimaryAction(finding.disposition, finding.relatedIssueHref)}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setCreateOpen(true)}>
          Create issue
        </Button>
        <Button type="button" variant="outline" onClick={() => setAttachOpen(true)}>
          Attach to issue
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await analyzeFindingAction(finding.id);
              if (result.status === "error") toast.error(result.message);
              else toast.success(result.message);
            })
          }
        >
          Analyze evidence
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateFindingDispositionAction({
                findingId: finding.id,
                disposition: "dismissed",
              });
            })
          }
        >
          Dismiss
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await updateFindingDispositionAction({
                findingId: finding.id,
                disposition: "watching",
              });
            })
          }
        >
          Watch
        </Button>
      </div>
      {analysis?.result ? (
        <AiAnalysisCard analysis={analysis} finding={finding} />
      ) : null}
      <CreateIssueDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        finding={finding}
        reviews={reviews}
        members={members}
      />
      <AttachIssueDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        findingId={finding.id}
      />
    </article>
  );
}

function AiAnalysisCard({
  analysis,
  finding,
}: {
  analysis: AnalysisView;
  finding: FindingCard;
}) {
  const result = analysis.result;
  if (!result) return null;
  return (
    <section className="grid gap-2 rounded-lg border border-border p-3" aria-labelledby={`ai-${finding.id}`}>
      <h3 id={`ai-${finding.id}`} className="font-medium">
        AI-assisted analysis
      </h3>
      <p className="type-supporting">
        Generated {new Date(analysis.createdAt).toISOString()} · {analysis.modelId ?? "configured model"}
      </p>
      <p className="type-supporting">
        Evidence used: aggregate {finding.metricName} on {finding.normalizedRoute} ({finding.viewportGroup}).
      </p>
      <ListBlock title="Observed facts" items={result.observedFacts} />
      <ListBlock title="Hypotheses" items={result.possibleExplanations.map((item) => `Hypothesis: ${item}`)} />
      <ListBlock title="Missing information" items={result.missingInformation} />
      <ListBlock title="Suggested investigation" items={result.suggestedInvestigationSteps} />
      <ListBlock title="Suggested verification" items={result.suggestedVerificationSteps} />
      <p>
        Confidence: {result.confidence}. {result.limitations}
      </p>
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      <ul className="list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function CreateIssueDialog({
  open,
  onOpenChange,
  finding,
  reviews,
  members,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finding: FindingCard;
  reviews: ReviewOption[];
  members: MemberOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(finding.title);
  const [description, setDescription] = useState(finding.explanation);
  const [priority, setPriority] = useState<IssuePriority>("normal");
  const [reviewId, setReviewId] = useState(reviews[0]?.id ?? "");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [includeSteps, setIncludeSteps] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create issue from finding</DialogTitle>
          <DialogDescription>
            Review the suggested details. Passoff will not create the issue until you confirm.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await createIssueFromFindingAction({
                findingId: finding.id,
                reviewId,
                title,
                description,
                priority,
                assigneeUserId: assigneeUserId || null,
                includeInvestigationSteps: includeSteps,
                investigationSteps: finding.investigationSteps,
                confirmed: true,
              });
              if (result.status === "error") {
                toast.error(result.message);
                return;
              }
              toast.success(result.message);
              onOpenChange(false);
            });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`title-${finding.id}`}>Title</Label>
            <Input
              id={`title-${finding.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`body-${finding.id}`}>Description</Label>
            <Textarea
              id={`body-${finding.id}`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`priority-${finding.id}`}>Priority</Label>
            <select
              id={`priority-${finding.id}`}
              className="min-h-11 rounded-md border border-input bg-background px-3"
              value={priority}
              onChange={(event) => setPriority(event.target.value as IssuePriority)}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`assignee-${finding.id}`}>Assignee</Label>
            <select
              id={`assignee-${finding.id}`}
              className="min-h-11 rounded-md border border-input bg-background px-3"
              value={assigneeUserId}
              onChange={(event) => setAssigneeUserId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`review-${finding.id}`}>Review</Label>
            <select
              id={`review-${finding.id}`}
              className="min-h-11 rounded-md border border-input bg-background px-3"
              value={reviewId}
              onChange={(event) => setReviewId(event.target.value)}
              required
            >
              {reviews.map((review) => (
                <option key={review.id} value={review.id}>
                  {review.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={includeSteps}
              onChange={(event) => setIncludeSteps(event.target.checked)}
            />
            Include suggested investigation steps
          </label>
          <Button type="submit" disabled={pending || !reviewId}>
            Create issue
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttachIssueDialog({
  open,
  onOpenChange,
  findingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingId: string;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<
    Array<{ id: string; number: number; displayTitle: string; href: string }>
  >([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) {
          startTransition(async () => {
            const result = await searchFindingIssuesAction({ findingId, query: "" });
            if (result.status === "ok") setItems(result.items);
          });
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach to an existing issue</DialogTitle>
          <DialogDescription>
            Search this project only. Suggestions are recommendations, not automatic matches.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`search-${findingId}`}>Search issues</Label>
            <Input
              id={`search-${findingId}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() =>
                startTransition(async () => {
                  const result = await searchFindingIssuesAction({ findingId, query });
                  if (result.status === "ok") setItems(result.items);
                })
              }
            />
          </div>
          <ul className="grid max-h-48 gap-2 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3">
                  <input
                    type="radio"
                    name={`issue-${findingId}`}
                    checked={selectedId === item.id}
                    onChange={() => setSelectedId(item.id)}
                  />
                  <span>
                    #{item.number} {item.displayTitle}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            disabled={pending || !selected}
            onClick={() =>
              startTransition(async () => {
                if (!selected) return;
                const result = await attachFindingToIssueAction({
                  findingId,
                  issueId: selected.id,
                  confirmed: true,
                });
                if (result.status === "error") toast.error(result.message);
                else {
                  toast.success(result.message);
                  onOpenChange(false);
                }
              })
            }
          >
            Attach evidence
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
