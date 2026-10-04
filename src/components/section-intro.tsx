import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionIntro({
  kicker,
  title,
  titleId,
  children,
  align = "split",
  className,
}: {
  kicker?: string;
  title: ReactNode;
  titleId?: string;
  children?: ReactNode;
  align?: "split" | "center";
  className?: string;
}) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        centered
          ? "mx-auto grid max-w-3xl justify-items-center gap-4 text-center"
          : "section-intro",
        className,
      )}
    >
      <div className={centered ? "grid gap-3" : "section-intro-heading"}>
        {kicker ? <p className="eyebrow">{kicker}</p> : null}
        <h2 id={titleId} className="section-title">
          {title}
        </h2>
      </div>
      {children ? (
        <div className={centered ? "max-w-2xl" : "section-intro-copy"}>
          {typeof children === "string" ? (
            <p className="section-lead">{children}</p>
          ) : (
            children
          )}
        </div>
      ) : null}
    </div>
  );
}
