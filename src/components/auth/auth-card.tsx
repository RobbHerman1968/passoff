import Link from "next/link";

import { Logo } from "@/components/logo";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="m-auto flex w-full max-w-md flex-col gap-8 py-10 sm:py-16">
      <div className="grid gap-8">
        <Link
          href="/"
          aria-label="Passoff home"
          className="w-fit rounded-md text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo className="flex items-center gap-2.5" />
        </Link>
        <div className="grid gap-2">
          <h1 className="type-page-title">{title}</h1>
          {description ? <p className="type-supporting">{description}</p> : null}
        </div>
      </div>
      <div className="grid gap-6">{children}</div>
      {footer ? <div className="type-supporting">{footer}</div> : null}
    </div>
  );
}
