import { ImageResponse } from "next/og";

export const alt = "ResuMatchAI: your resume, read closely against the job";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Hex mirrors of the globals.css tokens (static assets cannot use variables):
// desk, ink, muted ink, page, page rule, red pencil, proofreader blue.
const DESK = "#f7f2e9";
const INK = "#181e2b";
const MUTED = "#535864";
const PAGE = "#fefcf7";
const RULE = "#dbd7cf";
const PENCIL = "#be2323";
const PROOF = "#005bb5";

/** Schibsted Grotesk from Google Fonts, limited to the glyphs we draw. Falls
 *  back to the default font if the fetch fails (offline build). */
async function loadFont(weight: number, text: string) {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@${weight}&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

const HEADLINE = "Your resume, read closely against the job.";
const WORDMARK = "ResuMatchAI";
const SCORE = "78%";
const SUB = "A score with the reasons written in the margin.";

export default async function OpengraphImage() {
  const all = HEADLINE + WORDMARK + SCORE + SUB;
  const [bold, regular] = await Promise.all([loadFont(700, all), loadFont(500, all)]);
  const fonts = [
    bold && { name: "Schibsted Grotesk", data: bold, weight: 700 as const, style: "normal" as const },
    regular && { name: "Schibsted Grotesk", data: regular, weight: 500 as const, style: "normal" as const },
  ].filter(Boolean) as NonNullable<ConstructorParameters<typeof ImageResponse>[1]>["fonts"];

  const bar = (w: number, color = RULE) => (
    <div style={{ width: w, height: 12, borderRadius: 6, background: color, display: "flex" }} />
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: DESK,
          display: "flex",
          fontFamily: "Schibsted Grotesk",
          color: INK,
        }}
      >
        {/* Left: wordmark and headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 650,
            padding: "64px 0 64px 72px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <rect x="3.75" y="2.75" width="14.5" height="18.5" rx="1.25" fill={PAGE} stroke={INK} strokeWidth="1.6" />
              <path d="M7.5 7.5h7M7.5 11h4.5" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
              <path d="M11.5 16.2l2.9 2.9L21.2 11" stroke={PENCIL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 700, letterSpacing: -0.5 }}>
              {WORDMARK}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 78,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: -2,
                maxWidth: 560,
              }}
            >
              {HEADLINE}
            </div>
            <div style={{ display: "flex", marginTop: 28, fontSize: 28, fontWeight: 500, color: MUTED }}>
              {SUB}
            </div>
          </div>
        </div>

        {/* Right: a page being marked up */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 56 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 430,
              height: 500,
              background: PAGE,
              borderRadius: 4,
              padding: "44px 40px",
              boxShadow: "0 24px 40px -20px rgba(60,45,20,0.35)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", width: 150, height: 18, borderRadius: 9, background: INK }} />
            <div style={{ display: "flex", marginTop: 14 }}>{bar(210)}</div>

            <div style={{ display: "flex", flexDirection: "column", marginTop: 36, gap: 18 }}>
              {bar(300)}
              {/* struck line */}
              <div style={{ display: "flex", position: "relative", width: 330 }}>
                {bar(330)}
                <svg width="350" height="24" viewBox="0 0 350 24" style={{ position: "absolute", left: -10, top: -6 }}>
                  <path d="M2 14 C 80 6, 180 20, 348 8" stroke={PENCIL} strokeWidth="5" fill="none" strokeLinecap="round" />
                </svg>
              </div>
              {/* circled line */}
              <div style={{ display: "flex", position: "relative", width: 240 }}>
                {bar(240)}
                <svg width="270" height="46" viewBox="0 0 270 46" style={{ position: "absolute", left: -14, top: -17 }}>
                  <path
                    d="M150 5 C 215 3, 262 12, 259 24 C 256 38, 190 43, 130 42 C 60 41, 8 34, 10 22 C 12 10, 70 5, 160 6"
                    stroke={PROOF}
                    strokeWidth="4.5"
                    fill="none"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              {bar(280)}
              {bar(200)}
            </div>

            {/* the grade */}
            <div
              style={{
                display: "flex",
                position: "absolute",
                right: 24,
                top: 20,
                width: 150,
                height: 84,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="150" height="84" viewBox="0 0 150 84" style={{ position: "absolute", left: 0, top: 0 }}>
                <path
                  d="M80 6 C 125 3, 146 22, 141 42 C 136 66, 92 79, 60 77 C 22 74, 6 58, 10 38 C 14 18, 50 6, 90 8 C 108 9, 122 14, 130 22"
                  stroke={PENCIL}
                  strokeWidth="5"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color: PENCIL }}>{SCORE}</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
