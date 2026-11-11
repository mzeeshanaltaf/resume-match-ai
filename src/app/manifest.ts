import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ResuMatchAI",
    short_name: "ResuMatchAI",
    description:
      "A resume read closely against a job posting: a score with the reasons, what is missing and what to reword.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f2e9",
    theme_color: "#f7f2e9",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
