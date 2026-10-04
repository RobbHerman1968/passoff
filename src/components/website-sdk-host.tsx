"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type DebugPayload = {
  anchors: unknown;
  navigation: unknown;
  confirmation: unknown;
  state: unknown;
};

const SESSION = "passoff-prototype-m0";

export function WebsiteSdkHost({
  variant = "full",
  loadSdk = true,
}: {
  variant?: "full" | "spa-home" | "spa-about";
  loadSdk?: boolean;
}) {
  const [debug, setDebug] = useState<string>("SDK is dormant.");
  const [hostile, setHostile] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!loadSdk) {
      return;
    }
    if (document.querySelector("script[data-passoff-sdk='true']")) {
      return;
    }
    const script = document.createElement("script");
    script.src = "/dev/website-sdk/sdk/passoff-sdk.js";
    script.async = true;
    script.dataset.passoffSdk = "true";
    document.body.append(script);
  }, [loadSdk]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.fillStyle = "#c2410c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff7ed";
    context.fillText("Canvas", 12, 24);
  }, []);

  const dump = (label: string) => {
    const api = window.Passoff;
    if (!api?.getState) {
      setDebug(`${label}: Passoff is not available.`);
      return;
    }
    const payload: DebugPayload = {
      anchors: api.getAnchors(),
      navigation: api.getNavigationEvents(),
      confirmation: api.getConfirmation(),
      state: api.getState(),
    };
    setDebug(`${label}\n${JSON.stringify(payload, null, 2)}`);
  };

  return (
    <div className={hostile ? "sdk-hostile" : undefined}>
      {hostile ? (
        <style>{`
          .sdk-hostile, .sdk-hostile * {
            font-family: "Comic Sans MS", cursive !important;
            color: magenta !important;
            letter-spacing: 0.2em !important;
          }
        `}</style>
      ) : null}

      <div
        data-passoff-harness="true"
        className="sticky top-0 z-20 border-b border-border bg-card p-3"
      >
        <p className="type-supporting mb-2">
          Development harness. This page is not a production review.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() =>
              void window.Passoff?.init({
                session: SESSION,
                buildId: "harness-dev",
                assetBaseUrl: "/dev/website-sdk/sdk/",
              }).then((result) => dump(result.reason ?? "Initialized"))
            }
          >
            Activate Passoff
          </Button>
          <Button type="button" variant="outline" onClick={() => window.Passoff?.destroy()}>
            Destroy Passoff
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.localStorage.setItem("passoff.killSwitch", "on");
              dump("Kill switch on");
            }}
          >
            Turn on kill switch
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.localStorage.removeItem("passoff.killSwitch");
              dump("Kill switch off");
            }}
          >
            Turn off kill switch
          </Button>
          <Button type="button" variant="outline" onClick={() => window.Passoff?.setMode("browse")}>
            Browse
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.Passoff?.setMode("add-feedback")}
          >
            Add feedback
          </Button>
          <Button type="button" variant="outline" onClick={() => dump("Inspect")}>
            Inspect capture
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              document.getElementById("transform-card")?.classList.toggle("translate-x-8");
              window.Passoff?.revalidateMarkers();
            }}
          >
            Shift layout
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.Passoff?.removeSelectedElement()}
          >
            Remove selected element
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void window.Passoff?.attemptScreenshot().then(() => dump("Screenshot"))}
          >
            Attempt screenshot
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void window.Passoff
                ?.init({
                  session: SESSION,
                  simulateInitFailure: true,
                  assetBaseUrl: "/dev/website-sdk/sdk/",
                })
                .then((result) => dump(result.reason ?? "Failed"))
            }
          >
            Simulate init failure
          </Button>
          <Button type="button" variant="outline" onClick={() => setHostile((value) => !value)}>
            Toggle hostile CSS
          </Button>
        </div>
        <pre
          data-testid="sdk-debug"
          className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs text-foreground"
        >
          {debug}
        </pre>
      </div>

      <main className="page-padding space-y-8">
        <header className="sticky top-[7.5rem] z-10 bg-background/90 p-4">
          <p className="eyebrow">Customer website fixture</p>
          <h1 className="type-page-title" id="hero">
            Northwind marketing site
          </h1>
        </header>

        {variant === "spa-home" ? (
          <p>
            Next.js home.{" "}
            <Link href="/dev/website-sdk/app/about" className="underline">
              About this campaign
            </Link>
          </p>
        ) : null}
        {variant === "spa-about" ? (
          <p>
            Next.js about page.{" "}
            <Link href="/dev/website-sdk/app" className="underline">
              Back to campaign
            </Link>
          </p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-border p-4">
            <h2>Plain content</h2>
            <p id="plain-copy">
              Choose a headline, a button, or this paragraph to leave feedback.
            </p>
            <a href="#pricing" id="pricing-link">
              Jump to pricing
            </a>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="rounded-lg border border-border px-4 py-3" id="cta">
                Get a quote
              </button>
              <label className="block">
                Name
                <input className="mt-1 block w-full rounded-lg border border-border p-2" id="name" />
              </label>
            </div>
          </article>

          <article className="rounded-xl border border-border p-4" id="nested">
            <h2>Nested controls</h2>
            <div>
              <button type="button">
                <span>Inner label</span>
              </button>
            </div>
          </article>
        </section>

        <section className="h-[28rem] overflow-auto rounded-xl border border-border p-4">
          <h2>Long scrolling content</h2>
          {Array.from({ length: 16 }, (_, index) => (
            <p key={index}>
              Scroll block {index + 1}. Feedback markers should follow their original place.
            </p>
          ))}
        </section>

        <aside className="fixed bottom-24 left-3 z-10 rounded-lg border border-border bg-card p-3">
          Fixed promo
        </aside>

        <article
          id="transform-card"
          className="origin-top-left scale-105 rounded-xl border border-border p-4 transition-transform"
        >
          <h2>Transformed card</h2>
          <p>This block uses CSS transform.</p>
        </article>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-muted p-4">Responsive one</div>
          <div className="rounded-xl bg-muted p-4">Responsive two</div>
          <div className="rounded-xl bg-muted p-4">Responsive three</div>
          <div className="rounded-xl bg-muted p-4">Responsive four</div>
        </section>

        <section>
          <h2>Dynamic nodes</h2>
          <button
            type="button"
            id="add-dynamic"
            className="rounded-lg border border-border px-4 py-3"
            onClick={() => {
              const node = document.createElement("p");
              node.id = "dynamic-node";
              node.textContent = "Dynamically added copy";
              document.getElementById("dynamic-mount")?.append(node);
            }}
          >
            Add element
          </button>
          <div id="dynamic-mount" />
        </section>

        <section>
          <h2>History and hash</h2>
          <button
            type="button"
            className="rounded-lg border border-border px-4 py-3"
            onClick={() => history.pushState({}, "", "/dev/website-sdk/host?view=pricing")}
          >
            Push pricing route
          </button>
          <button
            type="button"
            className="ml-2 rounded-lg border border-border px-4 py-3"
            onClick={() => history.replaceState({}, "", "/dev/website-sdk/host?view=home")}
          >
            Replace home route
          </button>
          <a href="#pricing" className="ml-2 underline">
            Hash to pricing
          </a>
        </section>

        <section id="pricing">
          <h2>Screenshot fixtures</h2>
          {/* Host-page screenshot fixtures must use real <img> tags, including a cross-origin URL. */}
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/brand/passoff-mark.svg" alt="Passoff mark" width={64} height={64} />
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/React-icon.svg/120px-React-icon.svg.png"
            alt="Cross-origin example"
            width={64}
            height={64}
          />
          {/* eslint-enable @next/next/no-img-element */}
          <canvas ref={canvasRef} width={120} height={40} />
          <video controls width={160} id="demo-video">
            <source src="/dev/website-sdk/empty.mp4" type="video/mp4" />
          </video>
          <iframe title="Same-origin frame" src="/dev/website-sdk/iframe-inner" width={220} height={80} />
          <iframe title="Cross-origin frame" src="https://example.com" width={220} height={80} />
          <div data-passoff-private="true" className="mt-3 rounded-lg bg-muted p-3">
            Private region: 4242 4242 4242 4242
            <input type="password" defaultValue="super-secret" aria-label="Private password" />
          </div>
        </section>
      </main>
    </div>
  );
}
