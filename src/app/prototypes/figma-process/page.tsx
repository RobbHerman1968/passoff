import type { Metadata } from "next";

import { FigmaProcessPrototype } from "@/app/projects/[key]/prototype";

export const metadata: Metadata = {
  title: "Figma process handoff | Pass-Off",
  description: "Interactive prototype for Figma process handoff.",
};

export default function FigmaProcessPrototypePage() {
  return <FigmaProcessPrototype initialFigmaFileKey={null} />;
}
