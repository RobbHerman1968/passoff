"use client";

/**
 * Last-resort page when even the main layout fails. It replaces the whole document, so it
 * carries its own small stylesheet and does not depend on the app's design tokens.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "#ffffff",
          color: "#111827",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <title>Something went wrong | Passoff</title>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.75rem" }}>We couldn’t load Passoff</h1>
          <p style={{ margin: "0 0 1.25rem", lineHeight: 1.6, color: "#374151" }}>
            Something went wrong on our side. Your work is saved. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              minHeight: "44px",
              minWidth: "44px",
              padding: "0 1.25rem",
              fontSize: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: "1.25rem", fontSize: "0.8125rem", color: "#4b5563" }}>
              If this keeps happening, tell support this reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
