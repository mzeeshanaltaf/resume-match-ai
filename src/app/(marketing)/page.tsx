import type { Metadata } from "next";
import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { Hero } from "@/components/marketing/landing/hero";
import { Desks } from "@/components/marketing/landing/desks";
import { ReportAnatomy } from "@/components/marketing/landing/report-anatomy";
import { Credits } from "@/components/marketing/landing/credits";
import { Faq, faqs } from "@/components/marketing/landing/faq";

export const metadata: Metadata = {
  title: "AI Resume Matcher: score your resume against any job",
  description:
    "Upload a resume and a job posting. Get a match score with the reasons: what matches, what is missing and what to reword. Recruiters can rank a stack of resumes against one posting. 10 free credits.",
  alternates: { canonical: "/" },
};

const softwareAppJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ResuMatchAI",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "Scores a resume against a job posting and explains the score: what matches, what is missing and what to reword. Recruiters can rank a stack of resumes against one posting.",
  url: "https://resumatch.zeeshanai.cloud",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "10 free credits on sign-up. One credit per analysis. No paid plans.",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Navbar />

      <main className="flex-1">
        <Hero />
        <Desks />
        <ReportAnatomy />
        <Credits />
        <Faq />
      </main>

      <Footer />
    </div>
  );
}
