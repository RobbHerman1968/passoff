import { Check } from "lucide-react";

import { ReviewPreview } from "@/components/review-preview";

const points = [
  "Clients review the real website, no account needed",
  "Every comment stays pinned to the spot it’s about",
  "Approval is recorded on the version the client saw",
] as const;

export function AuthBrandPanel() {
  return (
    <aside
      aria-labelledby="auth-brand-heading"
      className="relative hidden overflow-hidden bg-brand-dark text-brand-dark-foreground lg:sticky lg:top-0 lg:flex lg:h-dvh lg:self-start lg:flex-col lg:justify-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_20%,var(--brand-glow),transparent_70%)]"
      />
      <div className="relative mx-auto w-full max-w-xl px-10 py-16 xl:px-14">
        <h2
          id="auth-brand-heading"
          className="text-balance text-3xl font-semibold leading-[1.15] tracking-[-0.03em] xl:text-4xl"
        >
          Client feedback, pinned to the work.
        </h2>
        <ul className="mt-6 grid gap-3 text-brand-dark-muted">
          {points.map((point) => (
            <li key={point} className="flex gap-3 leading-7">
              <Check aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-brand-dark-success" />
              {point}
            </li>
          ))}
        </ul>
        <ReviewPreview stage="approved" compact className="mt-10" />
      </div>
    </aside>
  );
}
