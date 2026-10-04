# Website SDK prototype (Milestone 0)

This is a thin, replaceable Passoff website SDK. It proves that an asynchronously loaded review layer can select elements, track navigation, and attempt screenshots without taking over a host page. It is not a production embed.

## Package boundary

| Path | Role |
| --- | --- |
| `packages/website-sdk/src/browser.ts` | Dormant browser entry. Installs `window.Passoff`. |
| `packages/website-sdk/src/index.ts` | Public initialize / destroy API. |
| `packages/website-sdk/src/review.ts` | Lazy-loaded Shadow DOM review UI. |
| `packages/website-sdk/src/screenshot.ts` | Lazy-loaded screenshot attempt. |
| `packages/website-sdk/dist/` | Built harness artifacts (`passoff-sdk.js`, …) plus production filenames. |
| `public/sdk/v1/` | Production artifacts (`passoff.js`, `passoff-review.js`, `passoff-screenshot.js`). |
| `/dev/website-sdk` | Development-only harness. Returns 404 in production. |

The SDK is vanilla TypeScript. It does not mount React on the customer page.

## Build

```bash
npm run sdk:build
npm run sdk:measure
```

`sdk:measure` reports parsed and gzip size for each artifact.

## Load with an asynchronous script tag

```html
<script>
  window.Passoff = window.Passoff || function () {
    (window.Passoff.q = window.Passoff.q || []).push(arguments);
  };
</script>
<script async src="https://example.com/passoff-sdk.js"></script>
```

Then initialize:

```js
Passoff("init", {
  session: "passoff-prototype-m0",
  assetBaseUrl: "https://example.com/",
  buildId: "app-build-123",
});
```

`assetBaseUrl` must point at the directory that contains the three built files.

## Initialize, disable, destroy, reinitialize

```js
await window.Passoff.init({
  session: "passoff-prototype-m0",
  assetBaseUrl: "/dev/website-sdk/sdk/",
  buildId: "staging-88",
  theme: "system",
});

window.Passoff.setMode("add-feedback");
window.Passoff.destroy();
await window.Passoff.init({ session: "passoff-prototype-m0", assetBaseUrl: "/dev/website-sdk/sdk/" });
```

The SDK stays dormant until `init` receives the prototype session value `passoff-prototype-m0`.

### Kill switch

Initialization is skipped when any of these is set:

- `config.disabled: true`
- `window.__PASSOFF_DISABLE__ = true`
- `<html data-passoff-disabled>`
- `localStorage.passoff.killSwitch === "on"`

### Prototype configuration

```ts
type PassoffInitConfig = {
  session?: string;
  disabled?: boolean;
  assetBaseUrl?: string;
  buildId?: string;
  theme?: "light" | "dark" | "system";
  simulateInitFailure?: boolean; // harness only
};
```

Do not put reusable secrets in this object. The prototype session value is a stand-in, not authentication.

## Captured anchor

Successful selection stores a structured prototype anchor:

- Page URL, route, and title
- Element tag, accessible role, accessible name
- Nearby visible text, capped at **180 characters**
- Stable element id when it is not sensitive
- Approved data attributes only: `data-testid`, `data-qa`, `data-cy`, `data-passoff-anchor`
- Generated CSS selector and DOM ancestry fingerprint
- Normalized x/y inside the element (0–1)
- Document position fallback, element bounds
- Viewport size, device-pixel ratio
- Browser and OS summary
- Host `buildId` when supplied
- Capture time
- `private` flag

Reviewer-facing copy never shows selectors or fingerprints. Those fields are for the harness debug panel.

## Privacy and redaction

The prototype does not capture passwords, cookies, authorization values, hidden inputs, full form contents, payment fields, or request bodies.

It redacts:

- `input[type="password"]`
- Elements marked `data-passoff-private`
- Their descendants' visible text

## Navigation detection

While active, the SDK records:

- Initial page load
- `history.pushState` and `history.replaceState` (native return values preserved)
- `popstate`
- Hash changes

Events contain `previousUrl`, `currentUrl`, `type`, and `time`. Duplicate emissions for the same URL in a short window are dropped. Patches and listeners are removed on `destroy()`.

## Screenshot prototype

Screenshot work is loaded only after review UI starts, never in the dormant file.

Results:

- `captured`
- `partially-captured`
- `unavailable`

Unavailable reasons are written for reviewers, never as raw exceptions. Feedback capture continues if the picture fails.

No third-party capture library is bundled. The prototype draws a sanitized clone through SVG `foreignObject`. That keeps the lazy chunk small and makes the replaceable boundary obvious.

### Limitations discovered

- Cross-origin images without CORS permission cannot be copied reliably.
- Cross-origin iframes are opaque to the host page.
- Video frames are not captured.
- Canvas pixels may be origin-tainted.
- Privacy-marked regions are removed before capture, so the picture is incomplete by design.
- Browser security, not Passoff, is the hard limit. Production should keep client capture optional and add server-side capture plus manual attach.

html2canvas was considered and not shipped: it is large relative to the dormant budget, still cannot bypass CORS/iframe/video rules, and would hide the replaceable boundary this milestone needs to prove.

## Performance budgets (initial proposal)

Measure before claiming a pass. Proposed production starting points:

| Metric | Proposed budget |
| --- | --- |
| Dormant `passoff-sdk.js` parsed | 20 KB |
| Dormant gzip | 8 KB |
| Review chunk parsed | 45 KB |
| Review chunk gzip | 15 KB |
| Screenshot chunk parsed | 12 KB |
| Screenshot chunk gzip | 5 KB |
| `init` duration | 50 ms |
| Add feedback interactive | 100 ms |
| Selection delay | 50 ms |
| Layout shift caused by SDK | 0 |

Runtime numbers are collected in Playwright (`passoff-init` performance measure, host `main` width before/after init). Memory after teardown is environment-dependent in this prototype and is not claimed as a pass.

See `packages/website-sdk/dist/size-report.json` after `npm run sdk:measure`.

### Measured artifact sizes (2026-10-03)

Environment: Node v20.19.6, darwin/arm64. Method: minified esbuild output, UTF-8 byte length, zlib gzip.

| Artifact | Parsed | Gzip | Proposed parsed | Proposed gzip |
| --- | --- | --- | --- | --- |
| `passoff-sdk.js` (dormant) | 3.9 KB | 1.7 KB | 20 KB | 8 KB |
| `passoff-sdk-review.js` | 18.7 KB | 6.5 KB | 45 KB | 15 KB |
| `passoff-sdk-screenshot.js` | 3.1 KB | 1.5 KB | 12 KB | 5 KB |

These three size budgets were measured and are within the proposed starting points.

Runtime checks from Playwright Chromium on this machine:

| Check | Result |
| --- | --- |
| Host `main` width before vs after `init` | delta < 1px |
| Selection click delay | < 500 ms in the e2e assertion |
| `performance.measure("passoff-init")` | present and < 1000 ms when recorded |
| Toolbar at 320px viewport | width ≤ 320px, height ≥ 44px |

The tighter 50 ms init / 100 ms add-feedback budgets remain **proposals**. They were not measured as passing. Mutation-observer volume, long tasks, and teardown memory were not instrumented well enough in this environment to claim a pass.

## Harness

Development only (`notFound()` in production, `/dev/` disallowed in robots):

- `/dev/website-sdk` index
- `/dev/website-sdk/host` full fixture with async SDK
- `/dev/website-sdk/bare` same fixtures without the script (for injection tests)
- `/dev/website-sdk/app` Next.js client navigation
- `/dev/website-sdk/iframe-inner` same-origin iframe

## Production install path

Stable production URLs (built into `public/sdk/v1/` by `npm run sdk:build`):

- `/sdk/v1/passoff.js`
- `/sdk/v1/passoff-review.js`
- `/sdk/v1/passoff-screenshot.js`

Configure `PASSOFF_EMBED_BASE_URL` for install snippets. Production builds reject the prototype session value; the development harness build still accepts it.

## What must change before production review activation

- Replace the prototype session with a short-lived, scoped review session from Passoff.
- Persist feedback, markers, and screenshots.
- Build a real pin-recovery scorer instead of only “found” / “original element not found”.
- Decide whether to keep the first-party screenshot attempt, add a library, and/or add server capture.
- Publish gzip/CDN delivery, source maps, and an npm wrapper.
- Add monitoring that cannot break the host page.

## Tests

```bash
npm run test
npm run test:e2e
```

The Playwright suite loads the **built** SDK into a representative host page with `page.addScriptTag`, rather than only testing React components.
