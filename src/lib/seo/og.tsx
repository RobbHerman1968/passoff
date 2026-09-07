import { ImageResponse } from "next/og";

export const seoOgSize = { width: 1200, height: 630 };

export async function createSeoOgImage({
  title,
  eyebrow,
}: {
  title: string;
  eyebrow: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          background: "linear-gradient(145deg, #2e2654 0%, #16131f 48%, #5b4cc4 100%)",
          color: "#f5f2ff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "#9b8cf5",
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: title.length > 70 ? 44 : 54,
              lineHeight: 1.15,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              maxWidth: 980,
            }}
          >
            {title}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.03em",
          }}
        >
          <span>Pass-Off</span>
          <span style={{ color: "#e4dffc", fontSize: 22, fontWeight: 600 }}>
            Approval Rooms
          </span>
        </div>
      </div>
    ),
    { ...seoOgSize },
  );
}
