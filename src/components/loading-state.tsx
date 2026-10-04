import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({
  label = "Loading this page",
  rows = 4,
  withHeader = false,
}: {
  label?: string;
  rows?: number;
  withHeader?: boolean;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="grid gap-6">
      <p className="sr-only">{label}</p>
      {withHeader ? (
        <div className="grid gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
          >
            <Skeleton className="size-9 rounded-lg" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="hidden h-4 w-20 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
