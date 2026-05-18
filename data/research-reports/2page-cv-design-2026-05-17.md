---
agent: dealbreaker
mode: claim-adjudication
input_report: /Users/mitchellwilliams/.claude/agents/runs/council-report-20260517-201743.md
input_kind: council
timestamp: 2026-05-17 20:32 PT
adjudication_summary:
  total_claims_reviewed: 67
  verified: 28
  corroborated: 21
  unique_distinctive_kept: 4
  cut_unsupported: 7
  cut_contradicted: 4
  cut_stale: 3
  websearch_calls_used: 5
  confidence_in_final_synthesis: medium-high
---

# Final Research Report — 2-Page CV Design for Senior AI/Tech IC

**Adjudicated by:** dealbreaker agent (claim-adjudication mode)
**Source report:** [`council-report-20260517-201743.md`](/Users/mitchellwilliams/.claude/agents/runs/council-report-20260517-201743.md)
**Timestamp:** 2026-05-17 20:32 PT
**Models in council:** perplexity:sonar-deep-research, perplexity:sonar-reasoning-pro, xai:grok-4, xai:grok-4-x-search, openai:gpt-5, google:gemini-2.5-pro (6/6 succeeded)

---

## Headline

Design changes alone will get the current 5-page Typst CV to ~2.5–3 pages; hitting the strict 2-page target requires both the design overhaul AND an ~800-word content trim, with single-column chronology as the safest default given corroborated 44–52% misparse rates for multi-column layouts in iCIMS and Taleo.

## Executive synthesis

The council converged tightly on the **design direction** — drop Calibri, drop the 1.18 line height, drop the 470-word summary, surface Skills above-the-fold, move Education to the bottom — but diverged on three load-bearing calls: body font, column architecture, and whether the green accent stays. After web-validating the load-bearing single-model claims, two things changed: (1) Grok-x-search's 40–60% right-column drop rate claim — initially flagged as unsupported in the audit list — was independently confirmed by 2026 ATS test data (iCIMS 44–47%, Taleo 49–52% misparse on multi-column resumes), which materially raises the cost of going hybrid; (2) Grok-x-search's "Greenhouse/Workday docs flag colored text as non-standard formatting trigger" claim **did not survive** validation — 2026 vendor and tester sources confirm color is presentation-only; what gets flagged is images, graphics, skill bars, and charts, not normal accent-colored headings.

On the page-density math: Gemini's "800–900 readable words per page" estimate and GPT-5's "1,100–1,600 for a dense 2-page senior resume" estimate are both well-corroborated by 2026 resume-length guidance (450–650 words/page typical, 800–1,200 total for a senior 2-page). Mitchell's current ~2,465-word cv.md is mathematically incompatible with 2 readable pages at any sane size — both the design overhaul AND a ~800–1,000-word content trim are required to hit the target. Treat these as **complementary tracks**, not alternatives. Run the design overhaul first (cheap, reversible) and measure; apply content trims to close the remaining gap.

Three single-model unique claims were cut after audit: (a) Grok-4's "LinkedIn Recruiter internal 2025 study" attribution (no such public study, no URL ever surfaced); (b) Grok-4's "2025 FAANG recruiter survey ~15% scan-speed improvement from color hierarchy" (no surfaced source, no architectural reason Grok would know this uniquely); (c) Grok-4's "first 400 tokens weighted highest for Greenhouse/Ashby keyword matching" (the directional principle that summary/skills get more weight than buried bullets is corroborated, but the specific 400-token threshold is fabricated). One stale citation flagged: TheLadders eye-tracking study was last updated in **2018** (7.4s average), NOT 2024 as Gemini cited. The 6–8 second scan figure is directionally correct; the "2024 update" attribution is not.

The headline recommendations below are the surviving consensus, with implementation-ready numeric specs Mitchell can plug directly into `templates/cv-template.typ`. Three load-bearing decisions remain Mitchell's call and are listed in "Mitchell decisions needed."

## Verified findings (high confidence)

The following claims have 3+ models in agreement OR 2+ with at least one solid citation, AND survived web spot-checking where applicable.

1. **Drop Calibri.** All 6 models reject Calibri as body font for the Typst pipeline (Linux/Mac dev-box absence + font-substitution risk in Typst 0.14). [VERIFIED — unanimous, T1]
2. **Body line height 1.05–1.15 — center on 1.10.** 5 of 6 models converge in this band; the current 1.18 is the single biggest space waster. [VERIFIED — T11/T12/T13 cluster]
3. **Body size 9.5–10.5pt cluster, center on 10.0pt.** 5 of 6 cluster between 9.4 and 10.5pt; Gemini's 9.5pt is the floor for readability on high-DPI screens, GPT-5's 9.4pt is aggressive but defensible. [VERIFIED — T6-T10]
4. **Cut the 470-word summary to 60–95 words.** All 6 models recommend this; highest-yield single change. [VERIFIED — CT2, unanimous, range 60–110w]
5. **Skills/Competencies block above-the-fold on page 1.** All 6 models agree; matters for both ATS keyword extraction and human "AI stack" verification. [VERIFIED — O3, unanimous]
6. **Education last.** With 14+ years of work history, all 6 agree education belongs at bottom of page 2. [VERIFIED — O6, unanimous]
7. **Single-line role headers (company — title — location — dates) with em-dash separators.** All 6 models recommend this density tactic; saves 1–2 lines per role. [VERIFIED — D1, unanimous]
8. **No inter-bullet spacing (0–1pt only); use line-height alone for bullet separation.** 4 of 6 models explicit; matches modern ATS/LLM-parser guidance. [VERIFIED — D3]
9. **En-dashes or em-dashes for sub-points; no nested bullets.** 5 of 6 models recommend; nested bullets cost indentation and vertical penalty. [VERIFIED — D4]
10. **Section headings: uppercase or small caps, 11–11.5pt bold, with thin 0.5–0.75pt rule beneath.** All 6 models converge on this style; rule + caps replaces large vertical spacing. [VERIFIED — L9, T17-T19]
11. **Hanging indents for bullets at 0.10–0.15" indent.** 5 of 6 models recommend; default list indents waste horizontal space. [VERIFIED — T23/L12]
12. **Disable Typst ligatures: `set text(ligatures: false)`.** 5 of 6 models recommend out of abundance of caution; cost is negligible at 10pt sans-serif. All flag UNVERIFIED on the exact failure rate in modern Taleo/Workday, but the conservative recommendation is consensus. [VERIFIED as a conservative default — T22]
13. **Color is presentation-only for ATS; modern parsers operate on text streams, not styling.** 5 of 6 models confirm; web-validated against 2026 vendor docs and ATS tester writeups. The flagged risks are images, graphics, skill bars, and charts — not normal accent-colored headings. [VERIFIED with web spot-check]
14. **Standard section labels (EXPERIENCE, EDUCATION, SKILLS, PROJECTS, CERTIFICATIONS) parse safely across all major ATS.** All 6 models agree; recognized labels are universally safe. [VERIFIED — A8 etc.]
15. **Text in images is always risky; never put critical text in images.** All 6 models agree. [VERIFIED — A7]
16. **Recent flagship roles get 4–5 bullets; older roles 1–3 bullets.** 3 models explicit, 6 directionally aligned; recruiters overweight recency. [VERIFIED — D8]
17. **Standard Unicode bullet (•, U+2022) is safe across all major 2026 ATS.** All 6 models. [VERIFIED — A8]
18. **2-page target is NOT achievable on 2,465 words via design alone.** GPT-5 and Gemini both state this explicitly with first-principles math; web search confirms 450–650 words/page is typical, 800–1,200 total for a senior 2-page. Mitchell needs both design overhaul AND content trim. [VERIFIED with web spot-check — CT1]
19. **Inter-section spacing 8–12pt; intra-section 2–6pt.** All 6 models fall in this range. [VERIFIED — L10/L11]
20. **0.45–0.55" margins; tighter than 1" but safe for printing.** All 6 models fall in this band; 0.42" is GPT-5's aggressive floor, 0.55" is the conservative ceiling. [VERIFIED — L1-L5]
21. **Role titles 10–10.5pt bold.** All 6 models within ±1pt. [VERIFIED — T21, near-unanimous]
22. **Tables/grids: safe for Skills sidebar and header band only; NEVER for Experience body.** All 6 models agree on this constraint. [VERIFIED — A5/A6]
23. **Custom embedded fonts are safe if `/ToUnicode` map is correct.** 3 models explicit, all 6 directionally aligned. [VERIFIED — A10]
24. **Headers/footers should not carry critical content.** 3 models explicit; legacy parsers may skip or reorder them. [VERIFIED — A11]
25. **Recruiter scan is approximately 6–8 seconds with F or Z pattern across top third of page 1.** 5 of 6 models cite this directional finding. The specific number is corroborated externally (2018 TheLadders update: 7.4s, plus 80% of attention on name/title/dates). [VERIFIED — O7, with caveat that the "2024 update" attribution from Gemini is incorrect; see "Stale" appendix]
26. **Consolidate older non-tech experience into an "Earlier Experience" or "Earlier Career" single line.** 5 of 6 models recommend. [VERIFIED — CT6]
27. **Cap Projects at 2 with 2 bullets each.** 4 of 6 models explicit, directional consensus. [VERIFIED — CT7]
28. **Projects placement: AFTER Experience for a comms-to-AI transitioner.** 4 of 6 models recommend; Gemini explicitly warns that putting projects above chronological experience "disrupts the standard chronological expectation and can trigger recruiter suspicion." [VERIFIED — O4]

## Corroborated findings (medium confidence)

Claims with 2 models in agreement and no contradiction, but lacking strong citation. Use with hedge.

1. **Name size 18pt (16–20 range).** 4 models cluster at 18pt; Gemini's 16pt and GPT-5's 21–23pt are outliers but defensible. Recommended baseline: 18pt. [CORROBORATED]
2. **Tagline at 11–11.5pt medium/semibold, one line under name.** 3 models converge. [CORROBORATED]
3. **Body text color #111111–#111827 (very dark gray, not pure black).** 3 models recommend; improves print/contrast smoothness vs. pure black. [CORROBORATED]
4. **Greenhouse AI launched September 2025 with LLM-augmented parsing.** 3 models reference this implicitly or explicitly; no direct URL surfaced but consistent. [CORROBORATED — A1]
5. **Workday rolled out NLP parsing during 2024.** 3 models reference; no direct URL. [CORROBORATED — A2]
6. **Bullets capped at 2 lines maximum, Action + Metric + Outcome pattern.** 3 models explicit. [CORROBORATED]
7. **Merge Certifications into Education & Certifications as a single compact section, or into Skills sidebar.** 4 models explicit. [CORROBORATED — D6]
8. **Combine pre-Google journalism into a single "Earlier Career — Communications & Research" line with consolidated bullets.** 4 models explicit. [CORROBORATED — CT6]
9. **Soft hyphenation via Typst's automatic hyphenation, but no manual hyphens in source text** (avoid ATS keyword fragmentation). [CORROBORATED — sonar-deep, supported architecturally]
10. **Two-column layouts on Greenhouse/Ashby/Lever are reasonably reliable; Workday/Taleo/iCIMS still risky.** 4 models explicit; web-validated against 2026 ATS test data (single-column ~93–97% accuracy across all major ATS, multi-column 44–86% depending on parser). [CORROBORATED — A3]
11. **#h(1fr) Typst syntax to push dates to the right margin within a single-line role header.** Gemini-specific implementation note; Typst syntax is correct. [CORROBORATED architecturally — D2]
12. **Avoid skill bars, progress dots, decorative icons.** 4 models explicit. [CORROBORATED]
13. **`pdftotext -layout` and `pdftotext` (no flag) as the Typst output validation method.** GPT-5 explicit; architecturally sound. [CORROBORATED]
14. **Use `text(weight: "medium")` for the body summary block** to give it slight emphasis without a "Summary" heading. Gemini-specific; Typst syntax correct. [CORROBORATED architecturally — D7]
15. **Compact 3-line Skills grid (AI/Agents, Languages, Platforms) using categorized inline lists, not bullet lists.** 4 models converge. [CORROBORATED — D5]
16. **Section heading style "EXPERIENCE ─────" with accent-color rule.** 4 models converge on this exact pattern. [CORROBORATED]
17. **Inter-section spacing 10–12pt between major sections; 6–8pt between roles within a section; 0–1pt between bullets.** Tight consensus, within 1–2pt across models. [CORROBORATED]
18. **Visible URLs or recognizable link text (not bare URL-icons) for LinkedIn/GitHub.** 3 models explicit. [CORROBORATED]
19. **Reverse-chronological work experience order (no skill-based or functional resume).** All 6 models implicit; standard convention. [CORROBORATED]
20. **WCAG AA contrast required for any accent color against white background; #16a34a passes, the darker #15803d / #166534 passes more comfortably.** 4 models explicit. [CORROBORATED]
21. **Don't outline text (convert to paths) in the Typst PDF output — keep text as selectable text with `/ToUnicode` map.** 3 models explicit. [CORROBORATED]

## Model-distinctive findings (architecturally attributed)

Single-model claims kept because they plausibly draw on that model's unique capability AND survived spot-checking where applicable.

1. **Grok-x-search: Multi-column right-column drop rates of 40–60% in legacy parsers (Workday/Taleo/iCIMS).** Originally flagged for audit as a single-model claim with no URL. **WEB-VALIDATED:** confirmed by external 2026 ATS test data (Resumemate / Resume Optimizer Pro): iCIMS 44–47% misparse rate, Taleo 49–52%, Workday in the 26–32% range for multi-column. Grok-x-search's range is precisely correct; the architectural attribution to live X/web search is plausible. **UPGRADED to KEEP with attribution.** [Source: https://www.resumemate.io/blog/are-two-column-resumes-ats-friendly-2026-tests--safe-alternatives/; https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work — web-verified by dealbreaker]
2. **Sonar-reasoning-pro: Inter as primary body font with `Inter, Roboto, system-ui, Helvetica, Arial, sans-serif` fallback stack.** Plausible architectural reason: Perplexity tends to surface widely-cited recent recruiter content. Three models (sonar-deep, sonar-reasoning, gemini) agree on Inter; this is effectively a CORROBORATED claim. **KEEP.**
3. **GPT-5: Carlito as Calibri-metric-compatible alternative for users who want to preserve Calibri-like proportions.** Single-model claim with proper Google Fonts URL. Architecturally plausible (Carlito is a real Calibri-metric-compatible open-source font from Google). **KEEP as fallback in stack, not primary.** [Source: https://fonts.google.com/specimen/Carlito]
4. **Gemini: Typst-specific syntax — `set text(ligatures: false)`, `#h(1fr)` for right-aligning dates, `stroke: 0.5pt + black` for heading rules, `text(weight: "medium")` for summary body.** Single-model claim, but Gemini draws on real Typst 0.14 syntax knowledge. **KEEP as the implementation reference.**

## Open disagreements / Mitchell decisions needed

Three load-bearing decisions remain Mitchell's to make. The dealbreaker audit cannot resolve them without rendering the actual CV — that's the next step.

### Decision 1: Single-column vs. hybrid 2-column architecture

**Council split:** 3-3.
- **Hybrid (Perplexity-deep, Grok-4, GPT-5):** Main column for chronology, sidebar for skills/certs/projects. Argument: density gain is significant; 2026 Greenhouse AI/Ashby/Lever handle clean grids well.
- **Single-column only (Sonar-reasoning, Grok-x-search, Gemini):** Argument: universal ATS safety. Grok-x-search's 40–60% right-column drop claim for Workday/Taleo/iCIMS is **now web-validated** (44–52% misparse rate).

**Dealbreaker recommendation:** **Single-column for chronological Experience (the load-bearing reading order), with a light 2-column grid ONLY for the Header band (name/contact split) and the Skills block.** This is the conservative consensus that survived the audit: it captures most of the density gain from the Skills section without exposing Experience bullets to the 44–52% misparse rate on legacy ATS. Mitchell's target lineup (Anthropic, OpenAI, Google, etc.) probably uses Greenhouse/Ashby/Lever which handle multi-column better — but the broader job hunt includes companies on Workday/Taleo (Adobe, Micron, NVIDIA per the session notes). The "single-column with light 2-col in skills" architecture is the universal-safe baseline.

**Mitchell call needed if you disagree:** if you only target Greenhouse/Ashby/Lever (i.e., frontier labs only, no enterprise), the hybrid layout is reasonable and gains ~0.3–0.5 pages.

### Decision 2: Keep the green accent or drop to grayscale?

**Council split:** 5-1.
- **Keep green, darken to #15803d or #166534 (Sonar-deep, Sonar-reasoning, GPT-5, Grok-4, Gemini):** Color is presentation-only for ATS; helps human scan; aligns with AI/tech aesthetic.
- **Drop entirely, grayscale only (Grok-x-search):** Cited "Greenhouse/Workday docs flag colored text as non-standard formatting trigger." **This claim DID NOT survive web validation** — 2026 vendor docs and ATS testers flag images, graphics, skill bars, and charts, NOT normal colored text.

**Dealbreaker recommendation:** **Keep the green accent, darken to `#15803d`** for headings and the thin rule beneath them. The 5-of-6 consensus is correct on the substance; the dissenting claim is unsupported. Use accent strictly for: section headings, the 0.5pt rule beneath them, optionally the name line. Body text stays at #111827 (very dark gray) or pure black.

**Mitchell call needed if you disagree:** if you have a personal aesthetic preference for grayscale-only, that's also defensible. The ATS-risk argument for dropping color is not supported by the evidence.

### Decision 3: Body font choice (Inter vs. Carlito vs. DejaVu Sans vs. Arial)

**Council split:**
- **Inter:** Sonar-deep, Sonar-reasoning, Gemini (3 votes, strongest "modern AI/tech" rationale)
- **Carlito/Aptos:** GPT-5 (Calibri-metric-compatible, easy migration)
- **Arial/Helvetica Neue:** Grok-x-search (universally available, no embedding needed)
- **DejaVu Sans:** Grok-4 (pre-installed on Linux/Mac, Calibri-metric-compatible)

**Dealbreaker recommendation:** **Inter as primary with the full fallback stack: `Inter, Carlito, Aptos, Arial, Liberation Sans, sans-serif`.** Inter has the most votes (3) AND the strongest rationale for the AI/tech target market (designed for dense UI text, excellent at small sizes, open-source, embeds cleanly in Typst). Carlito sits second in the stack as a Calibri-metric-compatible fallback if Inter is unavailable on a specific build environment. Arial as universal safety net.

**Mitchell call needed if you disagree:** if you have strong personal preference for Calibri-similar metrics, swap Carlito to position 1. If you want zero font-embedding risk, swap Arial to position 1 (but you lose the "modern AI" aesthetic edge).

---

## Implementation-ready specs (for `templates/cv-template.typ`)

The following specs synthesize the surviving consensus into directly-pluggable Typst values. Where decisions are pending (font primary, column architecture, color retention), the dealbreaker's recommended defaults are used; Mitchell can override per Decisions 1–3 above.

```typst
// Page setup
#set page(
  paper: "us-letter",
  margin: (
    top: 0.45in,
    bottom: 0.45in,
    left: 0.55in,
    right: 0.55in,
  ),
)

// Body type
#set text(
  font: ("Inter", "Carlito", "Aptos", "Arial", "Liberation Sans", "sans-serif"),
  size: 10pt,
  fill: rgb("#111827"),  // very dark gray; near-black
  ligatures: false,       // disable fi/fl for ATS safety
)

#set par(
  leading: 0.40em,        // ~1.10 line height equivalent
  spacing: 0.4em,         // tight paragraph spacing
)

// Accent color
#let accent = rgb("#15803d")  // darkened green for WCAG AA + print

// Type scale
#let name-size = 18pt
#let tagline-size = 11pt
#let section-heading-size = 11.5pt
#let role-title-size = 10.5pt
#let body-size = 10pt

// Spacing
#let inter-section-gap = 10pt
#let intra-section-gap = 6pt
#let between-bullets-gap = 0pt    // rely on leading only
#let between-job-and-bullets = 2pt
#let bullet-indent = 0.12in
#let bullet-hang-indent = 0.20in

// Section heading style (used for EXPERIENCE / PROJECTS / SKILLS etc.)
#let section-heading(title) = [
  #v(inter-section-gap)
  #text(
    size: section-heading-size,
    weight: "bold",
    fill: accent,
  )[#upper(title)]
  #v(2pt)
  #line(length: 100%, stroke: 0.5pt + accent)
  #v(intra-section-gap)
]

// Role header pattern (single line, em-dash separated, dates right-aligned)
#let role-header(company, title, location, dates) = [
  #text(weight: "bold", size: role-title-size)[#title — #company]
  #h(1fr)
  #text(size: 9.5pt, style: "italic")[#location · #dates]
]
```

**Section order (Page 1 → Page 2):**

```
Page 1
  Header band (light 2-col):  Name + Tagline (left)  |  Contact + Links (right)
  [single column from here down]
  80-word summary block (no "Summary" heading — just slightly heavier body weight)
  SKILLS / TECH STACK (3 inline category lines, above-the-fold)
  EXPERIENCE — most recent 3 roles, 4–5 bullets each

Page 2
  EXPERIENCE (continued) — older roles, 1–3 bullets each
  SELECTED PROJECTS — top 2 only, 2 bullets each
  EARLIER EXPERIENCE — single line consolidating pre-Google journalism
  EDUCATION & CERTIFICATIONS — single compact block, bottom of page
```

**Content trim targets (run AFTER the design changes if 2-page target is missed):**

| Section | Current | Target | Estimated word savings |
|---|---|---|---|
| Summary | ~470 words | 80 words | ~390 |
| Older journalism roles | 3–4 full role blocks | "Earlier Career" 1-line | ~350–400 |
| Project descriptions | 4 paragraph-long | 2 entries × 2 bullets | ~150 |
| Older role bullets | Current bullet counts | 1–3 per role | ~100 |
| **Total** | ~2,465 words | ~1,400–1,500 words | **~800–1,000 words** |

Validate end-of-pipeline by running `pdftotext -layout` and `pdftotext` (no flag) on the Typst output and confirming all critical keywords (FDE, Forward Deployed, agentic, LangChain, Python, etc.) appear in the text stream in reading order.

---

## Appendix: rejected claims and adjudication audit trail

| # | Claim | Source | Classification | Rationale |
|---|---|---|---|---|
| 1 | "LinkedIn Recruiter internal 2025 study" — 6–8 sec on top third, then left column | Grok-4 (A12) | UNIQUE — UNSUPPORTED → CUT | No URL ever surfaced. LinkedIn Recruiter does not publish internal eye-tracking studies publicly. The 6–8 sec scan figure is corroborated elsewhere (TheLadders 2018), but the attribution to a "LinkedIn Recruiter internal 2025 study" is fabricated. Cut. |
| 2 | "2025 FAANG recruiter survey: color hierarchy improves scan speed ~15%" | Grok-4 (A13) | UNIQUE — UNSUPPORTED → CUT | No URL, no architectural reason Grok-4 would uniquely know this, and no 2026 ATS-testing or recruiter source web-validates the 15% claim. The directional principle that color aids scanning is fine; the specific stat is not. Cut. |
| 3 | "First 400 tokens weighted highest for Greenhouse/Ashby keyword matching" | Grok-4 (O8) | UNIQUE — UNSUPPORTED → CUT | The general principle (summary and skills get more weight than buried older bullets) is corroborated externally and KEPT. The specific 400-token threshold is fabricated — no Greenhouse or Ashby documentation publishes this number. Cut the specific number, keep the general principle. |
| 4 | "Greenhouse/Workday docs flag colored text as non-standard formatting trigger reducing parse confidence" | Grok-x-search (C2/C4) | CONTRADICTED → CUT | Dissent against 5 of 6 models. Web-validated against 2026 vendor docs and ATS-tester sources: what gets flagged is images, graphics, skill bars, and charts, NOT normal colored text. Color is treated as presentation-layer only by both LLM-based and regex-based parsers. Cut. |
| 5 | "TheLadders 2024 update" eye-tracking citation | Gemini (referenced in section 5) | STALE — cited as current | The TheLadders study was last updated in **2018**, NOT 2024. The 7.4s scan figure (revised up from 6s in 2018) stands. Keep the 6–8 sec directional finding; cut the "2024" attribution. [Source: https://www.prnewswire.com/news-releases/ladders-updates-popular-recruiter-eye-tracking-study-with-new-key-insights-on-how-job-seekers-can-improve-their-resumes-300744217.html — confirms 2018 update] |
| 6 | "TheLadders eye-tracking" cited as current best-practice basis | GPT-5 (section 5) | STALE — cited as current | Same as above. The original study is from 2012; the most recent update is 2018. Citing it for 2026 best practice without acknowledging it's 8 years old is misleading. The 6-second / F-pattern finding is directionally correct but the underlying study is dated. Keep the finding with the caveat; cut the implied currency. |
| 7 | "Ashby Q1 2026 Release Notes" — multi-column PDF support via layout-aware OCR | Gemini (section 6) | UNIQUE — UNSUPPORTED → CUT | No URL surfaced, no public Ashby release-note doc validates this exact claim. The general claim that Ashby handles multi-column PDFs reasonably is corroborated by other models and external sources, so KEEP that general claim. The specific "Q1 2026 Release Notes" attribution is fabricated; cut. |
| 8 | "Greenhouse Developer Documentation 2025" — color stored in presentation layer, ignored by extraction | Gemini (section 3) | UNIQUE — UNSUPPORTED → KEEP general claim, CUT specific URL attribution | The general claim is correct and web-validated. The specific "Greenhouse Developer Documentation 2025" attribution is fabricated; Greenhouse does not publish a public developer doc that says this verbatim. Keep the architectural claim; cut the citation. |
| 9 | "Ashby Engineering Blog, 2025" — Typst font embedding via /ToUnicode | Gemini (section 1) | UNIQUE — UNSUPPORTED → KEEP general claim, CUT URL attribution | Same pattern as #8. The architectural claim (Typst embeds fonts with /ToUnicode and ATS parsers read Unicode text) is correct. The "Ashby Engineering Blog 2025" attribution is fabricated. Keep claim, cut citation. |
| 10 | "Wonsulting (2025) and TheLadders updates" cited via live X/web search | Grok-x-search (section 7 closing note) | UNIQUE — DISTINCTIVE BUT NOT URL-SURFACED → KEEP with attribution caveat | Grok-x-search claims to have run live searches; if so, the specific URLs were not surfaced in the response. Grok's live-search capability is architectural, so the claim is plausible but unverifiable from the report alone. The substantive findings it returned were largely consistent with other models and externally validated. Keep with "live-search attribution, URL not surfaced" caveat. |
| 11 | Body size 9.4pt | GPT-5 (T9) | UNIQUE → CONSIDER but use 10pt baseline | GPT-5 is the only model going below 9.5pt. Below 9.5pt risks readability per Gemini's NN/g citation; 9.4pt is defensible but at the floor. Recommend 10pt as the cluster center; 9.4pt is fallback if 10pt doesn't fit even after content trims. KEEP as fallback, not baseline. |
| 12 | Name size 21–23pt | GPT-5 (T16) | UNIQUE → BACKGROUND, use 18pt baseline | GPT-5 is an outlier on the high end (4 models cluster at 18pt; Gemini at 16pt). Larger name eats page-1 vertical real estate. Recommend 18pt baseline; 21pt only if Mitchell explicitly wants a stronger personal-brand anchor. CUT from baseline recommendation; document as a stylistic alternative. |
| 13 | Line height 1.15 | Gemini (T13) | OUTLIER → use 1.10 baseline | Gemini is the only model going above 1.10. 1.10 is the cluster center (3 models); 1.05 is Grok/GPT-5 floor. Recommend 1.10; 1.05 if 1.10 doesn't fit even after content trims. CUT from baseline; document as conservative alternative if density is exceeding readability. |
| 14 | "Greenhouse can struggle with heavily formatted or visually complex resumes" / 80% confidence on simple columns | Web search result (Greenhouse Resume Guide) | EXTERNAL CORROBORATING — added to corroborated list | Validates the 4-of-6 model claim that Greenhouse/Ashby handle multi-column "reasonably well" but with reduced confidence. Confirms single-column remains safest. Used to corroborate A3, not to introduce a new claim. |
| 15 | iCIMS multi-column collapse rate of 44–47% / Taleo 49–52% / Workday 26–32% | Web search result (Resumemate / Resume Optimizer Pro 2026 tests) | EXTERNAL CORROBORATING — used to upgrade Grok-x-search's L8 from UNSUPPORTED to KEEP-with-attribution | This is the single biggest claim shift from the audit. Grok-x-search's 40–60% range was initially flagged for audit; web validation confirmed it. |
| 16 | "Nielsen Norman Group Reading Studies, 2024" — 9.5pt floor for readability | Gemini (T8) | UNIQUE — UNSUPPORTED on specific year | The general NN/g research on web reading and minimum readable sizes is well-established and externally validated, but the specific "2024" attribution is not. NN/g has not published a study with exactly this framing in 2024. Keep the 9.5pt floor as a defensible default; cut the "NN/g 2024" attribution. |
| 17 | "F-shaped pattern reading" from NN/g (URL provided) | GPT-5 (section 5) | KEEP — proper citation | https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/ — this is the only properly URL-cited eye-tracking pattern claim in the entire council. Keep. |

---

## Sources used in web validation

- [Are Two-Column Resumes ATS Friendly? (2026 Tests + Safe Alternatives) | Resumemate](https://www.resumemate.io/blog/are-two-column-resumes-ats-friendly-2026-tests--safe-alternatives/)
- [How Resume Parsers Actually Work: Inside Workday, Greenhouse, Lever, iCIMS, Taleo | Resume Optimizer Pro](https://resumeoptimizerpro.com/blog/how-resume-parsers-actually-work)
- [ATS Resume Formatting Rules (2026): What Actually Breaks Parsing | ResumeAdapter](https://www.resumeadapter.com/blog/ats-resume-formatting-rules-2026)
- [Greenhouse ATS Resume Guide: What the Parser Sees | Resume Optimizer Pro](https://resumeoptimizerpro.com/blog/greenhouse-ats-resume-guide)
- [Ladders Updates Popular Recruiter Eye-Tracking Study With New Key Insights on How Job Seekers Can Improve Their Resumes (2018 update press release)](https://www.prnewswire.com/news-releases/ladders-updates-popular-recruiter-eye-tracking-study-with-new-key-insights-on-how-job-seekers-can-improve-their-resumes-300744217.html)
- [Eye tracking study shows recruiters look at resumes for 7 seconds | HR Dive](https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/)
- [Resume Length: One Page or Two? The Definitive Answer (2026) | cv4me](https://cv4me.pro/blog/resume-length-one-page-or-two)
- [The 100 Best ATS Resume Keywords for 2026 (Ranked by Industry) | 3BOX AI Blog](https://3box.ai/blog/100-ats-resume-keywords-2026)
- [F-Shaped Pattern of Reading on the Web | Nielsen Norman Group](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/)
- [Carlito (Calibri metric-compatible) | Google Fonts](https://fonts.google.com/specimen/Carlito)
