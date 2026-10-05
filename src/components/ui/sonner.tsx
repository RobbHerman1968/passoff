"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";

export function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4" aria-hidden="true" />,
        error: <CircleX className="size-4" aria-hidden="true" />,
        info: <Info className="size-4" aria-hidden="true" />,
        warning: <TriangleAlert className="size-4" aria-hidden="true" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-elevated group-[.toaster]:text-elevated-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toast]:text-success",
          error: "group-[.toast]:text-destructive",
        },
      }}
      position="top-center"
      closeButton
      {...props}
    />
  );
}
