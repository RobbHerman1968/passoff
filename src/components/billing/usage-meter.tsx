import { cn } from "@/lib/utils";

export type UsageMeterProps = {
  label: string;
  used: number;
  /** A number, or "unlimited". */
  limit: number | "unlimited";
  /** What the count covers and when it resets, e.g. "this month" or "kept right now". */
  window: string;
  unit?: { one: string; many: string };
  note?: string;
  testId?: string;
};

/** At 80% a meter warns; at 100% it says what pauses. Words always carry the state, never color alone. */
export function usageMeterState(used: number, limit: number | "unlimited") {
  if (limit === "unlimited") return "unlimited" as const;
  if (limit <= 0) return "full" as const;
  if (used > limit) return "over" as const;
  if (used === limit) return "full" as const;
  if (used / limit >= 0.8) return "near" as const;
  return "ok" as const;
}

const STATE_TEXT = {
  unlimited: "No limit on your plan",
  ok: "",
  near: "Almost full",
  full: "Full. New additions are paused",
  over: "Over your plan. Nothing was removed; new additions are paused",
} as const;

export function UsageMeter({ label, used, limit, window, unit, note, testId }: UsageMeterProps) {
  const state = usageMeterState(used, limit);
  const percent =
    limit === "unlimited" ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const unitText =
    unit && limit !== "unlimited" ? ` ${limit === 1 ? unit.one : unit.many}` : unit ? ` ${unit.many}` : "";

  return (
    <div className="grid gap-2" data-testid={testId}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm tabular-nums">
          {limit === "unlimited" ? (
            <>
              {used}
              {unitText} used · Unlimited
            </>
          ) : (
            <>
              {used} of {limit}
              {unitText} used
            </>
          )}
        </p>
      </div>
      {limit === "unlimited" ? null : (
        <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              state === "full" || state === "over"
                ? "bg-destructive"
                : state === "near"
                  ? "bg-status-in-progress"
                  : "bg-primary",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      <p className="type-supporting">
        {window}
        {STATE_TEXT[state] ? (
          <>
            {" · "}
            <strong className="font-semibold text-foreground">{STATE_TEXT[state]}</strong>
          </>
        ) : null}
        {note ? ` · ${note}` : null}
      </p>
    </div>
  );
}
