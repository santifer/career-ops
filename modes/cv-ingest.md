# Mode: cv-ingest — CV → clean cv.md (Proposer)

Converts a person's CV — pasted text, or a local PDF/DOCX file — into clean,
well-structured GitHub-flavored markdown for their `cv.md`. It is a **proposer,
never a writer**: it emits candidate markdown only; the human (or the web's review
step) confirms before anything is saved.

> **Why this is core (not web-only):** the web onboarding and the CLI onboarding
> must parse a CV into the SAME `cv.md` shape, or the downstream A–F evaluation
> reads two different CVs depending on how the user set up. This mode is the single
> source of truth for "CV → cv.md", exactly like `modes/oferta.md` is for scoring.
> The web orchestrates this mode headless; a CLI user gets it via the onboarding
> flow. (Drafted by career-ops-ui; owned by the maintainer.)

## The proposer-not-writer contract (READ THIS FIRST)

`cv-ingest` **NEVER writes `cv.md`** (or any file). It only proposes the parsed
markdown. The actual save is a separate, explicit step:

- **Web:** the agent emits the markdown wrapped in `<<cv:start>>`/`<<cv:end>>`
  markers; the web shows it in a review pane and writes it via the canonical CV
  write path only after the user clicks Save (propose-then-confirm).
- **CLI:** print the markdown, then ask "Save this to cv.md? (y/n)"; only on yes
  write it — and if `cv.md` already exists, **back it up first** (`cv.md.bak`) and
  ask before overwriting. NEVER blind-overwrite a hand-tuned CV (DATA_CONTRACT).

Headless callers enforce this structurally by running the agent with
Write/Edit/Bash disabled, so it *cannot* persist even by mistake.

## INPUT

One of:
- **Pasted text** — the CV as plain text, or a LinkedIn "About"/experience paste.
  Embed it directly; no file needed.
- **A local file path** — a `.pdf` / `.docx` / `.md` / `.txt`. READ it with your
  file/Read tool. (A `.md`/`.txt` is already markdown-ish — clean it lightly; a
  PDF/DOCX needs full extraction + structuring.)

Never fetch a remote URL or send the CV anywhere — the CV is the user's most
private data and MUST stay local (PII / firewall).

## OUTPUT — the cv.md markdown

**The format SSOT is `examples/cv-example.md`** (the reference CV the project ships).
Produce markdown that **mirrors `examples/cv-example.md` EXACTLY** — same structure,
same heading style, same section names — so a CV parsed here is byte-for-byte the
same shape as one a user wrote by hand from the example. Read that file if unsure;
if it changes, follow it (zero drift). The exact shape, in this order (omit a
section if the source lacks it — invent nothing):

```markdown
# CV -- {Full Name}

**Location:** {…}
**Email:** {…}
**LinkedIn:** {…}
**Portfolio:** {… if any}
**GitHub:** {… if any}

## Professional Summary

{2-4 line summary in their voice, ONLY from facts present — never embellish.}

## Work Experience

### {Company} -- {Location}

**{Job Title}**
{Start}-{End or Present}

- {Bullet — preserve quantified achievements verbatim: numbers, %, scale, impact}
- {…}

### {next company…}

## Projects

- **{Project}** ({type, e.g. Open Source}) -- {one-line what + the hero metric/outcome}

## Education

- {Degree}, {Institution} ({year if given})

## Skills

- **{Category}:** {comma-separated list — keep the user's own terms}
```

**Format rules (match the example, non-negotiable):**
- Title is `# CV -- {Name}`. Contact is BOLD LINES directly under the title (no
  "Contact" section). Headings: `## Professional Summary`, `## Work Experience`,
  `## Projects`, `## Education`, `## Skills`.
- Experience heading is **company-first**: `### {Company} -- {Location}`, then the
  job title on its OWN bold line, then the dates on their OWN line, then bullets.
- Use `--` (double hyphen), **NEVER an em dash** — `modes/_shared.md` forbids em
  dashes (an ATS-compatibility rule) and the example uses `--` throughout.

**Fidelity rules (non-negotiable):**
- **Preserve every** company, job title, date range, and **quantified achievement**
  (latency cut 40%, $2M saved, 2K stars, team of 5). These are the proof points the
  A–F evaluation scores against — losing them weakens every future match.
- **Invent nothing.** If a fact (a date, a metric, an email) isn't in the source,
  omit it. A faithful gap beats a fabricated detail.
- **Clean, don't rewrite.** Fix formatting, normalize headings, de-duplicate — but
  keep the candidate's wording and emphasis. This is THEIR CV.
- Keep it reasonable in size; a CV that parses to an enormous file usually means the
  whole PDF (page furniture, repeated headers) leaked in — extract just the CV.

## MACHINE CHANNEL (for the web)

When run headless for the web, emit ONLY the markdown wrapped exactly between two
marker lines on their own lines (never inside a code fence):

```
<<cv:start>>
# {Full Name}
…the full cv.md markdown…
<<cv:end>>
```

Then emit ONE more line — a JSON seed the web uses to kick off a free job search
derived from the CV (so the user sees matches immediately, before any other setup):

```
<<cv:seed>>{"title":"<their current or target role>","roles":["<3–5 role keywords they'd search>"],"location":"<their location, or 'Remote'>"}
```

If the source is unreadable or empty (a scanned-image PDF with no text layer, an
empty paste), emit ONLY this and stop:

```
<<cv:error>>{"reason":"unreadable"}
```

Narrate ONE short line BEFORE `<<cv:start>>` (e.g. "Reading your CV…") so the web
can show progress. Everything outside the markers is treated as that narration.

## HUMAN CHANNEL (direct CLI use)

For onboarding from the terminal: after extracting, print the markdown plainly,
then:

```
Here's your CV as markdown. Save it to cv.md? (y / edit / n)
```

- **y** → if `cv.md` exists, copy it to `cv.md.bak` first, then write. If it's
  absent, just write.
- **edit** → let them tweak before saving.
- **n** → don't save; offer to adjust and re-show.

Then point them at the next step: "Saved. Run `/career-ops scan` to find roles, or
paste a job URL and I'll score it against your CV."

## DEGRADE

- **Scanned-image PDF (no text layer):** you can't extract text → `<<cv:error>>`
  (web) or "I couldn't read text from that PDF — paste your CV text instead" (CLI).
- **A CLI without file-read:** if you can't open the given path, say so and ask for
  a paste instead — never guess the contents.
- **Thin source:** parse what's there and flag it ("this looks brief — add your
  experience for better matches"); a minimal CV is enough for a first useful score.

## Summary contract

- **Proposer, never writer.** Emit candidate markdown; the human/web saves it.
- **Local + private.** The CV never leaves the machine; no remote fetch.
- **Faithful.** Preserve every company/title/date/metric; invent nothing; clean, don't rewrite.
- **Two channels:** `<<cv:start/end/seed/error>>` markers for the web; a y/edit/n save prompt for the CLI (back up an existing cv.md before overwriting).
