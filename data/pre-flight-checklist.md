# Pre-Flight Checklist — Before Submitting Any Application

Run this before you click Submit / Send / Apply. Five minutes max. Catches the mistakes that cost recruiter goodwill.

---

## 1. Score & throttle

- [ ] **Score is ≥ 4.0/5** in `data/applications.md`. If not, override only with documented reason in Notes column.
- [ ] **Application throttle clean** per `modes/_profile.md` §0a:
  - [ ] No active app at this company already (check tracker for `Applied` / `Responded` / `Interview` status at this company)
  - [ ] If Anthropic: zero active Anthropic apps anywhere (1 active company-wide)
  - [ ] If Sierra DRE family: London is Applied; SF + NYC are DEFER until London resolves
  - [ ] If ElevenLabs: Comms Manager FIRST, then ONE FDE variant
- [ ] **No `corpus/rejections.md` entry** for this exact role. Re-application timing applies if rejected before.
- [ ] **No documented sibling priority blocker** in the corpus or report (e.g. "Apply [#063] before this one")

## 2. CV (tailored)

- [ ] **Every metric in CV traces to `cv.md` line.** No invention. No rounding up. Every number has a source.
- [ ] **Source citations stripped** from final CV text — `[cv.md:L33]` tags are for verification, not the recruiter's read
- [ ] **PDF generated** at the correct version of the tailored CV — not the canonical cv.md, the per-company variant
- [ ] **Filename pattern:** `cv-mitchell-williams-{company}-{date}.pdf` saved in `apply-pack/{N}-{slug}/`
- [ ] **No broken links / missing fonts** in the rendered PDF (open it before submitting)
- [ ] **Group selection per `data/tailored-resume-bullets.md`** — used the right group for this archetype + the recommended cross-archetype mix-in

## 3. Cover letter

- [ ] **Under 350 words** for cold submissions / under 200 for warm
- [ ] **Four-block structure** present: HOOK / PROOF / DIFFERENTIATOR / CTA
- [ ] **40% cut test passes** — the cut version reads OK without losing what makes it Mitchell's
- [ ] **No banned phrases** per `corpus/voice-profile.md` ("excited to," "passionate about," "honor to," "looking forward to hearing from you," etc.)
- [ ] **Lead-with proof point** is the right one for the role's archetype
- [ ] **Specific CTA** — not "I'd love the opportunity to chat"; instead something that makes saying yes feel obvious
- [ ] **Spell-check passed** — Mitchell's name spelled right, company name spelled right, role title spelled right

## 4. LinkedIn DM / cold email

- [ ] **Variant matched to company tier** per `data/outreach-templates.md`
- [ ] **Specific HOOK** — not generic; something only Mitchell can say given his proof points
- [ ] **One metric from cv.md** — citation-tag stripped
- [ ] **Differentiator in one sentence** — broadcast + AI angle
- [ ] **Low-friction CTA** — "open to a 15-min call this week?" beats "I'd love to discuss this further"
- [ ] **Under 250 words**
- [ ] **Voice profile filter** passed

## 5. Application form (free-text fields)

- [ ] **REQUIRES-HUMAN-REWRITE flag** — if it fired in the report (Block E), Mitchell hand-writes the answer; no auto-draft
- [ ] **Each free-text answer** uses 1-2 STAR+R stories from `interview-prep/story-bank.md`
- [ ] **Word limits** observed for each field (the form usually states this; if not, default to 200 words)
- [ ] **Voice profile filter** passed on every free-text answer
- [ ] **No banned phrases** — same list as cover letter

## 6. PII / privacy

- [ ] **Phone number not in any auto-generated message** — it's in `cv.md:L5` for the CV, but never in cover letter, DM, or essay text
- [ ] **No SSN / passport / bank data** anywhere
- [ ] **Email is mitwilli@gmail.com** — not any older address
- [ ] **LinkedIn URL is linkedin.com/in/mitwilli** — not any older URL
- [ ] **GitHub URL is github.com/mitwilli-create** — current
- [ ] **storytellermitch.com** — note that the site is currently 401-walled. If linked from any application material, either fix the site first (60-min placeholder) or remove the link.

## 7. Tracker / system hygiene

- [ ] **Pipeline clean** — `node verify-pipeline.mjs` returns 0 errors, 0 warnings
- [ ] **Tracker pre-update queued** — you'll mark Applied after submit (not before)
- [ ] **Apply-pack folder exists** at `apply-pack/{N}-{slug}/` with all four stub files filled in
- [ ] **Report file referenced** in apply-pack/README.md still resolves

## 8. Final sanity check (the "would I send this myself?" test)

- [ ] **Read the cover letter out loud.** Does it sound like Mitchell? Does it land?
- [ ] **Read the DM out loud.** Would you reply if a stranger sent you this?
- [ ] **Re-read the JD one more time.** Did you address the load-bearing requirements? Are you over-indexing on a soft requirement and under-indexing on a hard one?
- [ ] **Check the date on the JD.** If posted > 30 days ago, the role may already have a candidate in final round — the application still goes in, but expectations adjusted.
- [ ] **You click Submit. Never Claude. Per ethical invariants.**

## 9. Post-submit (do this within 5 minutes)

- [ ] **Mark Applied in tracker** via heartbeat email button OR `node scripts/mark-applied.mjs --row={N}` OR manual edit (status column to `Applied`, no bold, no date)
- [ ] **Add follow-up reminder** per `followup-cadence.mjs` recommendation (typically 7-14 days)
- [ ] **Update `interview-prep/{company}-{role}.md`** with one or two notes you'd want to remember if this advances
- [ ] **Don't queue another app at the same company** until this one resolves (per `modes/_profile.md` §0a)

---

## Quick reference — common mistakes to avoid

| Mistake | Why it hurts | Catch it at |
|---|---|---|
| Two simultaneous Anthropic apps | ATS auto-flags; permanent low-priority | Step 1 throttle check |
| Generic "I'm excited" hook | Looks like every other applicant | Step 4 cover letter |
| Phone number in cover letter | Privacy invariant + reads desperate | Step 6 PII |
| Score < 4.0, no override doc | Ethical invariant | Step 1 score |
| Banned phrases ("passionate about") | Voice profile violation | Steps 3 + 4 |
| 401-walled portfolio link | Broken promise to recruiter | Step 6 PII |
| Sibling-priority skip ([#063] before this) | Recruiter goodwill loss | Step 1 throttle |
| Fabricated metric in CV | Hallucination guard / ethical invariant | Step 2 CV |

---

## CV freshness (audit Item V, added 2026-05-18)

Before submission, run these four checks against `apply-pack/<slug>/tailored-cv.pdf` (or the master `output/cv-mitchell-williams-master-<today>.pdf` if no tailored variant exists):

- [ ] `output/cv-mitchell-williams-master-$(date +%Y-%m-%d).pdf` exists for today's date — re-render with `node scripts/render-cv-typst.mjs --input cv.md --output output/cv-mitchell-williams-master-$(date +%Y-%m-%d).pdf` if it doesn't.
- [ ] `tailored-cv.pdf` mtime is **later than** the most recent commit to `templates/cv-template.typ` or `scripts/render-cv-typst.mjs` — otherwise the PDF reflects a stale template. Check with `git log -1 --format=%cI -- templates/cv-template.typ scripts/render-cv-typst.mjs`.
- [ ] `pdftotext -layout tailored-cv.pdf - | grep -ciE "FDE|Forward Deployed|Applied AI|Solutions Architect|AI Program Manager|MCP|RAG"` returns **≥ 3** keyword matches. Below 3 means ATS may filter the role out.
- [ ] `pdftotext -layout tailored-cv.pdf - | grep -E '\\@|\\#|\(see cv\.md\)'` returns **no output** (no Typst escape leaks or placeholder strings).

If any check fails, fix it before submitting — these are 30-second checks that catch artifacts trained against the wrong template / corrupted by escape leaks / missing the role's target keywords.

---

**Last refresh:** 2026-05-18 (added CV freshness section per audit Item V)
**This file is operational, not a manifesto.** If a step starts feeling redundant after 10+ submissions, mark it as muscle-memory and skip the box-tick. Keep the steps that catch real mistakes.
