/**
 * One place that turns a 0-100 score into a word and a color role.
 * A score is always shown as digits as well; the band is never color alone.
 * Colors come from the tokens: blue (strong), muted ink (middling), red (weak).
 */
export type ScoreTone = "high" | "mid" | "low";

export interface ScoreBand {
  tone: ScoreTone;
  /** "Excellent fit", "Good fit", "Moderate fit", "Low fit". */
  label: string;
}

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return { tone: "high", label: "Excellent fit" };
  if (score >= 65) return { tone: "high", label: "Good fit" };
  if (score >= 50) return { tone: "mid", label: "Moderate fit" };
  return { tone: "low", label: "Low fit" };
}

/** Text color on the desk (the app background). */
export const SCORE_TEXT: Record<ScoreTone, string> = {
  high: "text-score-high",
  mid: "text-score-mid",
  low: "text-score-low",
};

/** Which proof-mark tone writes a score of this band. */
export const SCORE_MARK_TONE: Record<ScoreTone, "proof" | "ink" | "pencil"> = {
  high: "proof",
  mid: "ink",
  low: "pencil",
};
