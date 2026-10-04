import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Same-origin iframe fixture",
  robots: { index: false, follow: false },
};

export default function IframeInnerPage() {
  return (
    <main>
      <h1>Same-origin iframe</h1>
      <p>This framed page is served by Passoff for screenshot tests.</p>
    </main>
  );
}
