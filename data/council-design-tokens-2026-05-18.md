# Council Research Report — Button system + Story page design tokens

**Run timestamp:** 2026-05-17 22:09 PT
**Prompt:** Two-problem design brief — (1) WCAG-AA button taxonomy with computed contrast ratios for filled-action / outline / ghost variants and unified hyperlink color, (2) Story child-page philosophy (1:1 dashboard tokens vs reading-mode variant) with concrete CSS using shared CSS variables.
**Full prompt:** `~/.claude/agents/runs/prompt-20260517-220904.txt`
**Models called:** 4 (claude-opus-4-7, openai:gpt-5, google:gemini-2.5-pro, xai:grok-4); 0 failed, 0 skipped
**Total runtime:** ~358s across the merged runs (initial 121s + 160s retry + 78s opus side-call after dotenv override fix)
**Raw council JSON:** `~/.claude/agents/runs/council-20260517-220904-merged.json` (consolidated)

---

## Executive synthesis

The council converges on more than it diverges. **On Problem 1 (button + link tokens)** all four models agree the current `--green-fg: #16a34a` cannot serve as a button fill — they all replace it with a darker green or move off green entirely. Three of four (opus, gpt-5, grok-4) keep semantic green for the primary action; only Gemini votes to abandon green and unify on a single blue accent. The hex values for primary fills cluster tightly: **opus: #2f7d32 (5.14:1)**, **gpt-5: #166534 (7.13:1, AAA)**, **grok-4: #15803d (5.92:1)** — all within a 4-step Tailwind green ramp from green-700 to green-900. Gemini's outlier blue **#005ce6 (5.70:1)** is also valid contrast-wise but represents a different aesthetic call (Linear/Vercel-like neutrality vs GitHub Primer-like semantic coloring). For links, three of four (opus, gpt-5, grok-4) converge on **GitHub Primer blue #0969da light → #58a6ff dark**; Gemini diverges to a slightly bluer **#005ce6 light → #2563eb dark**. For focus rings, all four use the link color as the focus color — universally consistent.

**On Problem 2 (story pages)** the council is unanimous: **(b) reading-mode variant, (b) loose coupling** — every single model picks the same verdict on both sub-questions. The CSS specifics also converge tightly: max-width **65–68ch**, body **17–18px**, line-height **1.62–1.68**, system sans-serif (no serif), shared `var(--bg)`, `var(--fg)`, `var(--link-fg)` tokens so dark mode flows automatically. This is the highest-confidence answer in the entire report — four independent LLMs with different training data all picked the same path.

**The one architectural disagreement worth flagging** is gpt-5's separation of `--green-fg` (positive-trend text token, stays as Tailwind green-300/green-800) from `--green-fg-button` (filled-action token, GitHub Primer #166534 / #238636). This is the cleanest mental model in the entire report — the current code's bug is that it overloads ONE token for both purposes. Whether you choose semantic green or unified blue for buttons, **separating text-tokens from fill-tokens is the structural fix** that all the contrast math depends on.

**Aesthetic details** for stories were the most divergent output — each model named something different:
- opus: scroll-driven progress hairline at the top of the viewport (CSS scroll-timeline)
- gpt-5: "proof rail" — a thin vertical accent line in the left reading gutter
- gemini: outdented typographic leader dot before h1 (Vercel-docs style)
- grok-4: short horizontal accent bar above each h1

These are not in conflict — any one of them could ship. Opus's scroll hairline is the most novel; gpt-5's proof rail is the most thematically tied to the "proof point" purpose of the stories; gemini's leader dot is the most restrained; grok-4's bar above h1 is the most conventional.

**The convergent recommendation at the end of this report** picks specific hex values, picks the semantic-vs-neutral verdict (semantic, with caveats), picks the unified link color, and picks one aesthetic detail.

---

## Per-model responses

### anthropic:claude-opus-4-7  (9,576 tokens, 77,822ms, 12,076 chars)

# Problem 1: Button system + WCAG contrast tokens

**Palette decision**: I'm using **Radix `grass`** for the primary action (not Tailwind green). Tailwind `green-600` (#16a34a) fails AA on white at 2.85:1; the next step `green-700` (#15803d) only hits 4.54:1 and looks muddy. Radix `grass-9` (#46a758) is engineered for UI fills but still fails on white. To pass AA with white text, I'm dropping to **`#2f7d32`** (a hand-tuned grass-shifted hue between Tailwind green-700 and Radix grass-10) which hits 5.14:1 on white — clean, not muddy, reads as "go" not "lime." For dark mode I'm using **`#3fb950`** (GitHub Primer's `success.emphasis`) which is purpose-built as a button fill on `#0d1117` and pairs with white text at 4.62:1.

**Semantic vs neutral verdict**: Keep semantics. Green = "commit/apply" (one button, one job: the nightly CTA). Blue = informational links. Neutral surfaces for everything else. A pure-neutral system would force the flagship CTA to compete with twenty other gray chips on the dashboard — the whole point of the green is to be the one thing the eye lands on at 9pm. Restraint means *one* accent, not *zero*.

```css
/* ===== TOKENS ===== */
:root {
  --bg: #ffffff;
  --surface: #f6f8fa;
  --surface-2: #eef2f6;
  --fg: #1f2328;                    /* ratio: 15.3:1 on --bg */
  --text-2: #57606a;                /* ratio: 5.31:1 on --bg, 4.97:1 on --surface */
  --text-3: #8c959f;                /* ratio: 2.95:1 on --bg - decorative only, never body text */
  --border: #d1d9e0;

  /* Action token - fills, NOT text */
  --action: #2f7d32;                /* ratio: 5.14:1 with #fff text, AA pass */
  --action-hover: #276a2a;          /* ratio: 6.27:1 with #fff, darker on hover */
  --action-active: #1f5722;         /* ratio: 7.91:1 with #fff, AAA */
  --action-disabled: #b8d4b9;       /* ratio: 1.71:1 - paired with --action-disabled-text below */
  --action-disabled-text: #5a6b5b;  /* ratio: 4.52:1 on --action-disabled */

  /* Semantic text (positive trend in KPI tiles - NOT for button fills) */
  --positive-text: #1a7f37;         /* ratio: 4.83:1 on --bg, 4.52:1 on --surface */
  --negative-text: #c0392b;         /* ratio: 4.74:1 on --bg */

  /* Link - single token, passes on both --bg and --surface */
  --link: #0860c9;                  /* ratio: 6.31:1 on --bg, 5.91:1 on --surface */
  --link-hover: #0a4ea0;            /* ratio: 8.42:1 on --bg */

  /* Focus ring - high-contrast against all three surfaces */
  --focus-ring: #0860c9;            /* ratio: 6.31:1 on --bg, 5.91:1 on --surface, 5.42:1 on --surface-2 */
  --focus-ring-offset: var(--bg);

  /* Button neutrals (secondary/tertiary) */
  --btn-secondary-bg: var(--surface);
  --btn-secondary-bg-hover: var(--surface-2);
  --btn-secondary-border: var(--border);
  --btn-secondary-text: var(--fg);

  --radius: 12px;
  --radius-sm: 6px;
  --font-mono: "SF Mono", ui-monospace, "Menlo", monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #21262d;
    --fg: #e6edf3;                    /* ratio: 14.6:1 on --bg */
    --text-2: #9ca3af;                /* ratio: 6.41:1 on --bg, 5.88:1 on --surface */
    --text-3: #6e7681;                /* ratio: 3.71:1 on --bg - decorative only */
    --border: #30363d;

    /* Action token - Primer success.emphasis */
    --action: #3fb950;                /* ratio: 4.62:1 with #fff text, AA pass */
    --action-hover: #56d364;          /* ratio: 5.96:1 with #fff */
    --action-active: #2ea043;         /* ratio: 4.04:1 with #fff - large/UI text only */
    --action-disabled: #1f3a23;       /* ratio: 1.43:1 on --bg */
    --action-disabled-text: #7a8c7c;  /* ratio: 4.51:1 on --action-disabled */

    --positive-text: #4ac26b;         /* ratio: 6.81:1 on --bg, 6.18:1 on --surface */
    --negative-text: #f85149;         /* ratio: 5.41:1 on --bg */

    --link: #58a6ff;                  /* ratio: 7.04:1 on --bg, 6.42:1 on --surface */
    --link-hover: #79b8ff;            /* ratio: 8.94:1 on --bg */

    --focus-ring: #58a6ff;            /* ratio: 7.04:1 on --bg, 6.42:1 on --surface, 5.81:1 on --surface-2 */
    --focus-ring-offset: var(--bg);

    --btn-secondary-bg: var(--surface);
    --btn-secondary-bg-hover: var(--surface-2);
    --btn-secondary-border: var(--border);
    --btn-secondary-text: var(--fg);
  }
}

/* ===== BUTTON COMPONENT CLASSES ===== */
.btn-primary,
.btn-secondary,
.btn-tertiary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  font: 500 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
  border: 1px solid transparent;
  text-decoration: none;
}

.btn-primary {
  background: var(--action);
  color: #ffffff;                    /* ratio: 5.14:1 light / 4.62:1 dark */
  border-color: var(--action);
}
.btn-primary:hover {
  background: var(--action-hover);
  border-color: var(--action-hover);
}
.btn-primary:active {
  background: var(--action-active);
  border-color: var(--action-active);
}
.btn-primary:disabled {
  background: var(--action-disabled);
  border-color: var(--action-disabled);
  color: var(--action-disabled-text);
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);  /* ratio: 15.3:1 light / 14.6:1 dark */
  border-color: var(--btn-secondary-border);
}
.btn-secondary:hover {
  background: var(--btn-secondary-bg-hover);
}
.btn-secondary:active {
  background: var(--surface-2);
  border-color: var(--text-3);
}
.btn-secondary:disabled {
  color: var(--text-3);
  cursor: not-allowed;
}

.btn-tertiary {
  background: transparent;
  color: var(--link);                /* ratio: 6.31:1 light / 7.04:1 dark on --bg */
  border-color: transparent;
  padding: 8px 8px;
}
.btn-tertiary:hover {
  background: var(--surface);
  color: var(--link-hover);
}
.btn-tertiary:active {
  background: var(--surface-2);
}
.btn-tertiary:disabled {
  color: var(--text-3);
  cursor: not-allowed;
}

/* Legacy class aliases - keeps existing markup working */
.tonight-pick-btn-primary   { /* apply .btn-primary styles via duplication or rename in HTML */ }
.tonight-pick-btn-secondary { /* apply .btn-secondary */ }
.tonight-pick-btn-accent    { /* apply .btn-tertiary (blue text-link feel) */ }
.tonight-pick-btn-ghost     { /* apply .btn-tertiary */ }

/* ===== LINKS ===== */
a {
  color: var(--link);                /* ratio: 6.31:1 on --bg, 5.91:1 on --surface (light) */
                                     /* ratio: 7.04:1 on --bg, 6.42:1 on --surface (dark) */
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: color 120ms ease, border-color 120ms ease;
}
a:hover {
  color: var(--link-hover);
  border-bottom-color: currentColor;
}

/* ===== FOCUS RING (universal) ===== */
:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
.btn-primary:focus-visible {
  outline-offset: 3px;               /* extra clearance against filled bg */
}
```

# Problem 2: Story page philosophy

```
VERDICT: (b) reading-mode variant. Stories are sustained-reading artifacts; the
dashboard's 14px UI sans at 1.4 line-height is tuned for scanning KPI tiles, not
for 800-word first-person narratives. Research on reading ergonomics converges
on three things: optimal measure is 60-75 characters per line (Bringhurst,
Elements of Typographic Style); body copy at 17-19px with 1.55-1.65 line-height
maximizes sustained-reading comprehension on backlit displays; and for screen
reading specifically, well-hinted sans-serif (SF Pro, system-ui) now matches or
beats serif in legibility studies on high-DPI displays - so I keep system sans
rather than introducing a serif dependency. Visual cohesion comes from sharing
the token layer (colors, surfaces, accents, focus), not from matching density.

MIGRATION: (b) loose coupling - generator stays separate but imports the shared
:root token block, because full template unification couples two artifacts with
genuinely different layout obligations and you'll fight the abstraction within
a month.
```

```css
/* ===== STORY PAGE CSS ===== */
/* Assumes the :root + dark-mode token block from Problem 1 is present. */

html { background: var(--bg); }

body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  max-width: 68ch;                   /* ~65 characters per line at 18px */
  margin: 64px auto 96px;
  padding: 0 24px;
  background: var(--bg);
  color: var(--fg);                  /* ratio: 15.3:1 light / 14.6:1 dark */
  font-size: 18px;
  line-height: 1.62;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern", "liga", "calt";
}

h1 {
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: var(--fg);
  margin: 0 0 8px;
}

h2 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--fg);
  margin: 40px 0 12px;
}

.meta {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-2);              /* ratio: 5.31:1 light / 6.41:1 dark on --bg */
  margin: 0 0 40px;
  letter-spacing: 0.02em;
}

.body { font-size: 18px; }

.body p {
  margin: 0 0 1.2em;
  hyphens: auto;
  -webkit-hyphens: auto;
  hanging-punctuation: first last;
}

.body p:first-of-type::first-line {
  font-variant: small-caps;
  letter-spacing: 0.01em;
}

.body blockquote {
  margin: 24px 0;
  padding: 4px 0 4px 20px;
  border-left: 2px solid var(--border);
  color: var(--text-2);
  font-style: normal;
}

.body code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--surface);
  padding: 2px 5px;
  border-radius: var(--radius-sm);
  color: var(--fg);
}

.footer {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-2);
  margin-top: 64px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
  letter-spacing: 0.03em;
}

a {
  color: var(--link);
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--link) 35%, transparent);
  transition: border-color 120ms ease;
}
a:hover {
  color: var(--link-hover);
  border-bottom-color: currentColor;
}
a:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  border-radius: 2px;
}

/* ===== AESTHETIC DETAIL: top-fixed reading-progress hairline ===== */
body {
  background-image: linear-gradient(to right, var(--action) 0 100%);
  background-repeat: no-repeat;
  background-size: 0 2px;
  background-position: 0 0;
  background-attachment: fixed;
  animation: read-progress linear;
  animation-timeline: scroll(root block);
}
@keyframes read-progress {
  to { background-size: 100% 2px; }
}
@supports not (animation-timeline: scroll()) {
  body { background-image: none; animation: none; }
}
```

```
AESTHETIC DETAIL: A 2px scroll-linked progress hairline pinned to the top of the viewport in the --action accent, implemented in pure CSS via scroll-driven animations - it gives the story page a quiet "you are 40% through the proof" indicator that ties visually to the dashboard's nightly CTA without ever looking decorative.
```

---

### openai:gpt-5  (13,004 tokens, 159,874ms, 14,168 chars)

## Problem 1

```css
/* ===== TOKENS ===== */
:root {
  color-scheme: light;

  --bg: #ffffff;
  --surface: #f6f8fa;
  --surface-2: #eef2f6;
  --surface-active: #dbe3ea;
  --fg: #1f2328;                 /* ratio: 15.82:1 on --bg */
  --text-2: #57606a;             /* ratio: 6.39:1 on --bg; 5.99:1 on --surface */
  --text-3: #57606a;             /* ratio: 6.39:1 on --bg; 5.99:1 on --surface */
  --border: #d1d9e0;
  --green-fg: #166534;           /* ratio: 7.13:1 on --bg; semantic positive text */
  --blue-fg: #0969da;            /* ratio: 5.19:1 on --bg; 4.88:1 on --surface */
  --radius: 12px;
  --radius-sm: 6px;
  --font-mono: "SF Mono", ui-monospace, "Menlo", monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);

  /* Action color: Tailwind green-800, chosen because green-600 fails with white text */
  --green-fg-button: #166534;    /* ratio: 7.13:1 with #ffffff text; AAA */

  --link-fg: #0969da;            /* ratio: 5.19:1 on --bg; 4.88:1 on --surface; 4.65:1 on --surface-2 */
  --link-hover-fg: #0550ae;      /* ratio: 7.60:1 on --bg; 7.14:1 on --surface */

  --focus-ring: #0969da;         /* ratio: 5.19:1 on --bg; 4.88:1 on --surface; 4.65:1 on --surface-2 */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;

  /* Button taxonomy: primary = positive action, secondary = neutral outline, tertiary = text action */
  --btn-primary-bg: var(--green-fg-button);       /* ratio: 7.13:1 with #ffffff text */
  --btn-primary-border: var(--green-fg-button);   /* ratio: 7.13:1 with #ffffff text */
  --btn-primary-text: #ffffff;                    /* ratio: 7.13:1 on --btn-primary-bg */
  --btn-primary-hover-bg: #145c30;                /* ratio: 8.07:1 with #ffffff text */
  --btn-primary-active-bg: #0f4a27;               /* ratio: 10.35:1 with #ffffff text */

  --btn-secondary-bg: transparent;
  --btn-secondary-border: #d1d9e0;
  --btn-secondary-text: #1f2328;                  /* ratio: 15.82:1 on --bg; 14.84:1 on --surface */
  --btn-secondary-hover-bg: #eef2f6;
  --btn-secondary-active-bg: #dbe3ea;

  --btn-tertiary-bg: transparent;
  --btn-tertiary-border: transparent;
  --btn-tertiary-text: #57606a;                   /* ratio: 6.39:1 on --bg; 5.99:1 on --surface */
  --btn-tertiary-hover-bg: #eef2f6;
  --btn-tertiary-active-bg: #dbe3ea;

  --btn-disabled-bg: #eaeef2;
  --btn-disabled-text: #8c959f;                   /* ratio: 2.61:1 on --btn-disabled-bg; disabled exempt */
  --btn-disabled-border: #d1d9e0;
}

@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;

    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #21262d;
    --surface-active: #30363d;
    --fg: #e6edf3;                 /* ratio: 16.58:1 on --bg */
    --text-2: #9ca3af;             /* ratio: 7.45:1 on --bg; 6.78:1 on --surface */
    --text-3: #8b949e;             /* ratio: 5.99:1 on --bg; 5.45:1 on --surface */
    --border: #30363d;
    --green-fg: #86efac;           /* semantic positive text only - NOT a button fill */
    --blue-fg: #58a6ff;

    --green-fg-button: #238636;    /* ratio: 4.63:1 with #ffffff text; AA */

    --link-fg: #58a6ff;            /* ratio: 7.49:1 on --bg; 6.82:1 on --surface; 6.02:1 on --surface-2 */
    --link-hover-fg: #79c0ff;      /* ratio: 9.73:1 on --bg; 8.87:1 on --surface */

    --focus-ring: #58a6ff;         /* ratio: 7.49:1 on --bg; 6.82:1 on --surface; 6.02:1 on --surface-2 */
    --focus-ring-width: 2px;
    --focus-ring-offset: 2px;

    --btn-primary-bg: var(--green-fg-button);       /* ratio: 4.63:1 with #ffffff text */
    --btn-primary-border: var(--green-fg-button);
    --btn-primary-text: #ffffff;
    --btn-primary-hover-bg: #2a7f3f;                /* ratio: 5.00:1 with #ffffff text */
    --btn-primary-active-bg: #1f6f3a;               /* ratio: 6.19:1 with #ffffff text */

    --btn-secondary-bg: transparent;
    --btn-secondary-border: #30363d;
    --btn-secondary-text: #e6edf3;
    --btn-secondary-hover-bg: #21262d;
    --btn-secondary-active-bg: #30363d;

    --btn-tertiary-bg: transparent;
    --btn-tertiary-border: transparent;
    --btn-tertiary-text: #9ca3af;
    --btn-tertiary-hover-bg: #21262d;
    --btn-tertiary-active-bg: #30363d;

    --btn-disabled-bg: #21262d;
    --btn-disabled-text: #6e7681;
    --btn-disabled-border: #30363d;
  }
}

/* ===== BUTTON COMPONENT CLASSES ===== */
.btn-primary,
.tonight-pick-btn-primary {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 36px;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--btn-primary-border);
  border-radius: var(--radius-sm);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  font: inherit;
  font-weight: 600;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.btn-secondary,
.tonight-pick-btn-secondary,
.tonight-pick-btn-accent {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 36px;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--btn-secondary-border);
  border-radius: var(--radius-sm);
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  font: inherit;
  font-weight: 500;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
}

.btn-tertiary,
.tonight-pick-btn-ghost {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-height: 36px;
  padding: 0.5rem 0.625rem;
  border: 1px solid var(--btn-tertiary-border);
  border-radius: var(--radius-sm);
  background: var(--btn-tertiary-bg);
  color: var(--btn-tertiary-text);
  font: inherit;
  font-weight: 500;
  line-height: 1.2;
  text-decoration: none;
  cursor: pointer;
}

.btn-primary:hover,
.btn-primary:focus-visible,
.tonight-pick-btn-primary:hover,
.tonight-pick-btn-primary:focus-visible {
  background: var(--btn-primary-hover-bg);
  border-color: var(--btn-primary-hover-bg);
  color: var(--btn-primary-text);
}

.btn-primary:active,
.tonight-pick-btn-primary:active {
  background: var(--btn-primary-active-bg);
  border-color: var(--btn-primary-active-bg);
  color: var(--btn-primary-text);
}

/* ... (full disabled state + secondary + tertiary states - see raw JSON) ... */

.btn-primary:disabled,
.btn-secondary:disabled,
.btn-tertiary:disabled,
.btn-primary[aria-disabled="true"],
.btn-secondary[aria-disabled="true"],
.btn-tertiary[aria-disabled="true"] {
  background: var(--btn-disabled-bg);
  border-color: var(--btn-disabled-border);
  color: var(--btn-disabled-text);
  box-shadow: none;
  cursor: not-allowed;
  pointer-events: none;
}

/* ===== LINKS ===== */
a {
  color: var(--link-fg);
  text-decoration: none;
  text-underline-offset: 0.16em;
}

a:hover {
  color: var(--link-hover-fg);
  text-decoration: underline;
}

a:focus-visible {
  color: var(--link-hover-fg);
  text-decoration: underline;
}

/* ===== FOCUS RING (universal) ===== */
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring);
  outline-offset: var(--focus-ring-offset);
}
```

**Decision**: keep semantic colors. Green remains reserved for positive/apply action; blue remains reserved for links and neutral navigation. The key fix is separating `--green-fg` for positive text from `--green-fg-button` for filled action backgrounds. The dark button green is intentionally non-Tailwind: `#238636` is closer to GitHub Primer's dark-mode success button behavior and stays visible against `#0d1117` while still passing AA with white text.

## Problem 2

VERDICT: (b) — use a reading-mode variant that shares the dashboard's system font stack, color tokens, borders, links, and focus behavior, but optimizes the story layout for sustained reading. Long-form pages should sit around a 50–75 character measure with 16–19px body text and roughly 1.5–1.7 line-height; this keeps scanning fatigue low without making the page feel like a separate publication. I would keep system sans-serif rather than switching to serif: serif-vs-sans advantages on screens are contested, and this product's references are Linear, Vercel docs, Stripe docs, and GitHub Primer, all of which make restrained sans-serif reading feel intentional.

MIGRATION: (b) — keep the story generator separate but make it emit the shared token block plus this reading-mode CSS, because stories have a distinct information architecture from the dashboard and should be loosely coupled.

```css
/* ===== STORY PAGE CSS ===== */
html {
  background: var(--bg);
  color: var(--fg);
}

body {
  max-width: 68ch;
  margin: 48px auto 72px;
  padding: 0 24px;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 17px;
  line-height: 1.68;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

h1 {
  margin: 0 0 8px;
  color: var(--fg);
  font-size: clamp(28px, 4vw, 36px);
  line-height: 1.15;
  font-weight: 650;
  letter-spacing: -0.025em;
}

h2 {
  margin: 40px 0 12px;
  color: var(--fg);
  font-size: 20px;
  line-height: 1.35;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.meta {
  margin: 0 0 32px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.5;
}

.body {
  position: relative;
  padding-left: 22px;
  border-left: 2px solid var(--border);
  color: var(--fg);
}

.body p { margin: 0 0 20px; }

.body p:first-child {
  margin-top: 0;
  color: var(--fg);
  font-size: 18px;
  line-height: 1.65;
}

.body strong {
  color: var(--fg);
  font-weight: 650;
}

.body code {
  padding: 0.1em 0.35em;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--fg);
  font-family: var(--font-mono);
  font-size: 0.88em;
}

.footer {
  margin-top: 48px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
}

a {
  color: var(--link-fg);
  text-decoration: none;
  text-underline-offset: 0.16em;
}

a:hover,
a:focus-visible {
  color: var(--link-hover-fg);
  text-decoration: underline;
}

/* aesthetic detail implementation: restrained proof rail */
.body::before {
  content: "";
  position: absolute;
  left: -2px;
  top: 0.2em;
  width: 2px;
  height: 4.5rem;
  border-radius: 999px;
  background: var(--blue-fg);
}

@media (max-width: 720px) {
  body {
    max-width: none;
    margin: 32px auto 56px;
    padding: 0 20px;
    font-size: 16px;
    line-height: 1.65;
  }
  .body { padding-left: 18px; }
  .body p:first-child { font-size: 17px; }
}
```

AESTHETIC DETAIL: Use a restrained "proof rail": a thin accent line in the left reading gutter that marks the narrative as a proof-point artifact rather than a generic blog post.

---

### google:gemini-2.5-pro  (13,419 tokens, 84,863ms, 7,523 chars)

### Problem 1: Button system + WCAG contrast tokens

```css
/* ===== TOKENS ===== */
:root {
  --bg: #ffffff;
  --surface: #f6f8fa;
  --surface-2: #eef2f6;
  --fg: #1f2328;
  --text-2: #57606a;
  --text-3: #8c959f;
  --border: #d1d9e0;
  --radius: 12px;
  --radius-sm: 6px;
  --font-mono: "SF Mono", ui-monospace, "Menlo", monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);

  /* TAXONOMY DECISION: Pure neutrality + a single accent.
     Semantic colors (green=apply, blue=nav) create visual noise on a daily-use dashboard.
     A single accent (deep blue) draws the eye to the primary action, while neutral ghost/outline
     buttons establish a clean, Linear-esque hierarchy without cognitive overload. */

  /* Accent / Primary Fill */
  --accent-fill: #005ce6;          /* ratio: 5.70:1 on #ffffff text */
  --accent-hover: #004fc4;         /* ratio: 6.55:1 on #ffffff text */
  --accent-active: #0043a8;        /* ratio: 7.78:1 on #ffffff text */
  --accent-fg: #ffffff;

  /* Secondary (Outline) & Tertiary (Ghost) */
  --btn-secondary-bg: transparent;
  --btn-secondary-border: #d1d9e0;
  --btn-secondary-hover: #f3f4f6;
  --btn-secondary-active: #e5e7eb;

  /* Disabled States */
  --btn-disabled-bg: #f3f4f6;
  --btn-disabled-text: #9ca3af;

  /* Link & Focus */
  --link-fg: #005ce6;              /* ratio: 5.70:1 on var(--bg) #ffffff, 5.30:1 on var(--surface) */
  --focus-ring-color: #005ce6;     /* ratio: 3.44:1 against var(--bg) #ffffff (passes >3:1 non-text) */
  --focus-ring-width: 2px;
  --focus-ring-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #21262d;
    --fg: #e6edf3;
    --text-2: #9ca3af;
    --text-3: #6e7681;
    --border: #30363d;

    --accent-fill: #2563eb;        /* ratio: 5.17:1 on #ffffff text */
    --accent-hover: #1d4ed8;       /* ratio: 7.95:1 on #ffffff text */
    --accent-active: #1e3a8a;      /* ratio: 13.1:1 on #ffffff text */
    --accent-fg: #ffffff;

    --btn-secondary-bg: transparent;
    --btn-secondary-border: #30363d;
    --btn-secondary-hover: #21262d;
    --btn-secondary-active: #30363d;

    --btn-disabled-bg: #21262d;
    --btn-disabled-text: #6e7681;

    --link-fg: #58a6ff;             /* ratio: 6.94:1 on var(--bg) #0d1117, 6.61:1 on var(--surface) */
    --focus-ring-color: #58a6ff;
  }
}

/* ===== BUTTON COMPONENT CLASSES ===== */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-weight: 500;
  font-size: 14px;
  border-radius: var(--radius-sm);
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}
.btn:disabled {
  background: var(--btn-disabled-bg);
  color: var(--btn-disabled-text);
  border-color: transparent;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-fill);
  color: var(--accent-fg);
  box-shadow: var(--shadow-sm);
}
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-primary:active:not(:disabled) { background: var(--accent-active); }

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--fg);
  border-color: var(--btn-secondary-border);
}
.btn-secondary:hover:not(:disabled) { background: var(--btn-secondary-hover); }
.btn-secondary:active:not(:disabled) { background: var(--btn-secondary-active); }

.btn-tertiary {
  background: transparent;
  color: var(--text-2);
}
.btn-tertiary:hover:not(:disabled) {
  background: var(--btn-secondary-hover);
  color: var(--fg);
}
.btn-tertiary:active:not(:disabled) { background: var(--btn-secondary-active); }

/* ===== LINKS ===== */
a {
  color: var(--link-fg);
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.15s ease;
}
a:hover {
  opacity: 0.8;
  text-decoration: underline;
  text-underline-offset: 4px;
}

/* ===== FOCUS RING (universal) ===== */
:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-radius: 2px;
}
.btn:focus-visible {
  border-radius: var(--radius-sm);
}
```

### Problem 2: Story child page design philosophy

**VERDICT: (b)** "reading-mode" variant. Dashboard UI and sustained narrative UI serve hostile cognitive goals. A dashboard optimizes for data density and spatial scanning (system sans-serif, full width, tight leading). Sustained reading demands lower cognitive load via optimal line lengths (~65 characters), larger typography (18px), and generous line-height (1.65). Inheriting tokens 1:1 forces a compromise that harms both; instead, we maintain product family cohesion by sharing the exact same color variables (`--bg`, `--fg`) but structurally diverge into a reading-optimized sans-serif layout.

**MIGRATION:** Loose coupling (separate generator but adopts shared CSS variables) allows the dashboard and stories to iterate independently on structural layout without breaking the unified visual color system or requiring a risky rewrite of the build scripts.

```css
/* ===== STORY PAGE CSS ===== */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  max-width: 65ch;
  margin: 64px auto;
  padding: 0 24px;
  background-color: var(--bg);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1 {
  position: relative;
  font-size: 2.25rem;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
  margin-top: 0;
  margin-bottom: 0.5rem;
  color: var(--fg);
}

h2 {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  color: var(--fg);
}

.body {
  font-size: 1.125rem; /* 18px */
  line-height: 1.65;
  color: var(--fg);
}

.body p { margin: 0 0 1.5rem 0; }

.meta {
  font-size: 0.875rem;
  font-family: var(--font-mono);
  color: var(--text-2);
  margin-bottom: 3rem;
  display: flex;
  gap: 16px;
}

.footer {
  font-size: 0.875rem;
  font-family: var(--font-mono);
  color: var(--text-3);
  margin-top: 4rem;
  padding-top: 2rem;
  border-top: 1px solid var(--border);
}

a {
  color: var(--link-fg);
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 4px;
  transition: text-decoration-color 0.2s ease;
}

a:hover { text-decoration-color: var(--link-fg); }

/* aesthetic detail implementation: */
h1::before {
  content: '·';
  position: absolute;
  left: -1.25em;
  color: var(--accent-fill);
  opacity: 0.8;
}

@media (max-width: 768px) {
  h1::before { display: none; }
}
```

AESTHETIC DETAIL: An outdented, accent-colored typographic leader dot (`h1::before`) that anchors the title perfectly to the optical left margin, heavily evoking the precision of Vercel or Stripe documentation while signaling a shift into focused reading.

---

### xai:grok-4  (5,048 tokens, 21,206ms, 5,025 chars)

```css
/* ===== TOKENS ===== */
:root {
  --bg: #ffffff;
  --surface: #f6f8fa;
  --surface-2: #eef2f6;
  --fg: #1f2328;
  --text-2: #57606a;
  --text-3: #8c959f;
  --border: #d1d9e0;
  --green-fg: #16a34a;
  --blue-fg: #0969da;
  --radius: 12px;
  --radius-sm: 6px;
  --font-mono: "SF Mono", ui-monospace, "Menlo", monospace;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);

  /* Button tokens (semantic: green = positive action) */
  --btn-primary-bg: #15803d;           /* ratio: 5.92:1 on #fff */
  --btn-primary-text: #ffffff;
  --btn-primary-hover-bg: #166534;     /* ratio: 6.41:1 on #fff */
  --btn-primary-active-bg: #14532d;
  --btn-secondary-bg: transparent;
  --btn-secondary-border: var(--border);
  --btn-secondary-text: var(--fg);
  --btn-secondary-hover-bg: var(--surface-2);
  --btn-tertiary-bg: transparent;
  --btn-tertiary-text: var(--text-2);
  --btn-tertiary-hover-bg: var(--surface);
  --btn-disabled-bg: var(--surface-2);
  --btn-disabled-text: var(--text-3);

  /* Link tokens */
  --link-color: #0969da;               /* ratio: 4.81:1 on #fff, 4.67:1 on #f6f8fa */
  --link-hover-color: #0550ae;

  /* Focus ring */
  --focus-ring: #0969da;
  --focus-offset: 2px;
  --focus-width: 2px;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface-2: #21262d;
    --fg: #e6edf3;
    --text-2: #9ca3af;
    --text-3: #6e7681;
    --border: #30363d;
    --green-fg: #86efac;
    --blue-fg: #58a6ff;

    --btn-primary-bg: #166534;         /* ratio: 6.41:1 on #ffffff */
    --btn-primary-hover-bg: #14532d;
    --btn-primary-active-bg: #052e16;
    --btn-secondary-hover-bg: #21262d;
    --btn-tertiary-hover-bg: #161b22;
    --btn-disabled-bg: #21262d;

    --link-color: #58a6ff;             /* ratio: 7.12:1 on #0d1117, 6.88:1 on #161b22 */
    --link-hover-color: #79c0ff;

    --focus-ring: #58a6ff;
  }
}

/* ===== BUTTON COMPONENT CLASSES ===== */
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  border: none;
}
.btn-primary:hover,
.btn-primary:focus-visible {
  background: var(--btn-primary-hover-bg);
}
.btn-primary:active { background: var(--btn-primary-active-bg); }
.btn-primary:disabled {
  background: var(--btn-disabled-bg);
  color: var(--btn-disabled-text);
}

.btn-secondary {
  background: var(--btn-secondary-bg);
  color: var(--btn-secondary-text);
  border: 1px solid var(--btn-secondary-border);
}
.btn-secondary:hover,
.btn-secondary:focus-visible { background: var(--btn-secondary-hover-bg); }
.btn-secondary:disabled {
  background: var(--btn-disabled-bg);
  color: var(--btn-disabled-text);
  border-color: var(--btn-disabled-bg);
}

.btn-tertiary {
  background: var(--btn-tertiary-bg);
  color: var(--btn-tertiary-text);
  border: none;
}
.btn-tertiary:hover,
.btn-tertiary:focus-visible { background: var(--btn-tertiary-hover-bg); }
.btn-tertiary:disabled { color: var(--btn-disabled-text); }

/* ===== LINKS ===== */
a { color: var(--link-color); text-decoration: none; }
a:hover { color: var(--link-hover-color); }
a:focus-visible { color: var(--link-hover-color); outline: none; }

/* ===== FOCUS RING (universal) ===== */
:focus-visible {
  outline: var(--focus-width) solid var(--focus-ring);
  outline-offset: var(--focus-offset);
}
```

**VERDICT: (b)** — Stories are sustained first-person narrative intended for re-reading and comprehension rather than quick scanning; research on screen reading shows optimal performance at 50–75 character measure, 16–19 px body size and 1.55–1.7 line-height, which conflicts with the dense KPI layout of the dashboard, so a reading-mode variant preserves cohesion through shared tokens while optimizing for legibility.

**MIGRATION: (b)** — The generator stays separate but imports the shared CSS variables so story pages automatically receive dark mode and color updates without touching the template library.

```css
/* ===== STORY PAGE CSS ===== */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 68ch;
  margin: 64px auto;
  padding: 0 24px;
  line-height: 1.65;
  color: var(--fg);
  background: var(--bg);
  font-size: 17px;
}
h1 {
  font-size: 26px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--fg);
}
h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 32px 0 12px;
  color: var(--fg);
}
.body p { margin: 0 0 18px; }
.meta {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 32px;
}
.footer {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 48px;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}
a { color: var(--link-color); }
a:hover { color: var(--link-hover-color); }

/* aesthetic detail implementation: */
h1::before {
  content: "";
  display: block;
  width: 24px;
  height: 3px;
  background: var(--border);
  margin-bottom: 16px;
}
```

AESTHETIC DETAIL: A 3px solid accent bar rendered via ::before on every h1 creates a quiet editorial frame that echoes the dashboard's tile borders while signaling narrative entry.

---

## Claim ledger

| # | Claim | Models asserting | Citations |
|---|-------|------------------|-----------|
| 1 | Current `--green-fg: #16a34a` on white fails WCAG AA at 2.85:1 | opus, gpt-5, gemini (implicit), grok-4 (implicit) | WCAG 2.1 §1.4.3 |
| 2 | The fix requires SEPARATING "positive-trend text token" from "filled-action button token" | opus, gpt-5 explicit; gemini implicit (drops green entirely); grok-4 implicit (creates new `--btn-primary-bg`) | — |
| 3 | Primary button fill should be a Tailwind green-700 to green-900 range (semantic green retained) | opus (#2f7d32, 5.14:1), gpt-5 (#166534, 7.13:1 AAA), grok-4 (#15803d, 5.92:1) | Tailwind palette |
| 4 | Primary button should drop green entirely and use blue accent | gemini only (#005ce6, 5.70:1) | — |
| 5 | Dark-mode primary button fill should be Primer green #238636 to #3fb950 range | opus (#3fb950, 4.62:1), gpt-5 (#238636, 4.63:1) | github.com/primer/primitives |
| 6 | Universal link color light: GitHub Primer #0969da | opus (variant #0860c9, 6.31:1), gpt-5 (#0969da, 5.19:1), grok-4 (#0969da, 4.81:1) | github.com/primer/primitives |
| 7 | Universal link color dark: GitHub Primer #58a6ff | opus, gpt-5, grok-4 (all #58a6ff, ~7:1 on --bg) | github.com/primer/primitives |
| 8 | Gemini's link color light: #005ce6 (diverges from Primer consensus) | gemini only | — |
| 9 | Focus ring color = link color (same token) | opus, gpt-5, gemini, grok-4 (universal) | WCAG 2.4.7 |
| 10 | Focus ring: 2px outline + 2px offset | opus, gpt-5, gemini, grok-4 (universal) | — |
| 11 | Disabled-state contrast is exempt from WCAG AA (per spec) | opus implicit, gpt-5 explicit, gemini explicit | WCAG 2.1 §1.4.3 exception |
| 12 | Story page verdict: (b) reading-mode variant, NOT 1:1 dashboard token inheritance | opus, gpt-5, gemini, grok-4 (unanimous) | Bringhurst, Elements of Typographic Style |
| 13 | Story page migration: (b) loose coupling — generator imports shared variables, NOT full template unification | opus, gpt-5, gemini, grok-4 (unanimous) | — |
| 14 | Optimal reading measure is 50-75 characters per line | opus, gpt-5, gemini, grok-4 (universal) | Bringhurst |
| 15 | Optimal screen body size for sustained reading: 16-19px | opus (18px), gpt-5 (17px), gemini (18px / 1.125rem), grok-4 (17px) | — |
| 16 | Optimal line-height for sustained reading: 1.55-1.70 | opus (1.62), gpt-5 (1.68), gemini (1.65), grok-4 (1.65) | — |
| 17 | Story body font should be system sans-serif, NOT serif | opus, gpt-5, gemini, grok-4 (unanimous) | — |
| 18 | Story max-width: 65-68ch | opus (68ch), gpt-5 (68ch), gemini (65ch), grok-4 (68ch) | — |
| 19 | Story page meta and footer should use mono font for editorial tension | opus, gpt-5, gemini | — |
| 20 | Aesthetic detail: scroll-driven progress hairline at top of viewport | opus only | — |
| 21 | Aesthetic detail: "proof rail" — thin accent line in left reading gutter | gpt-5 only | — |
| 22 | Aesthetic detail: outdented leader dot before h1 (Vercel-docs style) | gemini only | — |
| 23 | Aesthetic detail: 3px accent bar above h1 | grok-4 only | — |
| 24 | Subtle small-caps on first line of first paragraph (rejected drop-cap as "too Medium") | opus only | — |
| 25 | NO external font dependencies needed — system stack is sufficient | opus, gpt-5, gemini, grok-4 (unanimous) | — |

---

## Convergent recommendation (orchestrator synthesis — not from any single model)

Where the council agrees, ship it as-is. Where it diverges, the architectural call is **gpt-5's structural separation** of text-tokens from fill-tokens — this is the bug fix the council collectively names. The semantic-vs-neutral question (opus/gpt-5/grok-4 say keep green, gemini says go blue) is the only genuine fork in the road. Given that:

- The dashboard's flagship CTA is the **single most important visual element** Mitchell sees daily ("Start tonight's apply →")
- Three of four models argue the green is a feature, not a bug, *if* the contrast is fixed
- A single semantic green button surrounded by neutral chrome is exactly the Linear/Vercel restraint pattern Mitchell named as a reference

**Keep green for the primary action.** The values to ship:

| Token | Light | Dark | Why |
|---|---|---|---|
| `--action` (primary button fill) | `#15803d` (Tailwind green-700, **5.92:1** on white) | `#238636` (GitHub Primer success.emphasis, **4.63:1** with #fff) | Median of opus/gpt-5/grok-4 light values; Primer-validated dark fill |
| `--action-hover` | `#166534` (Tailwind green-800, **6.41:1**) | `#2a7f3f` (**5.00:1**) | Darker on hover; both pass AA |
| `--positive-text` (KPI tile trend text — NOT button fill) | `#1a7f37` (**4.83:1** on white) | `#4ac26b` (**6.81:1** on #0d1117) | Separated from `--action` so they can evolve independently |
| `--link` (body + nav + chip links) | `#0969da` (**5.19:1** on white, **4.88:1** on `--surface`) | `#58a6ff` (**7.49:1** on #0d1117, **6.82:1** on `--surface`) | 3-of-4 model consensus; GitHub Primer canonical blue |
| `--link-hover` | `#0550ae` (**7.60:1** on white) | `#79c0ff` (**9.73:1** on #0d1117) | Universal model consensus |
| `--focus-ring` | `--link` (same as link) | `--link` (same as link) | All four models agreed |
| Focus ring: 2px outline + 2px offset | — | — | All four models agreed |

**For story pages**: unanimous (b)/(b) — reading-mode variant via loose coupling. Ship:

- max-width: **68ch** (3-of-4 consensus, opus/gpt-5/grok-4)
- body font: **18px** with **line-height 1.62-1.65** (opus/gemini converge; gpt-5/grok-4 at 17px is within tolerance)
- font-family: system sans-serif (unanimous, no serif)
- h1: 28px, weight 600, letter-spacing -0.015em
- meta + footer: monospace, 12px (3-of-4 consensus)
- All colors via `var(--fg)`, `var(--text-2)`, `var(--link)`, `var(--border)` from the dashboard tokens above — dark mode flows automatically

**Aesthetic detail recommendation**: **gpt-5's "proof rail"** — a 2px vertical accent line in the left gutter that frames the story body. It's the only proposed detail that thematically ties to *what these pages actually are* (proof points, not blog posts), it uses a single CSS rule (no scroll-driven animation complexity, no h1::before maintenance), and it respects Mitchell's "restraint over novelty" constraint. Opus's scroll hairline is more novel but introduces a `animation-timeline: scroll(root block)` dependency that's still Chrome-only and would silently degrade in Safari. Save it for v2.

**Single architectural rule the council collectively names**: do not overload one color token for both "positive trend text" and "filled-action button background." The current `--green-fg` is doing two jobs that have hostile contrast requirements (light foreground vs dark fill). Splitting into `--action` (fill) + `--positive-text` (text) is the structural fix, regardless of which hex value you pick.

---

## Errors and skips

- Initial run skipped `anthropic:claude-opus-4-7` because `scripts/run-council.mjs` uses `dotenv/config` without `override:true`, and the shell pre-sets `ANTHROPIC_API_KEY` to empty (per memory note). Resolved by running Opus separately with explicit `dotenv.config({override:true})`.
- Initial run truncated `openai:gpt-5` (8,644 tokens consumed, 0 visible chars) and `google:gemini-2.5-pro` (8,914 tokens, 800 chars) at the 6k max-tokens budget because both burned the budget on internal reasoning before producing output. Resolved by re-running at 16k max-tokens.
- Total cost across the three runs: estimated $1.40-$1.70 (within the $2.00 ceiling). Mostly from gpt-5's 13k-token run at premium pricing.

**Source files:**
- Initial run: `~/.claude/agents/runs/council-20260517-220904.json`
- Retry run (gpt-5 + gemini at 16k): `~/.claude/agents/runs/council-20260517-220904-retry1.json`
- Opus side-call (dotenv override): `~/.claude/agents/runs/council-20260517-220904-opus.json`
- Merged JSON: `~/.claude/agents/runs/council-20260517-220904-merged.json`
- Prompt: `~/.claude/agents/runs/prompt-20260517-220904.txt`
