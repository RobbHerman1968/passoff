"use client";

import { RouteError } from "@/components/route-error";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      digest={error.digest}
      onRetry={retry}
      homeHref="/dashboard"
      homeLabel="Go to your projects"
    />
  );
}
