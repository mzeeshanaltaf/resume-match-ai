import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Hex mirrors of the globals.css tokens (static assets cannot use variables).
const INK = "#181e2b";
const PAGE = "#fefcf7";
const PENCIL = "#be2323";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: INK,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="128" height="128" viewBox="0 0 24 24" fill="none">
          <rect x="5" y="2.5" width="14" height="19" rx="1.5" fill={PAGE} />
          <path d="M8.5 7.5h7M8.5 11h4" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M9 16l2.6 2.6L17 12.2"
            stroke={PENCIL}
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
