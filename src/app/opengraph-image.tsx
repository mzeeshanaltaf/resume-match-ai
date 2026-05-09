import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ResuMatchAI — AI Resume Matcher";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#020617",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Emerald glow */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "rgba(16,185,129,0.15)",
            filter: "blur(80px)",
          }}
        />

        {/* Logo mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            marginBottom: 48,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: 28,
                fontWeight: 800,
                fontFamily: "serif",
              }}
            >
              R
            </span>
          </div>
          <span
            style={{
              color: "#f8fafc",
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.3px",
            }}
          >
            ResuMatchAI
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            color: "#f8fafc",
            fontSize: 64,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-2px",
            maxWidth: 820,
          }}
        >
          Match Your Resume to{" "}
          <span style={{ color: "#10b981" }}>Any Job</span>
        </div>

        {/* Sub-headline */}
        <div
          style={{
            marginTop: 28,
            color: "#94a3b8",
            fontSize: 26,
            lineHeight: 1.5,
            maxWidth: 700,
          }}
        >
          AI-powered match score, keyword gap analysis, and tailored
          recommendations — in under 30 seconds.
        </div>

        {/* Badge row */}
        <div
          style={{
            marginTop: 52,
            display: "flex",
            gap: 16,
          }}
        >
          {["Instant Match Score", "ATS Optimized", "5 Free Analyses"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "10px 20px",
                  borderRadius: 40,
                  border: "1px solid rgba(16,185,129,0.3)",
                  background: "rgba(16,185,129,0.08)",
                  color: "#10b981",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
