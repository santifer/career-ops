# Example -- Dual-Track Engineer + Instructor

This example demonstrates the **dual-track career pattern**: a candidate whose track record is strong on **two distinct archetypes** at the same time -- in this case, a Senior AI Engineer who is also a Senior Technical Instructor.

The default career-ops examples (`cv-example.md`, `article-digest-example.md`) assume a candidate optimizing for a **single** archetype. Real-world hybrid careers (technical instructors at bootcamps, university lecturers, AI/ML educators, DevRel engineers, training architects, internal-enablement leads) need a different setup.

This folder shows how to:

1. Configure `archetypes:` in `profile.yml` with **two `fit: primary` entries** instead of one.
2. Write a `cv.md` that surfaces measurable wins on **both tracks** without diluting either.
3. Set **two compensation ranges** -- engineering and teaching pay differently, and the system needs to know which range to apply per offer.
4. Decide at evaluation time which track to lead with for a given JD.

---

## Files

| File | Purpose |
|------|---------|
| `cv.md` | Fictional dual-track CV (Sam Rivera). Use as structural reference for your own. |
| `profile.yml` | Profile config with two primary archetypes and two comp ranges. |
| `README.md` | This file. |

The persona is fictional (`Sam Rivera <sam@example.com>`). Do not copy values directly -- adapt them.

---

## When to use the dual-track pattern

Use it if **all three** of the following are true:

1. You have measurable, recent (< 3 years) wins on two distinct archetypes -- not "I taught a workshop once", but real proof points (hours taught, careers launched, retention, OR LOC shipped, systems owned, impact metrics).
2. You are willing to accept offers from **either** track. If you would only take one and tolerate the other, do single-track and treat the other side as a "superpower bullet".
3. Your two tracks are at a **similar seniority level**. A junior teacher + staff engineer is single-track engineer with teaching as a flavor.

Use **single-track** instead if:

- One side is clearly hobby-grade ("I mentor on weekends").
- The two tracks are at very different seniorities.
- You are early in your career and still figuring out which side dominates.
- Your salary expectations on one track are non-negotiable -- pick that track and frame the other as a differentiator.

---

## How dual-track changes the rest of career-ops

### `modes/_shared.md`
You will want **both** archetypes listed in the "North Star -- Target Roles" table with `fit: primary`. The skill applies equal rigor to all primary archetypes -- which is exactly what dual-track candidates need.

### `cv.md`
Two viable structures:

- **Layered** (recommended): one Professional Summary that names both tracks in the first sentence, then experience entries that include both engineering AND teaching bullets per role. Use this when your roles literally combined both. See `cv.md` in this folder.
- **Sectioned**: separate "Engineering Experience" and "Teaching Experience" headings. Use this when the two tracks happened at different employers.

Always lead the Professional Summary with the **rare combination** framing ("Senior AI engineer who also runs the curriculum"). This is the differentiator -- it is harder to hire than either side alone.

### `profile.yml` -- compensation
Set `compensation.target_range` to your engineering range (typically higher), and use the optional `compensation.alternate_ranges` block to register the teaching range. The evaluator will pick the right one based on the JD.

### Evaluation reports
When career-ops evaluates an offer, it should detect which archetype the JD targets and pick the matching salary range, the matching CV emphasis, and the matching STAR stories. With two `fit: primary` entries this should "just work" -- but always verify the `Archetype` line in the report header matches the JD.

---

## Interview objection handling

The dual-track CV will trigger objections in interviews. The two most common:

### "Why are you applying for an engineering role if you also teach?"
Answer template:
> "Teaching is how I keep my engineering sharp -- I have to ship code that students can actually run, debug, and extend. The reason I am applying for [role] is [specific reason about the team / product / scope]. The teaching side stays as a side activity, not a competing job."

Lead with the engineering wins. Mention teaching only as a credibility signal ("I have explained transformers 200 times -- I know what the hard parts are"), never as a co-equal commitment.

### "Are you sure you want a teaching role? Your engineering background is intense -- you will be bored."
Answer template:
> "The students I want to teach are the ones who are going to ship production systems, not pass a quiz. My engineering background is exactly why I can take them there. I have done both for [N] years -- this is not a step down, it is the same work in a different format."

Lead with the teaching wins (hours, careers launched, retention, NPS). Use the engineering background as proof of credibility, not as a backup plan.

### "Why not just pick one?"
> "Because the rare combination is the value. Engineers who can teach get hired to lead onboarding, write internal docs that people actually read, and run technical interviews. Teachers who can ship get hired to design curriculum that survives contact with production. I am optimizing for roles where both matter."

---

## Over/underqualified failure modes

Dual-track candidates risk being read as **overqualified** for pure teaching roles ("you will leave in 6 months for an eng job") and **underqualified** for pure engineering roles ("you have not been a full-time IC in 2 years"). Mitigations:

| Risk | Mitigation in CV | Mitigation in interview |
|------|------------------|-------------------------|
| Overqualified for teaching | Lead the Summary with curriculum + outcomes, not LOC | Tell a story about a course you redesigned that improved student outcomes -- show you care about pedagogy, not just code |
| Underqualified for engineering | Surface recent shipping work (last 12 months) as a separate "Recent Engineering" section | Bring code. Pull up a PR you wrote in the last month. Walk through the architecture decisions out loud |

---

## Related files

- `../cv-example.md` -- single-track CV example for comparison.
- `../../config/profile.example.yml` -- the canonical profile schema this example extends.
- `../../modes/_shared.md` -- where archetypes feed into framing logic.
- `../../CONTRIBUTING.md` -- this example was contributed under "Add example CVs for different roles".
