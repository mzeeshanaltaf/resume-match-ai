---
name: ResuMatchAI
description: "The editor's desk. A resume is a sheet of paper; the product is the sharp editor who marks it up against the job in red pencil and proofreader blue."
colors:
  desk: "oklch(0.962 0.013 82)"
  desk-band: "oklch(0.935 0.016 80)"
  card: "oklch(0.988 0.007 85)"
  ink: "oklch(0.235 0.028 265)"
  ink-muted: "oklch(0.46 0.02 265)"
  rule: "oklch(0.87 0.016 80)"
  field-edge: "oklch(0.62 0.02 80)"
  paper-on-ink: "oklch(0.975 0.012 85)"
  red-pencil: "oklch(0.52 0.19 27)"
  red-pencil-wash: "oklch(0.945 0.035 27)"
  proofreader-blue: "oklch(0.48 0.16 255)"
  proofreader-blue-wash: "oklch(0.945 0.03 255)"
  focus-ring: "oklch(0.5 0.17 255)"
  page: "oklch(0.99 0.006 85)"
  page-ink: "oklch(0.235 0.028 265)"
  page-rule: "oklch(0.88 0.012 85)"
  night-desk: "oklch(0.19 0.012 70)"
  night-card: "oklch(0.235 0.013 70)"
  night-ink: "oklch(0.925 0.014 85)"
  night-red-pencil: "oklch(0.72 0.16 27)"
  night-proofreader-blue: "oklch(0.76 0.12 250)"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1.2rem + 3.6vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 1.3rem + 2.2vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.005em"
  document:
    fontFamily: "Literata, Georgia, ui-serif, serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.7
  margin-note:
    fontFamily: "Reenie Beanie, Segoe Print, cursive"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.05
rounded:
  page: "2px"
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  3xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper-on-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
  button-outline:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  page-sheet:
    backgroundColor: "{colors.page}"
    textColor: "{colors.page-ink}"
    rounded: "{rounded.page}"
    padding: "40px"
---

# Design System: ResuMatchAI

## 1. Overview

**Creative North Star: "The Editor's Desk"**

A resume is a sheet of paper. The product is the exacting editor who reads it against a job posting and marks it up: a red pencil for what to fix, proofreader blue for what already works, a short handwritten note in the margin, a grade in the corner. Everything in the interface is either the desk (warm, quiet, tinted paper neutrals), the page (the document, set in a book serif), or the pencil (the marks). The design is distinctive because of what is drawn on the page, not because of how much decoration surrounds it.

The scene: someone at a laptop the evening before a deadline, under a lamp, reading a marked-up page. Light, paper-toned is the default. Dark mode is the same desk at night: the room goes dark, the lamp stays on the page. The page keeps its paper tone in dark mode (dimmed slightly) so marks stay legible and the metaphor holds.

Color strategy is **restrained with a drawn accent**: tinted neutrals and deep ink carry more than 90% of every screen. Red pencil appears only as marks, corrections and gaps, and the occasional single action; blue only for confirmed strengths and focus. There are no gradients, no glows, no glass, and no pure black or white anywhere.

This system explicitly rejects (PRODUCT.md): the SaaS landing-page template, generated-looking AI marketing (emerald glow, serif-italic hero headlines, mono eyebrows, floating dashboard mockups), invented proof, resume-builder kitsch, cold applicant-tracking UI, and editorial-magazine cosplay.

**Key Characteristics:**
- Warm paper neutrals, deep blue-black ink, one red pencil, one proofreader blue.
- Schibsted Grotesk upright for everything interactive; Literata for documents and long reading; a handwriting face for margin notes only.
- Marks (strike, circle, underline, caret, margin note, score) are SVG strokes drawn over real text with path-length animation, then still.
- Rules and spacing do the work that cards usually do. Cards are rare; the page sheet is the one surface that earns a shadow.
- Motion is 150 to 250 ms for product state changes, and long, deliberate, scroll-linked drawing only on the landing hero. Everything is static under `prefers-reduced-motion`.

## 2. Colors

A paper-and-pencil palette: warm tinted neutrals, one ink, two pencils. All values are OKLCH and are defined once, as CSS custom properties, in `src/app/globals.css`. Components never contain a color literal.

### Primary
- **Deep Ink** (`oklch(0.235 0.028 265)`, token `--primary` / `--foreground`): body text, headlines, the primary button, the wordmark. A blue-black leaning very slightly cold against the warm paper so text reads as printed, not as brown. In night mode the roles invert: **Night Ink** (`oklch(0.925 0.014 85)`, a paper tone) becomes text and primary button fill.

### Secondary
- **Red Pencil** (`oklch(0.52 0.19 27)`, token `--pencil`; also `--destructive`): corrections and gaps. Strike-throughs, underlines, circles around problems, the caret and its inserted word, critical-gap text, destructive actions. Its rarity is the point. Night: `oklch(0.72 0.16 27)`.
- **Proofreader Blue** (`oklch(0.48 0.16 255)`, token `--proof`; also `--ring`): confirmed strengths and keyboard focus. Circles around matches, "met" requirements, focus rings, links inside body copy. Night: `oklch(0.76 0.12 250)`.
- **Red Pencil Wash** / **Proofreader Blue Wash** (`--pencil-wash`, `--proof-wash`): the only tints permitted behind text, for a gap or strength callout. Contrast of the foreground colors against these is at least 5:1.

### Neutral
- **Desk** (`oklch(0.962 0.013 82)`, `--background`): the page background. Warm paper-cream, never white.
- **Desk Band** (`oklch(0.935 0.016 80)`, `--secondary` / `--muted`): alternate section bands, table header rows, ghost-button hover.
- **Card Stock** (`oklch(0.988 0.007 85)`, `--card` / `--popover`): form containers, dialogs, dropdowns. A shade lighter than the desk.
- **Page** (`oklch(0.99 0.006 85)`, `--page`; night `oklch(0.92 0.018 85)`): the document sheet in specimens and, in Phase 6, the report. Carries its own ink (`--page-foreground`), rule (`--page-rule`), muted ink (`--page-muted`) and mark colors (`--page-pencil`, `--page-proof`), which stay at their light values in both themes so marks keep contrast on the lit page.
- **Rule** (`oklch(0.87 0.016 80)`, `--border`): hairlines between sections and around quiet containers.
- **Field Edge** (`oklch(0.62 0.02 80)`, `--input`): input and select borders. Darker than Rule on purpose: it is the only thing that tells you a field exists, so it must reach 3:1.
- **Muted Ink** (`oklch(0.46 0.02 265)`, `--muted-foreground`): secondary text; 6.4:1 on Desk.
- **Night Desk** (`oklch(0.19 0.012 70)`) and **Night Card** (`oklch(0.235 0.013 70)`): dark-mode background and surface. Warm brown-black, never blue-slate.

### Score colors
Drawn from the set above, never a new hue: high = Proofreader Blue (`--score-high`), middle = Muted Ink (`--score-mid`), low = Red Pencil (`--score-low`). A score is always written as a number as well; color is never the only signal.

### Named Rules
**The Two Pencils Rule.** Red marks a fix, blue marks a confirmation, ink is everything else. A third accent color is prohibited. If something is neither a fix nor a confirmation, it is ink.

**The No Pure Rule.** `#000`, `#fff`, `oklch(1 0 0)` and `oklch(0 0 0)` are prohibited. Every neutral is tinted toward the paper hue (about 80). Hex literals exist only where a platform forces them (the generated icons and the web manifest) and mirror these tokens.

**The Rarity Rule.** Red pencil covers less than 10% of any screen. When everything is marked, nothing is.

## 3. Typography

**Display / UI Font:** Schibsted Grotesk (fallback `ui-sans-serif, system-ui, sans-serif`), variable weight 400 to 900, upright only. CSS variable `--font-schibsted`, Tailwind `font-sans`.
**Document Font:** Literata (fallback `Georgia, ui-serif, serif`), variable with optical size. CSS variable `--font-literata`, Tailwind `font-serif`.
**Margin-note Font:** Reenie Beanie (fallback `Segoe Print, cursive`). CSS variable `--font-handwriting`, Tailwind `font-hand`. Margin notes, the hand-written score and nothing else.

**Character:** A newsroom grotesque that is confident without being cold, set against the book serif a resume is actually read in, and a pencil hand that is clearly someone else's annotation. Three voices with three jobs; they never swap.

### Hierarchy
- **Display** (700, `clamp(2.5rem, 1.2rem + 3.6vw, 4.25rem)`, 1.04, -0.025em): the landing hero headline and the About page title. Left-aligned, maximum about 14ch per line.
- **Headline** (700, `clamp(1.875rem, 1.3rem + 2.2vw, 2.75rem)`, 1.1, -0.02em): section and page titles.
- **Title** (600, 1.25rem, 1.3): sub-section titles, card-less group headings, FAQ questions.
- **Body** (400, 1.0625rem on marketing, 1rem in the app, 1.6): paragraphs, never wider than 65 to 72ch.
- **Label** (600, 0.875rem, +0.005em, sentence case): form labels, nav links, table headers. No uppercase, no letterspaced eyebrows, no monospace labels.
- **Document** (Literata 400, 1.0625rem, 1.7): privacy and terms body, resume specimens (scaled with container width), report text in Phase 6.
- **Margin note** (Reenie Beanie 400, 1.5rem to 2rem, 1.05, rotated about -1.5deg): short, lower-case, a few words ("vague. what did you ship?"). Never a paragraph, never UI chrome, never below 1.375rem (it is thin).

Scale ratio is at least 1.25 between steps. Light text on dark surfaces adds 0.05 to line-height.

### Named Rules
**The Three Voices Rule.** Grotesque for the interface, serif for the document, hand for the editor. Using the hand for a button label, or the serif for navigation, is prohibited.

**The Upright Rule.** No italic headlines. Italic exists inside Literata documents (genuine emphasis) and nowhere in display type.

## 4. Elevation

Flat by default, separated by hairline rules and tonal steps (Desk, Desk Band, Card Stock). Depth is reserved for exactly one object: the **page sheet**, a piece of paper lying on the desk. No glows, no colored shadows, no glass, no backdrop blur.

### Shadow Vocabulary
- **Sheet** (`--shadow-sheet`, `0 1px 2px oklch(0.3 0.03 70 / 0.08), 0 18px 32px -18px oklch(0.3 0.03 70 / 0.28)`; night uses a deeper, tighter version): the resume specimen and report page. Soft, low, directionless: paper on a desk, not a floating card.
- **Overlay** (`0 12px 32px -12px oklch(0.25 0.03 70 / 0.3)`): menus, dialogs, the mobile nav sheet. Used only because they are physically above the page.

### Named Rules
**The One Sheet Rule.** Only a document may cast a shadow. Cards, buttons, inputs and tiles do not. If a block needs separating, use a rule or a tonal band.

**The Still Marks Rule.** Marks draw once (150 to 1200 ms depending on size) and stay put. No looping, pulsing, floating or hovering marks.

## 5. Components

Every component reads tokens only (`bg-background`, `text-pencil`, `border-input`), so light, night and any future theme come from `globals.css`.

### Buttons
- **Shape:** squared-soft corners (6px, `--radius-md`). Never a pill.
- **Primary:** Deep Ink fill, paper text, 36px high (44px on touch-size contexts via `lg`), 16px horizontal padding. The one action on a screen.
- **Hover / Focus:** hover shifts to 90% ink over 150 ms (ease-out-quart). Focus is a 2px Proofreader Blue ring with a 2px offset in the page color, visible in both themes (`focus-visible:ring-2 ring-ring ring-offset-2`).
- **Outline / Ghost:** Card Stock fill with a Field Edge border; ghost has no border and a Desk Band hover. **Destructive:** Red Pencil fill with paper text.

### Inputs / Fields
- **Style:** Card Stock fill, 1px Field Edge border (3:1), 6px radius, 36px high, 16px text on mobile to prevent zoom. Labels above, always visible; placeholders are examples, never labels.
- **Focus:** border becomes Proofreader Blue and a 2px blue ring appears. **Error:** border and message in Red Pencil with text, not color alone. **Disabled:** 50% opacity, no pointer.

### The page sheet (signature component)
A paper document used as a specimen on the landing page and, in Phase 6, as the report. Page color, 2px corners, Sheet shadow, content in Literata, text sized by container width (`cqw`) so the whole sheet scales as one object. A margin column on the right (about 30%) holds handwritten notes; below the `@sm` container width (24rem) the notes fall under the line they refer to instead. The sheet is capped by viewport height on large screens so it always fits the pinned hero.

### Proof marks (signature component)
SVG strokes in `src/components/proof/`: `Strike`, `Circled`, `Underlined`, `Insert` (caret plus inserted word), `MarginNote` (handwriting with an optional leader arrow), `ScoreMark` (hand-written grade, circled). Spec:
- **Stroke:** 2px (non-scaling), round caps and joins, `currentColor` from the `tone` prop (`pencil`, `proof`, `ink`). Paths are deliberately slightly uneven: a strike slants by about 1.5deg and overshoots the word by 4 to 6%; a circle is an open loop that overshoots its start; an underline waves with a 1 to 2px amplitude.
- **Draw:** `pathLength` 0 to 1, ease-out-quart. A single stroke takes 350 to 700 ms; a circle 600 to 900 ms. Marks are sequenced, never simultaneous.
- **Drivers:** a `progress` motion value plus a `[start, end]` range (scroll-linked), or self-timed on first view (`delay`, `duration`). Under `prefers-reduced-motion` every mark renders fully drawn and static.
- **Text:** margin notes and the score are revealed with a left-to-right clip wipe, not a typewriter, so they read as handwritten.
- **Tone on surface:** `surface="desk"` uses `--pencil` / `--proof` (they brighten at night); `surface="page"` uses `--page-pencil` / `--page-proof` (fixed light values for the lit page).
- Always decorative to assistive tech (`aria-hidden`); the meaning lives in the text next to it.

### Navigation
- **Style:** solid Desk background with a hairline rule below, no blur, 56px high. Wordmark left, links as Label text with an ink underline on hover and current page, theme toggle and account actions right.
- **Mobile:** below `md` the links collapse into a real menu button (44px target) that opens a top sheet with the links, sign-in and a primary action; focus is trapped, Escape closes, and the page does not scroll behind it.

### Disclosure (FAQ)
Native `<details>` / `<summary>`: a ruled list, question in Title weight, a plus that rotates to a minus. Works without JavaScript; answers are always in the DOM for search engines and print.

### Ledger (credits)
Ruled rows, label left, signed amount right in tabular figures, a hand-written running balance at the foot. This is the visual form for anything about credits, on the landing page and in the dashboard.

## 6. Do's and Don'ts

### Do:
- **Do** define every color as an OKLCH token in `globals.css` and use it by name (`bg-card`, `text-pencil`, `border-input`). Re-theme shadcn primitives through those tokens.
- **Do** tint every neutral toward hue 80 (chroma 0.006 to 0.02) and keep Deep Ink at `oklch(0.235 0.028 265)` for text.
- **Do** pair every colored mark with a word or a shape: red strike plus a note, blue circle plus "matches", score as digits.
- **Do** write margin notes in the editor's voice: short, lower-case, specific, never encouraging filler.
- **Do** keep the page sheet the only shadowed object, and let it carry the page's own ink and mark colors in both themes.
- **Do** show real content in specimens (a believable resume line, a posting requirement) and label sample content as sample.
- **Do** keep body copy at 65 to 72ch and left-aligned; vary section rhythm with generous and tight spacing instead of repeating the same padding.
- **Do** respect `prefers-reduced-motion`: draw nothing, show the finished marks.
- **Do** keep focus visible: 2px Proofreader Blue ring, offset 2px, on every interactive element.

### Don't:
- **Don't** build the SaaS landing-page template: hero badge, three icon cards, numbered steps, pricing table, dark gradient CTA banner.
- **Don't** use emerald, glows, blur halos, gradients, gradient text, glassmorphism or backdrop blur anywhere.
- **Don't** set headlines in italic or in a display serif, and don't use monospace eyebrows or uppercase letterspaced labels.
- **Don't** use `border-left` or `border-right` wider than 1px as a colored stripe on cards, callouts or list items.
- **Don't** invent proof: no accuracy percentages, speed claims, user counts, logos, testimonials or tiers that do not exist.
- **Don't** use `#000`, `#fff` or any pure neutral, and don't write hex or `oklch()` literals in components (icons and manifest excepted).
- **Don't** nest cards, wrap everything in a container, or build identical icon-heading-text card grids.
- **Don't** use a modal where an inline step, disclosure or page would do.
- **Don't** use bounce or elastic easing, animate layout properties, or loop any mark.
- **Don't** use em dashes in copy.
- **Don't** use the handwriting font for anything but margin notes and the hand-written score.
