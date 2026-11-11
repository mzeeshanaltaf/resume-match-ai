# Product

## Register

brand

## Register by surface

- `brand`: the public half. Landing, about, contact, privacy, terms, sign-in, sign-up, verify-email, forgot-password, 404, app icons, social image. Here the design is part of the product: a visitor's impression is the thing being made.
- `product`: everything under `/dashboard` (Phase 6). Familiar app structure, restrained color, distinct through the document treatment (paper pages, proof marks) rather than decoration. It reads the same tokens as the brand surface.

Priority when they conflict: the surface being worked on wins over this default.

## Users

Two groups, weighted equally. Neither is the "real" customer with the other bolted on.

- **Job seekers.** One person, one resume, a posting they are about to apply to, often the evening before a deadline. They are anxious, short on time, and tired of applying into silence. They want to know what the posting wants that their resume does not show, and which sentences to change. They are suspicious of AI tools that flatter them.
- **Recruiters and hiring managers.** One posting, a pile of resumes (up to 20 at a time). They are busy, skeptical, and know a keyword score is a blunt instrument. They want a ranked pile with a short, checkable reason for each position, so they can spend their own attention on the top of it.

Context for both: a laptop, a real deadline, a document they have to trust enough to act on. Many arrive from a search or a link a friend sent, with no idea what the product is.

## Product Purpose

ResuMatchAI reads a resume and a job posting side by side and shows, with reasons, how well they fit: a score, what already matches, what is missing, what is weak, and concrete rewording. Job seekers also get tailored bullet rewrites and a cover letter draft. Recruiters get a ranked screening of many resumes against one posting.

Success: a candidate leaves with three specific edits they believe in; a recruiter leaves with an order for the pile and a reason they can check against the resume. A visitor to the public site understands in one scroll what it does, what it costs (10 free credits, 1 per analysis, nothing else), and what happens to their documents.

## Brand Personality

Exacting, plainspoken, fair. Three words: **sharp, candid, unfussy.**

The product is the editor at the next desk: reads closely, marks what is wrong in red pencil and what is right in blue, writes a short note in the margin, and does not pad. Voice is second person and direct ("Your summary does not say what you shipped."). It admits what it cannot know ("A score is a model's judgment, not an ATS result."). No hype, no exclamation marks, no promises about getting hired.

Emotional goal: the relief of having someone competent read it before you send it.

## Anti-references

- **SaaS landing-page template.** Hero badge, three feature cards with icons, numbered steps, pricing table, dark gradient CTA banner. The old page had all of it.
- **Generated-looking AI marketing.** Emerald (or purple) glow, gradient blobs, glassmorphism, serif-italic hero headlines, mono "eyebrow" labels, floating dashboard mockups with a pulsing "Analyzing" pill.
- **Invented proof.** Accuracy percentages, "under 30 seconds", "thousands of job seekers", fake logos, fake testimonials, a pricing page for tiers that do not exist. If it cannot be stated truthfully it is not on the page.
- **Resume-builder kitsch.** Stock photos of handshakes, confetti on a score, "ATS-beating" claims, gamified progress.
- **Cold applicant-tracking-system UI.** Dense gray tables with no point of view, the feel of a form you fill in to be processed.
- Editorial-magazine cosplay: display serif plus italics plus drop caps. The paper metaphor is a working desk, not a broadsheet.

## Design Principles

1. **Show the work.** Every claim the product makes is demonstrated on a real document: marks drawn over real text, a score next to its reasons. If a section can be a specimen instead of a sentence, make it a specimen.
2. **Say what is true, including the limits.** What is stored, what leaves our servers, what a credit buys, what a score cannot tell you. Honest copy is the main trust device, so no number, claim, or logo appears unless the product backs it.
3. **The page is the hero.** Paper, ink, and a red pencil. Color carries meaning (red = fix, blue = confirmed, ink = everything else) and is never decoration. Marks are drawn once, deliberately, then stay still.
4. **Two desks, one standard.** Candidate and recruiter paths get their own composition and call to action, but the same rigor, vocabulary, and visual system.
5. **Calm under pressure.** The user is stressed. Plain words, no jargon, one obvious next step per screen, errors that say what to do, motion that never makes them wait.

## Accessibility & Inclusion

- WCAG 2.2 AA minimum: text contrast 4.5:1 (3:1 for large text and UI boundaries), visible keyboard focus on every interactive element, no information carried by color alone (every red/blue mark has a word or a shape with it), touch targets at least 44px on mobile.
- `prefers-reduced-motion`: the proof marks render fully drawn and static, scroll-linked sequences become a plain page, no parallax. Nothing essential depends on animation.
- Works without JavaScript where it matters: the landing page copy, FAQ (native `<details>`), and the contact form (native POST fallback with honeypot).
- Colour-blind safe by construction: red and blue marks differ in shape and are always paired with text ("fix", "good") in the margin.
- Readable by default: body text 16px or larger, line length 65 to 75ch, light and dark themes both tested.
