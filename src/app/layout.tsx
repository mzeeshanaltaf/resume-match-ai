import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { literata, schibstedGrotesk } from "@/lib/fonts";
import "./globals.css";

const umamiScriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const umamiWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ResuMatchAI",
  url: "https://resumatch.zeeshanai.cloud",
  logo: "https://resumatch.zeeshanai.cloud/icon",
  sameAs: [],
};

const DEFAULT_TITLE = "ResuMatchAI: see how your resume fits the job";
const DEFAULT_DESCRIPTION =
  "Upload a resume and a job posting. ResuMatchAI marks up what matches, what is missing and what to reword, with a score and the reasons behind it. Recruiters can rank a stack of resumes against one posting.";

export const metadata: Metadata = {
  title: {
    default: DEFAULT_TITLE,
    template: "%s | ResuMatchAI",
  },
  description: DEFAULT_DESCRIPTION,
  metadataBase: new URL("https://resumatch.zeeshanai.cloud"),
  // The social image comes from src/app/opengraph-image.tsx and
  // twitter-image.tsx (file-based metadata), so no `images` are set here.
  openGraph: {
    type: "website",
    url: "https://resumatch.zeeshanai.cloud",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    siteName: "ResuMatchAI",
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Mirrors --background (light) and --background (dark) from globals.css.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f2e9" },
    { media: "(prefers-color-scheme: dark)", color: "#17130e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${schibstedGrotesk.variable} ${literata.variable} font-sans antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* Mounted at the root: toasts raised on marketing-side pages
              (sign-in, verify-email, forgot-password) render nothing at all
              if the Toaster only lives in the dashboard route group. */}
          <Toaster position="bottom-right" />
        </ThemeProvider>
        {umamiScriptUrl && umamiWebsiteId && (
          <Script
            src={umamiScriptUrl}
            data-website-id={umamiWebsiteId}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
