import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ResuMatchAI",
  url: "https://resumatch.zeeshanai.cloud",
  logo: "https://resumatch.zeeshanai.cloud/icon",
  sameAs: [],
};

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ResuMatchAI — Match Your Resume to Any Job, Instantly",
    template: "%s | ResuMatchAI",
  },
  description:
    "AI-powered resume analysis and job matching. Upload your resume, paste a job description, and get an instant match score with personalised recommendations.",
  metadataBase: new URL("https://resumatch.zeeshanai.cloud"),
  openGraph: {
    type: "website",
    url: "https://resumatch.zeeshanai.cloud",
    title: "ResuMatchAI — Match Your Resume to Any Job, Instantly",
    description:
      "AI-powered resume analysis and job matching. Get an instant match score and tailored recommendations to land your next role.",
    siteName: "ResuMatchAI",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ResuMatchAI — AI-powered resume and job matching tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ResuMatchAI — Match Your Resume to Any Job, Instantly",
    description:
      "AI-powered resume analysis and job matching. Get an instant match score and tailored recommendations.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={`${geist.variable} font-sans antialiased`}>
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
          </ThemeProvider>
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
