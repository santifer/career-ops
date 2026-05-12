# How to Apply — Tonight's Workflow

The muscle-memory doc. When you sit down to build application materials, run through this top-to-bottom. Estimated time per application: 30-45 minutes once familiar.

---

## Step 0 — Pick the role (2 min)

1. Open [data/APPLY-NOW.md](APPLY-NOW.md)
2. Default to the highest-score row in Tier 1 (Anthropic) if you have an Anthropic slot open
3. If no Anthropic slot → highest-score row in Tier 2

**Hard stop questions before proceeding:**
- Per `modes/_profile.md` §0a — does this company have an active app already? If yes, defer.
- Is the score ≥ 4.0? If no, do not proceed (per ethical invariants).
- Is there a corpus rejection on this exact role? Check `corpus/rejections.md`.

---

## Step 1 — Read the report (5 min)

Open the report file linked from APPLY-NOW.md.

Skim Block A (TLDR / score) and Block E (CV match analysis). Note:
- The lead-with bullets ("group X + cross-archetype Y") — write these down
- Any flags fired (ANTHROPIC-POSTING / EQUITY-RISK / LATERAL-MOVE / INTERNATIONAL-TAX / REQUIRES-HUMAN-REWRITE)
- Any cultural-signal red flags from Block F (Grok intel)

---

## Step 2 — Open the apply-pack (5 min)

If APPLY-NOW.md shows ✅ next to the row:
- Open `apply-pack/{row-num}-{slug}/`
- Read the README.md inside
- Find the pre-built tailored CV (HTML + PDF)
- Find the cover letter draft (if present)
- Find the LinkedIn DM draft (if present)

If APPLY-NOW.md shows 🔧 NEEDS-BUILD:
```bash
node scripts/build-apply-pack.mjs --row=48   # replace 48 with your row number
```
This generates the apply-pack folder structure with stubs for tailored CV, cover letter, LinkedIn DM, and a README pointing back to the report.

---

## Step 3 — Build / refine the tailored CV (10-15 min)

1. Open [data/tailored-resume-bullets.md](tailored-resume-bullets.md)
2. Find the company name in the per-company guide table at the bottom
3. Use the recommended Group + cross-archetype mix-in
4. Strip the `[cv.md:L{line}]` citations from the final bullet text
5. Compose the CV in `apply-pack/{row-num}-{slug}/cv-mitchell-williams.html` using `templates/cv-template.html` as the base
6. Generate PDF: `node generate-pdf.mjs --in=apply-pack/{row-num}-{slug}/cv-mitchell-williams.html --out=apply-pack/{row-num}-{slug}/cv-mitchell-williams.pdf`
7. **Verify against `cv.md`** — every metric must be traceable. No invention.

**Voice check (mandatory):**
- Run draft through `corpus/voice-profile.md` six-signature filter
- 350-word cap on bullets that read as a paragraph
- Spelling: "yeah" not "yea"
- No banned phrases from voice-profile.md

---

## Step 4 — Cover letter (10-15 min)

1. Open [templates/cover-letter-template.md](../templates/cover-letter-template.md)
2. Fill in the four-block structure: HOOK / PROOF / DIFFERENTIATOR / CTA
3. Use 1-2 STAR+R proof points from `article-digest.md` (numbered #1-#18; the strongest hybrid is #17)
4. For Anthropic: lead with citation discipline / measurement language (Group 4 vocabulary)
5. For non-Anthropic: lead with the strongest archetype-matched proof point
6. Save as `apply-pack/{row-num}-{slug}/cover-letter.md`
7. Apply 40% cut test — if it survives the cut, the cut version is usually the right one

**Voice check (mandatory):**
- Same as CV check above
- Cover letter under 350 words for cold submissions; under 200 for warm intros

---

## Step 5 — LinkedIn DM / cold email (5 min)

1. Open [data/outreach-templates.md](outreach-templates.md)
2. Pick the variant matching the company tier:
   - Anthropic Comms / Editorial → Variant A
   - xAI / Sierra DevRel → Variant B
   - General pre-IPO (Groq / Sierra Comms / Perplexity) → Variant C
3. Replace `[HOOK]` / `[PROOF]` / `[DIFFERENTIATOR]` / `[CTA]` placeholders
4. Save as `apply-pack/{row-num}-{slug}/linkedin-dm.md`

**Hiring manager research (5 min if not already done):**
- Pull the hiring manager from the JD or LinkedIn Recruiter view
- Check `corpus/recruiter-threads.md` for prior contact
- Confirm the DM target's profile is current (live job title, company)

---

## Step 6 — Pre-flight checklist (5 min)

Open [data/pre-flight-checklist.md](pre-flight-checklist.md). Run through every item. Do not skip:

- [ ] Tailored CV PDF generated (no broken links / missing fonts)
- [ ] Every metric in CV traces to `cv.md` line
- [ ] Cover letter under 350 words / no banned phrases / passes 40% cut test
- [ ] LinkedIn DM passes voice-profile.md filter
- [ ] Application throttle clean per `modes/_profile.md` §0a (no concurrent app at same company unless waived)
- [ ] Score ≥ 4.0/5 confirmed in `data/applications.md`
- [ ] No corpus/rejections.md entry for this exact role
- [ ] If REQUIRES-HUMAN-REWRITE flag fires → essay fields hand-written, not AI-drafted
- [ ] Tracker pre-update queued (you'll mark Applied after submit)

---

## Step 7 — Submit (10 min)

1. **Read the JD on the company's site one more time.** Confirm the role is still open.
2. Open the `apply-pack/{row-num}-{slug}/` folder.
3. Submit the application via the company portal (Greenhouse / Ashby / Lever / company ATS).
4. **You click Submit. Never Claude. Per ethical invariants.**
5. If the application has essay fields:
   - Use the per-question prompts from `apply-pack/{row-num}-{slug}/essay-prompts.md` if present
   - If REQUIRES-HUMAN-REWRITE flag fired → write your own answer, no auto-draft
   - Voice-profile.md still applies

---

## Step 8 — Mark Applied (1 min)

After submission:

**Option A (from heartbeat email):** Click the ✅ Mark Applied button next to the row. Dashboard server flips status to Applied.

**Option B (from terminal):**
```bash
node scripts/mark-applied.mjs --row={N}
```

**Option C (manually):** Edit the row's Status column in `data/applications.md` from `Evaluated` to `Applied`. Do NOT add bold or dates to the status field — date column already exists.

---

## Step 9 — Post-submit (5 min)

1. Move the apply-pack folder for visibility — already done if status flipped to Applied
2. Add a follow-up reminder per `followup-cadence.mjs` recommendation (typically 7 days for a recruiter outreach, 14 days for an application)
3. **Do NOT submit a second application to the same company** until the first resolves (per `modes/_profile.md` §0a)
4. Update `interview-prep/{company}-{role}.md` with one or two notes you'd want to remember if this advances:
   - Which proof points you led with
   - Which JD requirements you don't fully cover and need to be ready to discuss
   - Hiring manager / recruiter name
5. Run `node verify-pipeline.mjs` to make sure the tracker stayed clean

---

## Time budget

| Step | Time |
|---|---|
| 0. Pick role | 2 min |
| 1. Read report | 5 min |
| 2. Open / build apply-pack | 5 min |
| 3. Tailored CV | 10-15 min |
| 4. Cover letter | 10-15 min |
| 5. LinkedIn DM | 5 min |
| 6. Pre-flight checklist | 5 min |
| 7. Submit | 10 min |
| 8. Mark Applied | 1 min |
| 9. Post-submit | 5 min |
| **Total** | **~60-70 min/app** |

**Quality target:** 1-2 well-targeted applications per evening session beats 5 rushed apps. The scoring rubric ≥ 4.0/5 floor exists for a reason — the quality wins on the recruiter side compound over the cycle.

---

## When something breaks

- **Apply-pack scaffold script fails** → check `scripts/build-apply-pack.mjs` arguments; fall back to copying an existing apply-pack as a template
- **PDF generation fails** → check `generate-pdf.mjs` Playwright dependency; fall back to LaTeX path via `generate-latex.mjs`
- **Tracker validation fails** → run `node verify-pipeline.mjs` to see why; common: bold in status field, dates in status field, non-canonical status string
- **Heartbeat email not arriving** → check `scripts/heartbeat.mjs` SMTP config; verify Gmail App Password is in env
- **Score is < 4.0 but the role feels right** → ethical invariants kick in. Override with explicit Mitchell acknowledgment in the tracker Notes column. Note WHY.

---

## Cross-references

- Master apply-now index: [data/APPLY-NOW.md](APPLY-NOW.md)
- Per-company bullet guide: [data/tailored-resume-bullets.md](tailored-resume-bullets.md)
- Outreach templates: [data/outreach-templates.md](outreach-templates.md)
- Cover letter template: [templates/cover-letter-template.md](../templates/cover-letter-template.md)
- Pre-flight checklist: [data/pre-flight-checklist.md](pre-flight-checklist.md)
- Voice profile: `corpus/voice-profile.md`
- Throttle rules: `modes/_profile.md` §0a
- Ethical invariants: `kb/ethical-invariants.md`
