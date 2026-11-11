import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What ResuMatchAI collects, who it is shared with, how long it is kept, and how to delete or download it.",
  alternates: { canonical: "/privacy" },
};

const sections: LegalSection[] = [
  {
    title: "1. What we collect",
    body: [
      "Account details: your name and email address, and a password stored only as a hash. If you sign in with Google, we receive the name and email Google shares. We also keep the sessions that keep you signed in.",
      "Your documents: the resumes you upload (the original file and the text read from it), the job postings you add (the link or pasted text, and the fields extracted from it), the reports and generated documents made from them, and your credit balance and ledger.",
      "Messages you send through the contact form: your name, email address and message.",
      "Basic usage data: page views, collected by our own self-hosted analytics, which sets no cookies and builds no profile of you. Our server and the services we run on also keep ordinary technical logs.",
    ],
  },
  {
    title: "2. How we use it",
    body: [
      "To run the service: to read your resumes and postings, produce your reports, keep your history, and count your credits.",
      "To keep your account safe: to verify your email address, reset a password, and limit abuse such as repeated form submissions.",
      "To reply to you, and to understand in aggregate which parts of the site are used. We do not sell your data and we do not use it for advertising.",
    ],
  },
  {
    title: "3. Who else handles it",
    body: [
      "OpenAI receives the text of your resume and of the job posting, and the images of the pages of a scanned PDF, to write the analysis and read the scan. Nothing else about you is sent with them.",
      "Firecrawl is asked to fetch a job-posting link when you submit one instead of pasting text.",
      "Resend delivers the emails we send you, such as verification and password-reset codes. Google handles sign-in if you choose it. Upstash briefly holds your IP address to rate-limit the contact form.",
      "The service runs on a server we rent, and the contact form passes your message to our own workflow tool so it reaches us. We use no advertising networks and no tracking pixels. We share data when the law requires it.",
    ],
  },
  {
    title: "4. How long we keep it, and deleting it",
    body: [
      "We keep your documents, reports and history until you delete them. You can delete a resume, a posting or a report yourself at any time. Deleting a resume or a posting also deletes the reports that were made from it.",
      "You can delete your account from your settings. That erases your resumes (including the stored files), postings, reports, generated documents, credit history and sign-in details. It cannot be undone. Before you do, you can download a copy of everything we hold about you.",
      "One thing survives deletion. To stop deleting and re-registering from being used to claim the 10 free signup credits again, we keep a one-way, salted hash of your email address and nothing else. It cannot be turned back into the address. If you later register again with the same address, the new account starts with 0 credits.",
      "Messages sent through the contact form are kept for as long as we need them to reply and handle the request.",
    ],
  },
  {
    title: "5. Cookies and local storage",
    body: [
      "We set a session cookie so you stay signed in. We use no tracking or marketing cookies. Your light or dark theme choice is saved in your browser, not on our servers.",
    ],
  },
  {
    title: "6. Your rights",
    body: [
      "You can see, correct, download and delete what we hold about you. Most of this is available in your settings; for anything else, contact us.",
      "If you are in the European Economic Area or the United Kingdom, you also have the rights the GDPR gives you, including the right to object to processing and to complain to your data protection authority.",
      "We reply to privacy requests within 30 days.",
    ],
  },
  {
    title: "7. Changes to this policy",
    body: [
      "If we change this policy in a way that matters, we will say so in the app or by email before it takes effect. The date at the top shows when it was last updated.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="11 November 2026"
      intro="This explains what ResuMatchAI collects, who else touches it, how long it is kept, and how to delete it. It is written to be read."
      sections={sections}
      closing={{
        title: "Questions about your data",
        body: (
          <p>
            If something here is unclear, or you want to exercise a right that
            the settings page does not cover, write to us and a person will
            reply.
          </p>
        ),
      }}
    />
  );
}
