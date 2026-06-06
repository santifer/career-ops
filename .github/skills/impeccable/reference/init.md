# Init Flow

The setup command for a project. One codebase crawl feeds everything it writes:

- **PRODUCT.md** (strategic): root project file for register, target users, product purpose, brand personality, anti-references, strategic design principles. Answers "who/what/why".
- **DESIGN.md** (visual): root project file for visual theme, color palette, typography, components, layout. Follows the [Google Stitch DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/format/). Answers "how it looks".
- **`.impeccable/live/config.json`** (live mode): pre-configured so `/impeccable live` boots straight into variant mode with no first-time detour.

It closes by pointing the user at the best command to run next. Every other impeccable command reads PRODUCT.md and DESIGN.md before doing any work.

## Step 1: Load current state

Check what already exists. PRODUCT.md and DESIGN.md live at the project root, or under `.agents/context/` or `docs/` (case-insensitive). Read whichever are present with your native file tool. Also note whether `.impeccable/live/config.json` already exists (Step 6 leaves it untouched if so).

Decision tree:
- **Neither file exists (empty project or no context yet)**: do Steps 2-4 (write PRODUCT.md), then decide on DESIGN.md based on whether there's code to analyze.
- **PRODUCT.md exists, DESIGN.md missing**: skip to Step 5 and offer to run `/impeccable document` for DESIGN.md.
- **PRODUCT.md exists but has no `## Register` section (legacy)**: add it. Infer a hypothesis from the codebase (see Step 2), confirm with the user, write the field.
- **Both exist**: ask the user directly to clarify what you cannot infer. Ask which file to refresh. Skip the one the user doesn't want changed.
- **Just DESIGN.md exists (unusual)**: do Steps 2-4 to produce PRODUCT.md.

Never silently overwrite an existing file. Always confirm first.

If init was invoked as a setup blocker by another command, such as `/impeccable craft landing page`, pause that command here. Complete init, then resume the original command. Your own writes are the freshest source; no reload needed. For craft, resume into shape next; init creates project context, but it is not a substitute for the task-specific shape interview and confirmed design brief.

## Step 2: Explore the codebase

Before asking questions, thoroughly scan the project to discover what you can. This single crawl feeds PRODUCT.md, DESIGN.md, **and** the live-mode framework detection in Step 6, so be thorough once rather than re-scanning later:

- **README and docs**: Project purpose, target audience, any stated goals
- **Package.json / config files**: Tech stack, dependencies, existing design libraries, **and the framework** (Vite/SPA, Next.js, Nuxt, SvelteKit, Astro, multi-page static) plus the HTML entry the browser actually loads
- **Existing components**: Current design patterns, spacing, typography in use
- **Brand assets**: Logos, favicons, color values already defined
- **Design tokens / CSS variables**: Existing color palettes, font stacks, spacing scales
- **Any style guides or brand documentation**

Also form a **register hypothesis** from what you find:

- Brand signals: `/`, `/about`, `/pricing`, `/blog/*`, `/docs/*`, hero sections, big typography, scroll-driven sections, landing-page-shaped content.
- Product signals: `/app/*`, `/dashboard`, `/settings`, `/(auth)`, forms, data tables, side/top nav, app-shell components.

Register is a hypothesis at this point, not a decision; Step 3 confirms it.

Note what you've learned and what remains unclear. Also note any rough edges worth a follow-up command (thin hierarchy, flat or gray palette, missing error/empty states, dull copy); Step 7 turns these into concrete recommendations without re-analyzing.

## Step 3: Ask strategic questions (for PRODUCT.md)

ask the user directly to clarify what you cannot infer. Ask only about what you couldn't infer from the codebase.

### Interview mode, not confirmation mode

If the repo is empty or the user's brief is sparse, run a short interview before proposing PRODUCT.md. Do **not** turn a one-sentence request into a complete inferred PRODUCT.md and ask for blanket confirmation.

- Use the harness's structured question tool when one exists. Otherwise, ask directly in chat and stop.
- Ask **2-3 questions per round**, then wait for answers.
- Use inferred answers as hypotheses or options, not as finished facts.
- Complete at least one real user-answer round before drafting PRODUCT.md, unless every required answer is directly discoverable from repo docs.
- Round 1 should establish register, users/purpose, and desired outcome.
- Round 2 should establish brand personality or references, anti-references, and accessibility needs.

### Minimum viable interview

Ask enough to complete PRODUCT.md. At minimum, cover register confirmation, users and purpose, brand personality, anti-references, and accessibility needs unless each answer is directly discoverable from repo context. After at least one interview round, you may propose inferred answers, but the user must confirm them before you write PRODUCT.md. Never synthesize PRODUCT.md from the original task prompt alone.

### Register (ask first; it shapes everything below)

Every design task is either **brand** (marketing, landing, campaign, long-form content, portfolio: design IS the product) or **product** (app UI, admin, dashboards, tools: design SERVES the product).

If Step 2 produced a clear hypothesis, lead with it: *"From the codebase, this looks like a [brand / product] surface. Does that match your intent, or should we treat it differently?"*

If the signal is genuinely split (e.g. a product with a big marketing landing), ask the user directly to clarify what you cannot infer. Ask which register describes the **primary** surface. The register can be overridden per task later, but PRODUCT.md carries one default.

### Users & Purpose
- Who uses this? What's their context when using it?
- What job are they trying to get done?
- For brand: what emotions should the interface evoke? (confidence, delight, calm, urgency)
- For product: what workflow are they in? What's the primary task on any given screen?

### Brand & Personality
- How would you describe the brand personality in 3 words?
- Reference sites or apps that capture the right feel? What specifically about them?
  - Push for specific named references with the *specific* thing about them that fits this brand, not generic "modern" adjectives or category-bucket lanes.
- What should this explicitly NOT look like? Any anti-references?

### Accessibility & Inclusion
- Specific accessibility requirements? (WCAG level, known user needs)
- Considerations for reduced motion, color blindness, or other accommodations?

Skip questions where the answer is already clear. **Do NOT ask about colors, fonts, radii, or visual styling here.** Those belong in DESIGN.md, not PRODUCT.md.

## Step 4: Write PRODUCT.md

Write PRODUCT.md only after the user has confirmed the strategic answers from Step 3. If an inferred answer is uncertain or unconfirmed, ask before writing.

Synthesize into a strategic document:

```markdown
# Product

## Register

product

## Users
[Who they are, their context, the job to be done]

## Product Purpose
[What this product does, why it exists, what success looks like]

## Brand Personality
[Voice, tone, 3-word personality, emotional goals]

## Anti-references
[What this should NOT look like. Specific bad-example sites or patterns to avoid.]

## Design Principles
[3-5 strategic principles derived from the conversation. Principles like "practice what you preach", "show, don't tell", "expert confidence". NOT visual rules like "use OKLCH" or "magenta accent".]

## Accessibility & Inclusion
[WCAG level, known user needs, considerations]
```

Register is either `brand` or `product` as a bare value. No prose, no commentary.

Write to `PROJECT_ROOT/PRODUCT.md`. If `.impeccable.md` existed, the loader already renamed it; merge into that content rather than starting from scratch.

## Step 5: Decide on DESIGN.md

Offer `/impeccable document` either way. Two paths:

- **Code exists** (CSS tokens, components, a running site): "I can generate a DESIGN.md that captures your visual system (colors, typography, components) so variants stay on-brand. Want to do that now?"
- **Pre-implementation** (empty project): "I can seed a starter DESIGN.md from five quick questions about color strategy, type direction, motion energy, and references. You can re-run once there's code, to capture the real tokens. Want to do that now?"

If the user agrees, delegate to `/impeccable document` (it auto-detects scan vs seed). Load its reference and follow that flow.

If the user prefers to skip, mention they can run `/impeccable document` any time later.

## Step 6: Configure live mode (when code exists)

If the project has code with HTML entries and a dev server (the same "code exists" condition that puts `/impeccable document` in scan mode), pre-configure live mode now. You already identified the framework and the served HTML entry in Step 2, so this is nearly free, and it spares the user the first-time setup detour when they later run `/impeccable live`.

**Skip this step for empty / pre-implementation projects** (nothing to inject into yet). Tell the user live mode will configure itself the first time they run it once there's code.

**If `.impeccable/live/config.json` already exists, leave it untouched** and note that live mode is already configured.

Otherwise:

1. Write `.impeccable/live/config.json`. Choose `files` (the HTML entries the browser actually loads), `insertBefore`, and `commentSyntax` from the framework table in [live.md](live.md)'s **First-time setup** section, using the framework you found in Step 2. That table is canonical; do not restate it here. For multi-page static sites, prefer a glob (`["public/**/*.html"]`) over a literal list.
2. Run `node .github/skills/impeccable/scripts/detect-csp.mjs`. If it reports a patchable shape (`append-arrays` / `append-string`), use the **consent prompt template** from live.md before editing any source file. On decline, skip the patch. For `middleware` / `meta-tag` shapes, surface the detected files and ask the user to add `http://localhost:8400` to `script-src` and `connect-src` manually. For `null`, there's nothing to do.
3. Set `cspChecked: true` in the config once CSP is handled (patched, declined, manual, or not needed). The schema and per-shape patch details live in live.md's First-time setup; follow it rather than duplicating.

Writing the config file is harmless and needs no consent; only the CSP **source-file patch** requires a yes.

## Step 7: Recommend starting points, then wrap up

Summarize tersely:
- Register captured (brand / product)
- What was written (PRODUCT.md, DESIGN.md, live config, or a subset)
- The 3-5 strategic principles from PRODUCT.md that will guide future work
- If DESIGN.md or live config is pending, one line on how to set it up later

Then recommend the **best commands to run next**, drawn from what your Step 2 crawl already surfaced. Do not run a fresh analysis here; surface observations you already have. Tailor to register and to what you saw, offer the 2-4 most relevant (not a menu dump), and give the exact command to type. Group by intent:

- **Build something new**: `/impeccable craft <feature>` (shape, then build end-to-end) or `/impeccable shape <feature>` (plan first). Lead with this for empty or early-stage projects.
- **Improve what's there**: name the specific surface. `/impeccable critique <page>` for a scored UX review; `/impeccable audit <area>` for a11y / perf / responsive checks; `/impeccable polish <component>` for a pre-ship pass. When the crawl flagged a specific weakness, point the matching command at it: thin hierarchy or spacing → `layout`, flat or gray palette → `colorize`, missing error / empty states → `harden` or `onboard`, dull or unclear copy → `clarify`.
- **Iterate visually**: `/impeccable live` (configured in Step 6) to pick elements in the browser and generate variants in place.

The full command menu is one bare `/impeccable` away; keep this list short and pointed.

If init was invoked as a blocker by another impeccable command (e.g. the user ran `/impeccable polish` with no PRODUCT.md), resume that original task now. Your own writes are the freshest source; no reload needed.

Optionally ask the user directly to clarify what you cannot infer. Ask whether they'd like a brief summary of PRODUCT.md appended to .github/copilot-instructions.md for easier agent reference. If yes, append a short **Design Context** pointer section there.
