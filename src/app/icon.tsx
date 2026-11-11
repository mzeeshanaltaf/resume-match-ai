import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Static assets cannot read CSS variables, so these hex values mirror the
// tokens in globals.css (ink, page, red pencil). See DESIGN.md, "No Pure Rule".
const INK = "#181e2b";
const PAGE = "#fefcf7";
const PENCIL = "#be2323";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 7,
          background: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="2.5" width="14" height="19" rx="1.5" fill={PAGE} />
          <path d="M8.5 7.5h7M8.5 11h4" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path
            d="M9 16l2.6 2.6L17 12.2"
            stroke={PENCIL}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
