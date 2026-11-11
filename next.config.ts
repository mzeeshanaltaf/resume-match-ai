import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Lets a second dev server run next to another one (each needs its own build dir).
  // Unset in production, so the default `.next` is used.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // Hides the Next.js dev-tools indicator (the N logo in the bottom-left corner)
  devIndicators: false,

  // pdfjs-dist tries to import the Node-only `canvas` native module.
  // Stub it out for both bundlers so browser builds succeed.
  turbopack: {
    resolveAlias: {
      canvas: path.resolve(__dirname, "./canvas-stub.js"),
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
