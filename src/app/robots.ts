import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: "https://resumatch.zeeshanai.cloud/sitemap.xml",
    host: "https://resumatch.zeeshanai.cloud",
  };
}
