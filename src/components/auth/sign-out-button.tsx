"use client";

import { LogOut } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import type { VariantProps } from "class-variance-authority";

import { signOutAction, type ActionResult } from "@/app/(auth)/actions";
import { FormAlert } from "@/components/auth/form-alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initialState: ActionResult = { status: "idle" };

type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>;
type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;

export function SignOutButton({
  size = "xs",
  variant = "outline",
  className,
}: {
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
} = {}) {
  const [state, formAction, pending] = useActionState(signOutAction, initialState);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "error") {
      alertRef.current?.focus();
    }
  }, [state]);

  return (
    <div className={cn("flex flex-col items-stretch gap-2", className)}>
      {state.status === "error" && state.message ? (
        <div ref={alertRef} tabIndex={-1} className="outline-none">
          <FormAlert title="Sign out didn’t finish" description={state.message} />
        </div>
      ) : null}
      <form action={formAction} className="inline-flex">
        <Button
          type="submit"
          size={size}
          variant={variant}
          disabled={pending}
          className="h-8 min-h-8 px-2.5 py-0"
        >
          <LogOut data-icon="inline-start" aria-hidden="true" />
          {pending ? "Signing out…" : "Sign out"}
        </Button>
      </form>
    </div>
  );
}
