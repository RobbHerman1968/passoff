import { ImageResponse } from "next/og";

export const alt = "Passoff — good work deserves a clean pass";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ alignItems: "center", background: "#f7f5f1", color: "#25221e", display: "flex", height: "100%", justifyContent: "center", padding: "64px", position: "relative", width: "100%" }}>
        <div style={{ position: "absolute", right: -80, top: -110, width: 420, height: 420, borderRadius: 999, background: "#fb923c", opacity: 0.2 }} />
        <div style={{ display: "flex", flexDirection: "column", width: "100%", maxWidth: 1040 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
            <div style={{ display: "flex", width: 54, height: 54, borderRadius: 18, background: "#f97316", alignItems: "center", justifyContent: "center", color: "#fff7ed", fontSize: 28 }}>P</div>
            Passoff
          </div>
          <div style={{ marginTop: 72, maxWidth: 900, fontSize: 78, fontWeight: 700, letterSpacing: -4.5, lineHeight: 0.98 }}>
            Good work deserves a clean pass.
          </div>
          <div style={{ marginTop: 34, fontSize: 29, color: "#57534e" }}>
            Clear feedback for real websites and videos.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
