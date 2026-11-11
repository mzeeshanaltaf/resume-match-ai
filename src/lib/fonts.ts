import { Literata, Reenie_Beanie, Schibsted_Grotesk } from "next/font/google";

/**
 * The three voices (see DESIGN.md, "The Three Voices Rule"):
 *  - Schibsted Grotesk: the interface. Upright only.
 *  - Literata: documents (resume specimens, reports, long reading text).
 *  - Reenie Beanie: the editor's hand. Margin notes and the written score only.
 *
 * The CSS variable names are mapped to Tailwind's `font-sans`, `font-serif` and
 * `font-hand` in `globals.css`.
 */
export const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

export const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const reenieBeanie = Reenie_Beanie({
  variable: "--font-handwriting",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});
