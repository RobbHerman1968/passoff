import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export type SetupStepState = "done" | "current" | "upcoming";

export type SetupStep = {
  id: string;
  title: string;
  description: React.ReactNode;
  state: SetupStepState;
  action?: React.ReactNode;
};

const STATE_LABELS: Record<SetupStepState, string> = {
  done: "Done",
  current: "Next step",
  upcoming: "Later",
};

export function SetupChecklist({
  title,
  description,
  steps,
  headingId,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  steps: SetupStep[];
  headingId: string;
  className?: string;
}) {
  const doneCount = steps.filter((step) => step.state === "done").length;

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="grid min-w-0 gap-1">
          <h2 id={headingId} className="type-section-title">
            {title}
          </h2>
          {description ? <p className="type-supporting">{description}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {doneCount} of {steps.length} done
        </p>
      </div>
      <ol className="divide-y divide-border">
        {steps.map((step) => (
          <li
            key={step.id}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex gap-3 px-4 py-4 sm:px-5",
              step.state === "current" && "bg-primary/5",
            )}
          >
            <StepIcon state={step.state} />
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3
                  className={cn(
                    "text-sm font-semibold",
                    step.state === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {step.title}
                </h3>
                <span
                  className={cn(
                    "text-xs font-medium",
                    step.state === "current"
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  {STATE_LABELS[step.state]}
                </span>
              </div>
              <div className="text-sm break-words text-muted-foreground">
                {step.description}
              </div>
              {step.action ? <div className="mt-2">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepIcon({ state }: { state: SetupStepState }) {
  const className = "mt-0.5 size-5 shrink-0";
  if (state === "done") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className={cn(className, "text-status-resolved")}
      />
    );
  }
  if (state === "current") {
    return <Circle aria-hidden="true" className={cn(className, "text-primary")} />;
  }
  return (
    <CircleDashed
      aria-hidden="true"
      className={cn(className, "text-muted-foreground")}
    />
  );
}
