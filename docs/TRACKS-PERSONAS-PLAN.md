# Profile Tracks & Personas — Implementation Plan

> **Branch:** `feat/profile-tracks-and-personas`
> **Status:** Planning complete, implementation not started.
> **Date:** 2026-04-06

---

## Executive Summary

Career-ops is a prompt-driven, Claude-interpreted pipeline. Almost all personalization logic lives in Claude's context (the mode `.md` files) rather than in code. Extending the system mostly means **extending the data model in config files and extending the instructions in mode files**, not rewriting scripts.

The proposed extension adds two independent concepts:

| Concept | Scope | Purpose |
|---|---|---|
| **Profile Track** | Which slice of your experience to foreground | Builder vs. Leadership framing |
| **Persona** | Which contact block to use | UK vs. US identity details |

Both sit on top of the existing archetype system, which stays unchanged. The existing single-profile path becomes the default fallback.

---

## A. Current-State Findings

### Where resume generation logic lives

| Phase | File(s) | What happens |
|---|---|---|
| Archetype classification | `modes/_shared.md`, `modes/oferta.md` | Claude reads JD and maps to one of 6 archetypes |
| CV personalization plan | `modes/oferta.md` Block E | 5 CV rewrites + 5 LinkedIn angle changes proposed |
| PDF generation instructions | `modes/pdf.md` | All keyword/project/bullet/language/region decisions |
| HTML rendering | `templates/cv-template.html` | Static `{{PLACEHOLDER}}` substitution filled by Claude |
| PDF render script | `generate-pdf.mjs` | Puppeteer: HTML file → PDF, accepts `--format` flag |
| Full pipeline trigger | `modes/auto-pipeline.md` | Chains oferta + pdf + tracker write |

### Current data model

Everything flows from two files:

```
cv.md                      — canonical CV, human-readable markdown
config/profile.yml         — identity, archetypes, comp targets, proof points
```

`cv.md` is the single source of truth for experience content. `profile.yml` holds meta-identity (name, contact, headline, archetypes) and structured proof points. There is **no separation** between different "versions" of the candidate — one flat identity serves all evaluations.

### Decision points in `modes/pdf.md`

1. **Language detection** — reads JD language → sets `{{LANG}}` placeholder
2. **Region/page format** — US/Canada JDs → `letter`; else → `a4`
3. **Keyword extraction** — 15–20 terms from JD
4. **Project selection** — top 3–4 most relevant from cv.md
5. **Bullet reordering** — relevance-ranked per JD
6. **Summary rewrite** — injected with archetype framing + JD keywords
7. **Competency grid** — 6–8 tags from intersection of cv.md skills + JD keywords
8. **Template fill** — populates all `{{...}}` placeholders
9. **PDF render** — `node generate-pdf.mjs ...`

### Files affected by proposed change

| File | Currently | Change scope |
|---|---|---|
| `config/profile.yml` | Single flat identity | Add `tracks:` + `personas:` sections |
| `modes/_shared.md` | 6 archetypes, global rules | Add track definitions, selection rules |
| `modes/pdf.md` | Single-track generation | Add track-aware project/bullet/summary selection |
| `modes/oferta.md` | Single-archetype framing | Add track context to Block E personalization |
| `modes/auto-pipeline.md` | Invokes oferta + pdf | Pass track/persona as context |
| `templates/cv-template.html` | Static placeholders | Add `{{PHONE}}`, `{{LOCATION_LINE}}`, `{{AUTHORIZATION}}` variants |
| `batch/batch-prompt.md` | Workers read profile | Workers need to forward track/persona |
| `modes/batch.md` | Invokes workers | Forward track/persona flags |
| `.claude/skills/career-ops/SKILL.md` | Skill definition | Document new flags |
| `CLAUDE.md` | System instructions | Add routing table entries for new flags |
| `config/profile.example.yml` | Reference template | Add example tracks + personas |
| **NEW** `config/tracks.example.yml` | — | Optional reference schema for track definitions |
| **NEW** `config/personas.example.yml` | — | Optional reference schema for persona definitions |

### No existing tests

No test files, fixtures, or CI pipelines exist. Test coverage is entirely implicit (`verify-pipeline.mjs` does post-hoc health checks on the tracker only).

---

## B. Proposed Architecture

### Core concepts and their relationships

```
Persona      ─── operational identity (contact, location, auth)
    │
Profile Track ─── content framing (which experience to foreground)
    │
Archetype    ─── role framing (how to position for a specific job type)
    │
Per-job      ─── JD adaptation (keywords, bullets, project selection)
```

These are nested, not competing. Selection order: **persona → track → archetype → per-job**.

### Where routing should happen

Track and persona selection must be resolved **before** `modes/pdf.md` begins. The earliest natural point is in `modes/auto-pipeline.md` (or the opening of `modes/oferta.md` when called standalone). This keeps the PDF generation logic unaware of the decision — it just receives resolved values.

### Track selection strategy: hybrid (infer + overrideable)

**Auto-infer from JD**, but the user can override via a prefix flag. In 80% of cases the JD signal is unambiguous; for the ambiguous 20%, the user gets an explicit prompt to choose.

Inference rules (defined in `_shared.md`):
- JD contains IC/builder signals ("implement", "architect", "build", "engineer", "ship") → infer `builder`
- JD contains leadership signals ("manage", "lead team", "strategy", "stakeholders", "OKRs", "director") → infer `leadership`
- Both present → flag as hybrid, ask for override unless a track was forced

### Truthfulness guarantee with multiple tracks

Different tracks only reframe **evidence that already exists in cv.md**. A bullet that appears under the `leadership` track must have a source citation in cv.md. The same rule applies to track-specific summaries and project selections: they must be drawn from cv.md proof points, never invented.

The track definition itself carries a "permitted evidence pool" — a tag list that scopes which cv.md sections are primary for that track.

---

## C. Migration Strategy

### Branch strategy

Work on `feat/profile-tracks-and-personas` (already active). Merge to `main` via PR once the full feature is stable.

### Feature flag / config gating

Add a `features:` block in `config/profile.yml`:

```yaml
features:
  profile_tracks: true      # set false to fall back to current behavior
  personas: true            # set false to disable personas
```

When either flag is `false` (or the section is absent), all mode files fall back to the current single-profile behavior without error.

### Backwards-compatible defaults

- No `--track` flag + ambiguous JD → ask user once; default to `builder` if no answer.
- No `--persona` flag → use `default` persona, which maps to the existing single contact block.
- Existing `profile.yml` files without `tracks:` or `personas:` keys work unchanged.

### Rollback

Revert is a single `git revert` or branch switch. No data migrations. The tracker, applications.md, and reports are append-only and untouched by this feature.

---

## D. File-by-File Change Plan

| File | Action | What changes | Risk |
|---|---|---|---|
| `config/profile.yml` | Extend | Add `tracks:`, `personas:`, `features:` sections | Low — additive, fallback defaults |
| `config/profile.example.yml` | Extend | Same additions as above, documented | Low |
| `modes/_shared.md` | Extend | Add track definitions, track inference rules, persona definitions, updated global rules | Medium — all modes read this |
| `modes/pdf.md` | Extend | Add track-aware project/bullet/summary selection; persona-aware contact block population | Medium — core generation |
| `modes/oferta.md` | Extend | Add track context to Block E (personalization plan) | Low — additive block |
| `modes/auto-pipeline.md` | Extend | Resolve track + persona before invoking oferta/pdf | Low — orchestration only |
| `templates/cv-template.html` | Extend | Add `{{PHONE}}`, `{{LOCATION_LINE}}`, `{{AUTHORIZATION}}` placeholders | Medium — template change |
| `batch/batch-prompt.md` | Extend | Accept `TRACK` and `PERSONA` env variables at top of prompt | Low — env var pass-through |
| `modes/batch.md` | Extend | Forward track/persona flags to worker invocations | Low |
| `.claude/skills/career-ops/SKILL.md` | Extend | Document `--track` and `--persona` flags | Low |
| `CLAUDE.md` | Extend | Add routing table entries for track/persona flags | Low |
| **NEW** `config/tracks.example.yml` | Create | Reference schema for track definitions (optional) | None |
| **NEW** `config/personas.example.yml` | Create | Reference schema for persona definitions (optional) | None |

---

## E. Data Model Proposal

### Extended `config/profile.yml`

```yaml
# ── existing fields stay unchanged ──────────────────────────────
name: Your Name
email: you@example.com
linkedin: https://linkedin.com/in/yourname
portfolio: https://yoursite.dev
github: https://github.com/yourname

# ── NEW: feature flags ──────────────────────────────────────────
features:
  profile_tracks: true
  personas: true

# ── NEW: profile tracks ─────────────────────────────────────────
tracks:
  default: builder          # fallback when no flag and no JD signal

  builder:
    label: "AI / Product Builder"
    headline: "AI Engineer & Product Builder — shipping agent systems end to end"
    summary_focus: |
      Frame as hands-on technical builder: agent systems, LLM pipelines,
      applied ML, fast prototyping, production delivery.
    primary_sections:
      - experience
      - projects
      - skills
    preferred_archetypes:
      - llmops
      - agentic
      - forward_deployed
    evidence_tags:
      - built
      - shipped
      - architected
      - automated
      - llm
      - agent
      - api

  leadership:
    label: "Leadership / Design-Facing / Cross-Functional"
    headline: "Head of Applied AI — leading AI teams across product, design, and engineering"
    summary_focus: |
      Frame as leader and multiplier: team building, cross-functional alignment,
      strategic AI roadmaps, executive communication, adoption at scale.
    primary_sections:
      - experience
      - projects
      - skills
    preferred_archetypes:
      - ai_pm
      - transformation
      - solutions_architect
    evidence_tags:
      - led
      - managed
      - directed
      - aligned
      - stakeholder
      - strategy
      - team

# ── NEW: personas (contact / region variants) ───────────────────
personas:
  default: uk               # which persona to use when none is specified

  uk:
    label: "UK"
    phone: "+44 7XXX XXXXXX"
    location_line: "London, UK"
    address_display: "London, United Kingdom"
    timezone: "GMT / BST (UTC+0 / UTC+1)"
    page_format_override: a4
    authorization_line: "Right to Work: British Citizen"
    date_format: DD/MM/YYYY

  us:
    label: "US"
    phone: "+1 (XXX) XXX-XXXX"
    location_line: "New York, NY"
    address_display: "New York, United States"
    timezone: "EST / EDT (UTC-5 / UTC-4)"
    page_format_override: null    # let region detection decide
    authorization_line: "Work Authorization: US Citizen / OPT"
    date_format: MM/DD/YYYY
```

### Optional bullet tagging in `cv.md` (additive, backwards-compatible)

Add lightweight inline tags to bullets using a comment suffix. Untagged bullets fall through to all tracks (current behavior preserved).

```markdown
## Experience

### Head of Applied AI — Acme Corp (2023–present)
- Built multi-agent orchestration system handling 50K daily transactions. <!-- tags: built, agent, llm -->
- Managed team of 8 engineers across 3 time zones. <!-- tags: led, managed, team -->
- Defined AI roadmap with CPO and CTO, aligned 4 product squads. <!-- tags: strategy, stakeholder, aligned -->
```

### Type reference (pseudo-TypeScript)

```typescript
type TrackId = "builder" | "leadership" | string;
type PersonaId = "uk" | "us" | string;
type ArchetypeId = "llmops" | "agentic" | "ai_pm" | "solutions_architect"
                 | "forward_deployed" | "transformation";

interface ProfileTrack {
  label: string;
  headline: string;
  summary_focus: string;
  primary_sections: string[];
  preferred_archetypes: ArchetypeId[];
  evidence_tags: string[];
}

interface Persona {
  label: string;
  phone: string;
  location_line: string;
  address_display: string;
  timezone: string;
  page_format_override: "a4" | "letter" | null;
  authorization_line: string;
  date_format: string;
}

interface RenderContext {
  track: ProfileTrack;
  persona: Persona;
  archetype: ArchetypeId;
  jd_keywords: string[];
  detected_language: "en" | "es" | string;
  page_format: "a4" | "letter";
}
```

---

## F. Selection Logic

### Plain English

1. **Persona selection** — check `--persona` flag; else use `personas.default`; else fall back to existing flat contact block.
2. **Track selection** — check `--track` flag; else scan JD for builder vs. leadership signals. If signal is clear (≥70% one way), auto-select. If ambiguous, prompt user once; fall back to `tracks.default` (`builder`).
3. **Archetype selection** — existing logic, unchanged. Track's `preferred_archetypes` is a soft hint; JD signal overrides.
4. **Project selection** — filter cv.md projects by track `evidence_tags` (if tags present), then rank by JD keyword relevance. Select top 3–4.
5. **Bullet ranking** — if bullets have tags, filter by track `evidence_tags` first; then rank by JD relevance. If no tags, rank by JD relevance only (current behavior).
6. **Summary generation** — use track's `summary_focus` as framing directive; inject top 5 JD keywords; must cite real cv.md proof points.
7. **Contact block** — populate `{{PHONE}}`, `{{LOCATION_LINE}}`, `{{AUTHORIZATION}}` from selected persona.
8. **Page format** — use `persona.page_format_override` if set; else use JD region detection.
9. **Render** — call `node generate-pdf.mjs` as today.

### Pseudocode

```
function resolveRenderContext(jd, flags, profile):

  # Persona
  personaId = flags.persona ?? profile.personas.default ?? "default"
  persona = profile.personas[personaId] ?? profile  # fallback: old flat profile

  # Track
  if flags.track:
    trackId = flags.track
    trackConfidence = "forced"
  else:
    signal = inferTrackFromJD(jd)
    if signal.confidence >= 0.70:
      trackId = signal.track
      trackConfidence = "inferred"
    else:
      trackId = askUser("builder or leadership?") ?? profile.tracks.default ?? "builder"
      trackConfidence = "user_selected"
  track = profile.tracks[trackId]

  # Archetype (existing logic)
  archetype = classifyArchetype(jd, preferredList=track.preferred_archetypes)

  # Keywords
  keywords = extractKeywords(jd)   # 15-20 terms

  # Language + page format
  language = detectLanguage(jd)
  pageFormat = persona.page_format_override
              ?? (isUSorCanada(jd) ? "letter" : "a4")

  return RenderContext(track, persona, archetype, keywords, language, pageFormat)


function generateCV(jd, context, cv):

  # Projects
  if context.track.evidence_tags:
    scoredProjects = score(cv.projects,
      factors=[tagMatch(context.track.evidence_tags), jdRelevance(context.jd_keywords)])
  else:
    scoredProjects = score(cv.projects, factors=[jdRelevance(context.jd_keywords)])
  selectedProjects = top(scoredProjects, 4)

  # Bullets
  for each job in cv.experience:
    if bullets have tags:
      filtered = bulletsByTag(job.bullets, context.track.evidence_tags)
      if len(filtered) < 3:
        filtered = job.bullets  # fallback: use all bullets, log warning
    else:
      filtered = job.bullets   # all bullets, current behavior
    job.bullets = rankByJDRelevance(filtered, context.jd_keywords)

  # Summary
  summary = rewriteSummary(
    base=cv.summary,
    frame=context.track.summary_focus,
    archetype=context.archetype,
    keywords=context.jd_keywords[:5],
    rule="must cite real cv proof points only"
  )

  # Contact block
  contactBlock = {
    phone: context.persona.phone,
    location: context.persona.location_line,
    authorization: context.persona.authorization_line
  }

  # Fill template
  html = fillTemplate("templates/cv-template.html", {
    NAME: cv.name,
    EMAIL: cv.email,
    PHONE: contactBlock.phone,
    LOCATION_LINE: contactBlock.location,
    AUTHORIZATION: contactBlock.authorization,
    SUMMARY_TEXT: summary,
    COMPETENCIES: buildCompetencyGrid(cv.skills, context.jd_keywords),
    EXPERIENCE: renderExperience(cv.experience),
    PROJECTS: renderProjects(selectedProjects),
    EDUCATION: cv.education,
    LANG: context.language,
    PAGE_WIDTH: pageWidthFor(context.pageFormat)
  })

  # Render
  writeFile("/tmp/cv-{company}.html", html)
  run("node generate-pdf.mjs /tmp/cv-{company}.html output/cv-{company}-{date}.pdf --format={pageFormat}")
```

---

## G. CLI / UX Impact

### New optional flags

```
/career-ops --track builder     # force AI/builder track
/career-ops --track leadership  # force leadership track
/career-ops --persona uk        # force UK contact block
/career-ops --persona us        # force US contact block
```

Flags can be combined:

```
/career-ops --track leadership --persona us
```

### Batch mode

Add two optional env variables to `batch-runner.sh`:

```bash
CAREER_OPS_TRACK=builder CAREER_OPS_PERSONA=uk ./batch/batch-runner.sh input.tsv
```

Workers receive these as context at the top of `batch-prompt.md`.

### Default behavior

- No flags + unambiguous JD → auto-select track silently, log in report header
- No flags + ambiguous JD → one-line prompt to user before generating CV
- No persona flag → use `personas.default` from profile.yml

### Examples

```
# Auto-select track from JD
https://jobs.anthropic.com/123

# Force leadership track
/career-ops --track leadership
https://jobs.google.com/456

# Force UK contact, auto-detect track
/career-ops --persona uk
https://jobs.deepmind.com/789

# Both explicit
/career-ops --track builder --persona us
https://jobs.openai.com/012
```

---

## H. Test Strategy

### Backwards compatibility (manual regression)

| Scenario | Expected | How to verify |
|---|---|---|
| `profile.yml` without `tracks:` | Behavior identical to today | Run a known evaluation, compare report structure |
| `profile.yml` without `personas:` | Existing contact block used | Check PDF contact header |
| No `--track` flag, unambiguous builder JD | `builder` selected silently | Report header shows inferred track |
| No `--track` flag, unambiguous leadership JD | `leadership` selected silently | Report header shows inferred track |
| `node generate-pdf.mjs` unchanged call | PDF generates normally | Run against existing HTML fixture |

### Track selection

| Scenario | Expected |
|---|---|
| JD with "implement", "ship", "engineer" | `builder` inferred |
| JD with "manage team", "lead strategy", "OKRs" | `leadership` inferred |
| JD with both signals | Ambiguous flag raised, user prompted |
| `--track builder` forced on leadership-heavy JD | `builder` used, mismatch noted in report |

### Persona / contact selection

| Scenario | Expected |
|---|---|
| `--persona uk` | UK phone + UK location in PDF |
| `--persona us` | US phone + US location in PDF |
| No persona flag + `personas.default: uk` | UK contact block used |
| US persona on UK JD | US contact block; page format by JD region unless override set |
| UK persona + US JD | UK contact block + letter (no override) or a4 (if override set) |

### Truthfulness

- Every bullet in PDF output must have a source in cv.md
- Run same JD through both tracks: both outputs must be derivable from same cv.md — different emphasis, not different facts
- Grep JD keywords against cv.md to confirm underlying concepts exist before injection

### Determinism

Running same JD + same flags twice → identical text content in output PDF (binary may differ due to Chromium timestamps).

### Regression fixture

Keep a known-good HTML fixture at `tests/fixtures/cv-fixture.html`. Verify `node generate-pdf.mjs tests/fixtures/cv-fixture.html tests/output/regression.pdf --format=a4` exits 0 with non-zero output size.

---

## I. Risks and Edge Cases

| Risk | Severity | Mitigation |
|---|---|---|
| **JD is hybrid (builder + leadership)** | Medium | Explicit prompt to user; track selection logged in report header |
| **US company but candidate wants UK number** | Low | Persona always decoupled from JD region detection; use `--persona uk` regardless |
| **Same experience in both tracks, different framing** | Low | Both use cv.md as source; framing varies but facts don't |
| **Insufficient bullets for selected track** | Medium | If tag-filtered bullets < 3 per job, fall back to all bullets + log warning |
| **Archetype conflicts with selected track** | Low | Preferred archetype list is a soft hint, not hard constraint; mismatch noted in report |
| **Batch workers don't receive track/persona** | High | Test batch path explicitly; workers must receive env vars or context at prompt header |
| **Old applications.md has no track column** | None | Track logged in report headers only, not tracker table |
| **cv-template.html contact block hardcoded** | Medium | Requires adding `{{PHONE}}` and `{{LOCATION_LINE}}`; test against current PDF output before merging |
| **Report filename collision** | Low | Multi-track evals of same job get same filename; fix: append `-{trackId}-{personaId}` suffix when tracks enabled |
| **authorization_line overflows 1-page CV** | Low | Monitor PDF page count after template change |
| **persona.phone empty for a variant** | Medium | Validate at render time; fall back to other persona's phone with warning in report |

---

## J. Implementation Order

Work in `feat/profile-tracks-and-personas`. Small, reviewable commits.

### Milestone 1 — Data model only (no behavior change)

- **Commit 1.1** — Extend `config/profile.example.yml`: add `features:`, `tracks:`, `personas:` with documentation comments
- **Commit 1.2** — Extend `config/profile.yml`: add the same sections; gate behind `features.profile_tracks: false` initially
- **Commit 1.3** — Update `templates/cv-template.html`: refactor contact block to use `{{PHONE}}`, `{{LOCATION_LINE}}`, `{{AUTHORIZATION}}`; verify existing PDF output unchanged

### Milestone 2 — Persona support (narrower scope first)

- **Commit 2.1** — Update `modes/_shared.md`: add persona definitions section + global rule against mixing contact fields
- **Commit 2.2** — Update `modes/pdf.md`: add persona resolution; populate new contact placeholders; fallback to existing fields if no persona
- **Commit 2.3** — Update `modes/auto-pipeline.md`: accept `--persona` flag; resolve and pass to pdf mode
- **Commit 2.4** — Update `batch/batch-prompt.md` + `modes/batch.md`: accept `CAREER_OPS_PERSONA` env var
- **Test Milestone 2**: Run same JD with `--persona uk` and `--persona us`; verify PDFs have correct contact blocks

### Milestone 3 — Profile track support

- **Commit 3.1** — Update `modes/_shared.md`: add track definitions, inference rules, updated global rules; set `features.profile_tracks: true`
- **Commit 3.2** — Update `modes/pdf.md`: add track-aware project selection, bullet selection, summary variant logic
- **Commit 3.3** — Update `modes/oferta.md`: add track context to Block E personalization plan
- **Commit 3.4** — Update `modes/auto-pipeline.md`: accept `--track` flag; infer track from JD or prompt user
- **Commit 3.5** — Update `batch/batch-prompt.md` + `modes/batch.md`: accept `CAREER_OPS_TRACK` env var
- **Test Milestone 3**: Run same JD with `--track builder` and `--track leadership`; verify different project selection and summary framing; verify same underlying facts in both

### Milestone 4 — Polish and documentation

- **Commit 4.1** — Add optional bullet tagging convention to `docs/CUSTOMIZATION.md`
- **Commit 4.2** — Update `.claude/skills/career-ops/SKILL.md`: document `--track` and `--persona` flags
- **Commit 4.3** — Update `CLAUDE.md`: add routing table entries for new flags
- **Commit 4.4** — Add regression fixture to `tests/fixtures/cv-fixture.html`
- **Commit 4.5** — Final PR review + merge to `main`

---

## K. Persona / Identity Variants — Additional Notes

### How personas differ from tracks and archetypes

| Concept | What it changes | Examples |
|---|---|---|
| **Persona** | Contact/identity block only | Phone, location, auth wording, date format |
| **Profile Track** | Which experience gets foregrounded | Builder bullets vs. leadership bullets |
| **Archetype** | How to position for a specific role type | LLMOps framing vs. AI PM framing |

Personas do not affect CV content — only the contact header and region-specific metadata.

### Safeguards against mixing persona fields

- Global rule added to `modes/_shared.md`: "When a persona is selected, ALL contact fields (phone, location, authorization) must come from that persona's block. Never mix phone from one persona with location from another."
- Validation prompt added to `modes/pdf.md`: before filling template, confirm all three contact fields came from the same persona source.

### Auto-selection logic

- If JD company is UK/EU-registered → suggest `uk` persona (soft suggestion, not auto-applied)
- If JD mentions "right to work" or visa sponsorship for UK → suggest `uk` persona
- Persona is **never auto-applied without user knowledge** — always shown in report header
