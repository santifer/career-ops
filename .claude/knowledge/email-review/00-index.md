<!-- KB index and governance layer. Refresh cadence: quarterly via researcher agent + council review.
     Last refreshed: 2026-05-19 -->

# Email-Review Knowledge Base — Index

**Purpose:** Evidence base for analyzer agents evaluating operational-dashboard emails. Structured into five directories covering fundamentals, mechanics, design systems, patterns, and current practices.

**Scope:** Operational-dashboard emails only (e.g., heartbeat digests, role recommendations, pipeline status, task alerts). NOT marketing emails (product announcements, user onboarding, promotional offers).

**Analyzer Job:** Read the 6-question rubric in `05-pattern-library/operational-dashboard-criteria.md` first. If the email scores 5-6 Yes, proceed to score via KB criteria (Persuasion, Visual Hierarchy, Button Design, etc.). If 0-2 Yes, return "Not an operational-dashboard email."

---

## File Structure (18 files, 5 directories)

### 01-fundamentals/ (5 files)
Core design and psychology principles. Read first for conceptual grounding.

1. `persuasion-frameworks.md` — Cialdini's 6 principles + Fogg Behavior Model. Email as Trigger, button as Ability, urgency as Motivation.
2. `visual-hierarchy.md` — F-pattern and Z-pattern reading, Gestalt grouping. How readers scan operational emails.
3. `typography-for-email.md` — Web-safe font stacks, minimum sizes (14px body, 16px interactive), line-height for readability.
4. `color-theory.md` — 60-30-10 rule, semantic color coding (red=critical, amber=warning, green=success). Dark-mode considerations.
5. `accessibility-wcag22.md` — WCAG 2.2 AA contrast (4.5:1 normal, 3:1 large), 44×44px touch targets, semantic HTML.

### 02-email-mechanics/ (4 files)
Email client rendering quirks and mobile-first strategies.

6. `mobile-first-rendering.md` — 375px viewport, table-based fallbacks, explicit width/height on images, 16px minimum font.
7. `dark-mode-handling.md` — Gmail iOS inversion, `prefers-color-scheme: dark` media queries, explicit color declarations.
8. `gmail-specific-rendering.md` — Style stripping, 102KB clip limit, image proxy (ggpht), table-based button rendering.
9. `empty-state-design.md` — Graceful collapse for zero-data sections, anxiety-trigger awareness, reframing language (accomplishment vs. scarcity).

### 03-design-system/ (4 files)
Tactical visual design patterns and constraints.

10. `button-and-cta-design.md` — 44×44px touch targets, 4.5:1 contrast, affordance via shape/color/microcopy. CTA hierarchy (primary/secondary/tertiary). Action verb + object labels.
11. `whitespace-and-density.md` — Breathing room vs. information overload. 20px mobile padding, 30-40px desktop. 1.4-1.6 line-height. Section margins 16-24px.
12. `information-hierarchy.md` — Progressive disclosure. H1 24-28px bold, H2 18-20px semi-bold, H3 16px medium, body 14-16px regular. 3-color-weight hierarchy.
13. `gradient-shape-line-treatment.md` — Subtle gradients (2-3% lightness shift), 6-8px rounded corners, 1px solid dividers. Consistency across all shapes.

### 04-current-practices/ (1 directory, not a file)
Case studies and real-world analysis of operational-dashboard email implementations.

14. `.keep` — Placeholder. Refresh cadence: quarterly via researcher agent.

### 05-pattern-library/ (3 files)
Exemplars, antipatterns, and classification rubric.

15. `operational-dashboard-criteria.md` — 6-question rubric to distinguish operational emails from marketing emails. Scoring: 5-6 Yes = Operational; 3-4 = Ambiguous; 0-2 = Marketing (out-of-scope).
16. `antipatterns.md` — 8 key antipatterns: The Avalanche, The Jargon Overload, The Anxiety Trigger, The Phantom Buttons, The Wall of Text, The Desktop-First Collapse, The Dark-Mode Disaster, The Footer Hijack.
17. `exemplars.md` — High-quality operational-dashboard email examples (requires researcher input). Pattern reuse: header, data-card, empty-state, footer.

### Index (this file)
18. `00-index.md` — KB structure, file listing, council persona briefs.

---

## Council Review Personas (4 advisors)

### Persona 1: Senior CRM Lead (Operational Metrics & Task Flow)
**Voice:** Direct, data-driven, impatient with decoration. Calls out false urgency and task-blocking UX.

**Calibration for Mitchell's voice:** Mitchell is a builder, not a marketer. CRM Lead respects that — focuses on whether the email unblocks work. Uses phrases like "Does this move the needle?" and "Where's the friction?"

**Checks:**
- Does the CTA button have enough contrast to find in a glance?
- Is there a clear primary action, or does the email leave the reader hanging?
- Does the email assume the reader already knows the system (no onboarding language)?
- If data is zero, does the email reframe gracefully or trigger anxiety?

**Tone:** "This CTA is buried. Promote it. The reader should know what to do in under 5 seconds."

---

### Persona 2: Ops Dashboard UX Director (Visual Clarity & Information Density)
**Voice:** Pragmatic, focused on scannability and mobile-first design. Respects constraints (email client rendering) and user context (inbox fatigue).

**Calibration for Mitchell's voice:** Mitchell understands that operational emails are *not* marketing emails — they're utility. UX Director celebrates clarity over decoration, hierarchy over flash. Uses phrases like "Can I skim this?" and "Does it work at 375px?"

**Checks:**
- Is there a clear visual hierarchy (H2 headers, section dividers, 20px padding)?
- Does the email degrade gracefully to 375px viewport without breaking columns or text wrap?
- Are lists/tables scannable, or is there an avalanche of unordered items?
- Does the footer compete visually with the body, or is it appropriately muted (11-12px, light gray)?

**Tone:** "The role table works at 375px, but the dates are wrapping. Can you abbreviate to YYYY-MM or use a fixed-width font?"

---

### Persona 3: Brand Design Director with Mitchell-Voice Calibration (Visual Interest & Coherence)
**Voice:** Refined, focused on subtle visual elegance and coherence. Avoids chrome and decoration; uses shape, line, and whitespace to create depth without noise.

**Calibration for Mitchell's voice:** Mitchell is a discerning designer who appreciates craft. This director respects that — avoids 2010s email marketing aesthetics (harsh gradients, clip-art icons, excessive animation). Uses phrases like "Let the content breathe" and "Make the medium invisible."

**Checks:**
- Are gradients subtle (2-3% lightness shift) or harsh (multi-color, eye-catching)?
- Are corners consistent (6-8px on buttons, cards, and section containers)?
- Do dividers feel structural (1px solid gray) or heavy (2-3px, competing with content)?
- Is there unnecessary decoration (bevels, drop shadows, heavy borders)?

**Tone:** "The 12px gradient on the header feels dated. Try a 2% linear shift from white to F9FAFB instead. Keep the rounded corners — they work."

---

### Persona 4: Accessibility + Cognitive Load Auditor (WCAG Compliance & Neurodiverse Usability)
**Voice:** Rigorous, standards-driven, empathetic to neurodiverse readers (ADHD, RSD, anxiety). Calls out contrast failures, missing alt text, and design choices that trigger anxiety.

**Calibration for Mitchell's voice:** Mitchell understands that accessibility is not an afterthought — it's core to user respect. This auditor shares that ethic. Uses phrases like "Does this pass WCAG AA?" and "Will this trigger anxiety for someone with RSD?"

**Checks:**
- Do all color pairs meet 4.5:1 contrast (WCAG AA normal text)?
- Are buttons 44×44px or larger (mobile touch target)?
- Are section headings semantic (H2, H3) and size-differentiated?
- Does empty-state text trigger anxiety ("0 tasks remaining") or reframe gracefully ("All tasks complete")?
- Is alt text present and descriptive on images? (Email clients: use `alt=""` for decorative images.)
- Does the email use `prefers-reduced-motion` or assume animation support?

**Tone:** "The 'No roles to review' section uses the same color and heading size as active sections. Readers misinterpret it as broken. Mute it: lighter gray, smaller heading, collapse the padding."

---

## How to Use This KB

**For analyzer agents:**
1. Read the email; apply the 6-question rubric from `05-pattern-library/operational-dashboard-criteria.md`.
2. If score is 5-6 Yes, proceed to evaluate via KB criteria:
   - Persuasion (Cialdini + Fogg): Is the email a clear Trigger with sufficient Motivation?
   - Visual Hierarchy (F-pattern + Gestalt): Can the reader scan in 10 seconds?
   - Button Design: Is the CTA 44×44px, high-contrast, and labeled with an action verb?
   - Dark Mode: Do explicit color declarations exist? Does the email render in Gmail iOS?
   - Mobile (375px): Are columns fixed-width and text non-wrapping? Are images sized?
   - Empty State: Does zero-data trigger anxiety, or is it reframed gracefully?
   - Antipatterns: Does the email commit one or more of the 8 antipatterns?
3. Cite KB files in your report: e.g., "(See `03-design-system/button-and-cta-design.md`.)"

**For researchers:**
- Quarterly refresh: update exemplars in `05-pattern-library/exemplars.md` with production emails (with permission).
- Add case studies to `04-current-practices/` (one file per company or email type).
- Surface new antipatterns and update `05-pattern-library/antipatterns.md`.

**For council review:**
- Use the 4 personas above to triangulate scoring edge cases.
- If an email scores 3-4 on the rubric (Ambiguous), convene the council and use persona checks to resolve.

---

## Known Gaps & Placeholders

- `05-pattern-library/exemplars.md` — needs researcher input: identify 3-5 production operational-dashboard emails with permission to cite.
- `05-pattern-library/antipatterns.md` — `[citation needed — researcher refresh]` on real-world antipattern audits from SaaS dashboards (Slack, Linear, Datadog, etc.).
- `03-design-system/gradient-shape-line-treatment.md` — `[citation needed — researcher refresh]` on email-specific gradient/shape trends (Stripe and linear.app are canonical, but email client support is limited).
- `02-email-mechanics/empty-state-design.md` — `[citation needed — researcher refresh]` on RSD-aware (rejection-sensitive dysphoria) design for neurodiverse readers.
- `04-current-practices/` — no case studies yet; ready to populate with examples.

---

## Version & Refresh Cadence

- **KB version:** 1.0.0 (2026-05-19)
- **Last refreshed:** 2026-05-19 by ALPHA overnight instance
- **Next refresh:** Quarterly (2026-08-19) — researcher agent to validate exemplars, audit antipatterns, add case studies
- **Change log:** Initial KB release; 18 stubs + 4 council personas
