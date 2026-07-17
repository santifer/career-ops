# Mode: cover-letter-tex — Tailor a user-owned LaTeX cover letter in place

Opt-in mode for candidates who maintain a hand-tuned LaTeX cover letter split into `main.tex` (layout, never touched), `info.tex` (per-application `\newcommand` fields), and `body.tex` (free-flowing prose, `\input` by `main.tex`). Invoke explicitly via `/career-ops cover-letter-tex`.

## When to use

- User has a `main.tex` that `\input{info}` and `\input{body}` from sibling `info.tex`/`body.tex` files
- User wants a JD-tailored letter while keeping their layout, header banner, and signature block exactly as designed

## Why this is a different mechanism from `latex-tex` (CV mode)

The CV mode (`modes/latex-tex.md`) protects a **fixed-width column layout** — the risk there is a bullet overflowing a box horizontally, so patches are gated on a ±5-character budget per slot. A cover letter has no such column, and the length target is the opposite of "stay the same": the letter should read as **roughly one and a half pages**, not one, and not a "full page plus a stray trailing line" on page 2 (user requirement — a one-page letter reads as thin, and an orphaned line on page 2 reads as sloppy pagination, not deliberate length). So:

- `info.tex` fields are patched **freely, no character budget** — a company name or recipient is a different length every time by design.
- `body.tex` is a **full rewrite** each application (normal for a cover letter), not a set of small preserved slots.
- The safety net is a **post-compile page-count + page-2-fullness check** (`check-letter-length.mjs`), not a per-patch length gate.

## Source file resolution

1. `config/profile.yml → coverLetter.source` if set (a directory containing `main.tex`, `info.tex`, `body.tex`)
2. Else a `cover-letter/` directory in the project root containing the same three files

If none exist, stop and ask the user for their cover letter directory or to set `coverLetter.source`.

```yaml
# config/profile.yml (optional, user layer)
coverLetter:
  source: cover-letter
```

## Pipeline

1. Resolve the source directory (see above)
2. Run: `node extract-letter-content.mjs <source-dir> --out /tmp/letter-slots-{company}.json`
3. Read the JD (from context, report, or ask user)
4. Tailor the patches (same ethics as `modes/latex.md` / `latex-tex` / `pdf`):
   - `info.tex` fields tagged `kind: "per-application"` (`recipient`, `company`, `city`, `state`, `zip`, `greeting`) — patch every one relevant to this application
   - `info.tex` fields tagged `kind: "candidate-constant"` (name, email, phone, LinkedIn, tagline, sign-off) — **do not patch unless the user explicitly asks**; these are the candidate's fixed identity, not per-application content. If the letter's language differs from the candidate's default (e.g. writing in English when `closer`/`main.tex`'s `babel` option are set up for Italian), ask the user before overriding `closer`, and swap the `babel` language option in the **copied** `main.tex` inside the output directory only — never in the source template.
   - `body`: rewrite fully with JD-relevant framing, extracting 15-20 JD keywords and weaving in genuine claims — **NEVER invent** achievements or skills not backed by `cv.md`/`article-digest.md`/the letter's own prior content
   - **Structure the body as several distinct paragraphs, each with one clear job** — don't write a single undifferentiated block. A strong reference shape (5-7 paragraphs):
     1. Opening hook — name the role and tie the candidate's academic + professional background to it in one or two sentences
     2. Deep dive on the most JD-relevant past role, with specific, verifiable detail (dates, employer, what was actually done)
     3. Deep dive on a second relevant role or project, same level of specificity
     4. Academic/proof-of-rigor paragraph (thesis, certification, or similar) if genuinely relevant — skip it rather than force a weak connection
     5. Motivation paragraph — why *this* company/role specifically, referencing something concrete from the JD, not generic enthusiasm
     6. Honest gap acknowledgment — if the JD lists a requirement the candidate doesn't have evidence for, say so plainly and pair it with a genuine adjacent strength, rather than silently omitting it or overselling. This is a legitimate, deliberate move (not a hedge) — it reads as candor, which is what "handwritten" tone is going for.
     7. Closing — availability and thanks, kept short
   - **Never use a dash as punctuation** (` - `, `--`, `–`, `—`) to set off a clause anywhere in the body. Restructure into separate sentences, or use a comma, instead — the letter should read like it was actually written by a person, not assembled from marketing-style dash fragments. (Word-internal hyphens in genuine compound words are fine; the rule is about the punctuation mark, not the character.)
   - Write `body` patch text as **ready LaTeX** (it's `\input` directly, not a macro argument) — escape `&`, `%`, `#`, `_` etc. yourself if you introduce any; `info.tex` field patches, by contrast, are plain text that the script LaTeX-escapes for you
5. Write patches file:

```json
{
  "slots": [ "... copy from extract manifest ..." ],
  "patches": [
    { "id": "recipient", "text": "Team HR Acme Inc." },
    { "id": "company", "text": "Acme Inc." },
    { "id": "greeting", "text": "Gent.mo" },
    { "id": "city", "text": "Milano" },
    { "id": "state", "text": "Italia" },
    { "id": "body", "text": "Full LaTeX prose for the tailored letter body..." }
  ]
}
```

6. Run: `node patch-letter-content.mjs <source-dir> /tmp/letter-patches-{company}.json output/cover-{candidate}-{company}-{YYYY-MM-DD}` — writes a standalone output directory (patched `info.tex`/`body.tex` plus `main.tex` and any other sibling asset like `sig.png`, copied unchanged)
7. Run: `node generate-latex.mjs output/cover-{candidate}-{company}-{YYYY-MM-DD}/main.tex output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf --compile-only`
8. **Length gate:** run `node check-letter-length.mjs output/cover-{candidate}-{company}-{YYYY-MM-DD}.pdf`. The rule (user requirement, replaces any "keep it to one page" instinct): the letter must land at roughly **one and a half pages**.
   - `pageCount` must be exactly `2` — if `1`, lengthen the body (expand or add a paragraph, see the structure above) and re-run steps 6-8; if `3+`, trim.
   - `page2ToPage1Ratio` must be at least `0.45` — a lower ratio means page 2 is just a stray trailing line/signature, not real content, and the fix is the same: lengthen the body, then re-run steps 6-8. Do not pad with filler; add genuine additional detail from the sources in scope (another achievement, more specificity on an existing one).
   - If `checked: false` (no `pdfinfo` on PATH — an optional dependency, not part of the standard `tectonic`/`pdflatex` requirement), the script exits 0 without blocking; visually inspect both rendered pages instead (convert with `pdftoppm` if available, or render via Playwright) and confirm page 2 looks like at least half a page of prose before the signature, not a near-empty page.
   - There is no override flag for this gate — a length issue always means the body needs rewriting, not a forced pass.
9. Report: fields patched, whether `body` was patched, `.pdf` path, page count, `page2ToPage1Ratio` (or compile/length-gate failure)

**Requires:** `tectonic` or `pdflatex` on PATH (same as `latex`/`latex-tex`). If the letter's `main.tex` declares `% !TeX program = pdflatex`, `generate-latex.mjs` honors it and prefers `pdflatex` over `tectonic` automatically.

## Ethical rules (mandatory)

Same as `modes/latex-tex.md` and `modes/pdf.md`:

- Claims in the tailored `body` get **reformulated, never fabricated** — cross-check against `cv.md`/`article-digest.md` when available
- Never add achievements, tools, or metrics the candidate does not already have evidence for
- Do **not** rewrite `main.tex` (layout, header banner, signature block) unless the user explicitly asks
- Do **not** patch `candidate-constant` fields unless the user explicitly asks

## What this mode does NOT do

- Does not replace `cv.md`/the `cover` mode's HTML/Markdown output as the system default
- Does not parse arbitrary cover-letter LaTeX layouts — only the `main.tex` + `info.tex` + `body.tex` split
- Does not auto-run during auto-pipeline or evaluation
- Does not submit applications
