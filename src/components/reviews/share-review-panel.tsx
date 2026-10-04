"use client";

import { useId, useState, useTransition } from "react";

import {
  createShareLinkAction,
  revokeShareLinkAction,
} from "@/app/(app)/projects/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type ShareLinkView = {
  id: string;
  canComment: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  lastOpenedAt: string | null;
};

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.append(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function ShareReviewPanel({
  projectId,
  reviewId,
  links,
  disabled = false,
}: {
  projectId: string;
  reviewId: string;
  links: ShareLinkView[];
  disabled?: boolean;
}) {
  const liveId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const activeLinks = links.filter((link) => !link.revokedAt);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled}>
          Share review
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share review</DialogTitle>
          <DialogDescription>
            Create a guest link. Reviewers open it on Passoff, then continue to the
            website to leave feedback. The installation key alone never grants access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p id={liveId} className="text-muted-foreground text-sm" aria-live="polite">
            {message}
          </p>

          {freshUrl ? (
            <div className="space-y-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
              <p className="text-sm font-medium">Guest review link</p>
              <p className="break-all text-sm">{freshUrl}</p>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  const ok = await copyText(freshUrl);
                  setMessage(
                    ok
                      ? "Link copied. Send it to your reviewer."
                      : "Copy the link manually from the box above.",
                  );
                }}
              >
                Copy link
              </Button>
            </div>
          ) : null}

          <Button
            type="button"
            disabled={disabled || pending}
            onClick={() => {
              startTransition(async () => {
                setMessage(null);
                const result = await createShareLinkAction({
                  projectId,
                  reviewId,
                });
                if (result.status !== "success" || !result.url) {
                  setMessage(result.message ?? "Couldn’t create a share link.");
                  return;
                }
                setFreshUrl(result.url);
                setMessage("Share link ready. Copy it and send it to your reviewer.");
              });
            }}
          >
            {pending ? "Creating link…" : "Create guest link"}
          </Button>

          {activeLinks.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Active links</h3>
              <ul className="space-y-2">
                {activeLinks.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-card px-3 py-2 text-sm ring-1 ring-foreground/10"
                  >
                    <span>
                      {link.canComment ? "Can comment" : "View only"} · created{" "}
                      {new Date(link.createdAt).toLocaleDateString()}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await revokeShareLinkAction({
                            projectId,
                            reviewId,
                            shareLinkId: link.id,
                          });
                          setMessage(
                            result.status === "success"
                              ? "That guest link was turned off."
                              : (result.message ?? "Couldn’t turn off that link."),
                          );
                          if (result.status === "success") {
                            setFreshUrl(null);
                          }
                        });
                      }}
                    >
                      Turn off
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No active guest links yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
