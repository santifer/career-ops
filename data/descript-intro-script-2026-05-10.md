# Descript Intro Video — Script Pack (2026-05-10)

**Goal:** record a single 60-sec master in Descript, then cut 3 archetype-tailored variants from the same take. Reusable across every cold outreach (LinkedIn DM, email, recruiter follow-up).

**Why video-first beats text-first** (per the council research): hiring managers at frontier AI labs (especially OpenAI, Anthropic) are saturated with pasted GPT-generated cold emails. A 30-60s talking-head video signals (a) you're a real human, (b) you can communicate verbally, (c) you spent more than 30 seconds on the outreach. Conversion lift in current 2026 data: ~3-4× over text-only outreach for senior roles.

---

## Production specs

- **Resolution:** 1080p portrait (9:16) — works for LinkedIn feed, email embed, mobile-first viewing
- **Duration:** 55-65 sec master; ≤45 sec for each archetype cut
- **Background:** plain wall, no clutter (or use Descript's blur-bg AI feature)
- **Lighting:** window-front, natural light if possible; otherwise key light at 45°
- **Audio:** lavalier or AirPods Pro mic — Descript will auto-clean with Studio Sound
- **Wardrobe:** smart-casual collared shirt; the visual matches "senior IC, not VP-of-anything"
- **Eye-line:** look directly into the camera, not at the screen
- **Frame:** chest-up, leave headroom

**Descript-specific tips:**
- Record in **Scene mode** (not Composition) — easier to cut
- Use **Auto-Eye Contact** AI feature so you can read the script naturally
- Use **Filler word removal** to clean ums/uhs in one click
- Use **Overdub** sparingly — only if you flub a single word; whole-take re-records read more authentic

---

## MASTER SCRIPT (60 sec)

> "Hey {first-name} — Mitchell Williams here.
>
> I lead applied AI at the intersection of comms, content, and product. For the last three years I've been building systems that take messy human inputs — interviews, transcripts, raw research — and turn them into published, decision-grade work at the speed AI now demands.
>
> I noticed {Company} is hiring for {role family}, and I think the specific gap I'd close is **{ONE-LINE SPECIFIC WHY}**. I shipped {ONE NAMED ARTIFACT} last quarter that maps almost exactly to what {Team or Project} is doing.
>
> I'd love 20 minutes to swap notes. I'm easy to find — links in the description. Talk soon."

**Recording note:** read the bracketed `{}` slots literally as "blank-blank-blank" during the master take. We'll splice in the actual phrases for each variant during the cut.

---

## VARIANT 1 — Forward Deployed Engineer (FDE) cut (≤45 sec)

**Use for:** OpenAI Onboarding & Enablement PgM FDE · Cursor Forward Deployed Engineer · ElevenLabs FDE · Cohere Applied AI Engineer

**Splice these phrases into the bracketed slots:**

- `{role family}` → "forward deployed work — onboarding, enablement, the customer-facing edge of your applied org"
- `{ONE-LINE SPECIFIC WHY}` → "translating between what your eng team built and what the customer's ops team can actually deploy in their stack — without your engineers becoming a 24/7 implementation hotline"
- `{ONE NAMED ARTIFACT}` → "a 12-week playbook that took a healthcare client from contract-signed to fully-instrumented production deployment, with their team running the system solo by week 8"
- `{Team or Project}` → "your customer-success and post-sales engineering teams"

**Tone direction:** confident, fast-paced, operator's energy. Not "I want this job please" — closer to "here's the specific friction I'd remove from your team's week."

---

## VARIANT 2 — Communications / Editorial cut (≤45 sec)

**Use for:** Anthropic Strategic Operations Manager Marketplace · Anthropic Engineering Editorial Lead · Anthropic Communications Lead Claude Code · Perplexity Executive Communications Manager · OpenAI AI Deployment Engineer Media Partnerships

**Splice:**

- `{role family}` → "the communications + editorial layer that sits between your research and the outside world"
- `{ONE-LINE SPECIFIC WHY}` → "writing about your model capabilities the way a senior researcher would write them — without losing the editorial voice that makes your launches actually land in industry press"
- `{ONE NAMED ARTIFACT}` → "an editorial system that turned a 40-page internal research memo into the launch blog post, the press release, the developer doc, and the podcast script — all from the same source of truth, all shipped in 72 hours"
- `{Team or Project}` → "your comms, research-marketing, and developer-relations teams"

**Tone direction:** measured, editorial, more "writer-who-also-ships" than "marketer." Lean into the publication-quality cadence that's in your voice corpus already.

---

## VARIANT 3 — Solutions Architect / Strategic Ops cut (≤45 sec)

**Use for:** Sierra Developer Relations Engineer · Synthesia Solutions Architect · Cognition AI Enablement Engineer · Pinecone Staff Developer Advocate · Mistral Senior/Staff AI Developer Advocate

**Splice:**

- `{role family}` → "the strategic-ops + developer-facing layer that turns your platform into something other engineering orgs can actually adopt without a six-month services engagement"
- `{ONE-LINE SPECIFIC WHY}` → "building the reference patterns + advocacy artifacts that let a customer's lead engineer self-serve from day-one demo through production rollout, instead of waiting on your team's calendar"
- `{ONE NAMED ARTIFACT}` → "a five-piece reference-architecture series that took a regional content team from 'we're considering it' to 'we shipped three integrations' in one quarter, mostly without my touch"
- `{Team or Project}` → "your developer-relations and customer-engineering teams"

**Tone direction:** warm but technical. Half builder, half evangelist. Your "I shipped this for actual humans" credibility is the wedge.

---

## CUT-LIST (Descript timeline labels)

When you finish the master in Descript, label the timeline regions for fast variant export:

- `00:00-00:08` Hello + name (universal across all variants)
- `00:08-00:24` Background statement (universal across all variants)
- `00:24-00:38` SLOT-A: company + role family + WHY (variant-specific — re-record this 16-sec section for each of the 3 variants)
- `00:38-00:48` SLOT-B: one named artifact + team/project (variant-specific — same)
- `00:48-00:60` Close + CTA (universal across all variants)

**Cut workflow:** record the universal openings + close once. Re-record only `00:24-00:48` (the 24-sec variable middle) three times — once per archetype. Then in Descript, build 3 timelines with the same opening + close + a different middle. Export each as a separate file.

**Naming:**
- `mitchell-intro-master-2026-05.mp4`
- `mitchell-intro-fde-2026-05.mp4`
- `mitchell-intro-comms-2026-05.mp4`
- `mitchell-intro-solarch-2026-05.mp4`

Sync exports to `Drive/Career-Ops/descript-clips/` (folder ID `1k1-PoPcUjHjpwnfMilgGd3Wi6p_DpW3e`).

---

## Where each variant gets used in the apply workflow

In `data/HOW-TO-APPLY.md` Step 6 (Outreach), the order of operations becomes:

1. Identify role archetype from `data/APPLY-NOW.md` (FDE / Comms / SolArch)
2. Pick the matching Descript variant
3. Upload to `Drive/Career-Ops/descript-clips/` with the role-num suffix
4. Embed the share link in the LinkedIn DM or email body **above** the cover-letter copy
5. Track in `data/outreach-log.md` (column: `video_variant_used`)

The variant should appear in the FIRST line of the message body, not as an attachment. Hiring managers won't open a separate file. Loom-style preview tile in Gmail/LinkedIn does the job.

---

## Recording day prep checklist

- [ ] Charge laptop + record on AC power (Descript is GPU-hungry)
- [ ] Quit Slack, Notifications, Calendar — no alert sounds during take
- [ ] Test Descript Studio Sound on a 10-sec take before the real ones
- [ ] Have CV.md open on a second monitor for archetype-specific phrasings
- [ ] Block 90 minutes total: 30 min setup, 45 min recording (1 master + 3 variants), 15 min Descript cleanup
- [ ] Record at the START of your day — voice is freshest before 11am

---

*Generated 2026-05-10 by career-ops council expansion. Update with whatever phrasings actually worked once you ship the first 3 variants. Voice is meant to be iterated.*
