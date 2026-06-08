# Job Pulse Refresh — 2026-05-22 (v36)

## TL;DR

The refresh ran end-to-end, but it walked into a mess on arrival. A **P1 data-corruption incident** had already broken AutoSubmit's entire database layer before I started — `auto-submit.mjs` couldn't even load its files. I found it, traced it, repaired all five affected files, and verified the fix. AutoSubmit is functional again.

Discovery itself was clean. `scan.mjs` surfaced 29 fresh roles. After honest filtering — no-relocation, real domain fit, live-URL verification — **exactly one is a genuine fit**: a Motorola Solutions Technical Program Manager in Richardson, TX. That's not a thin day; that's the filter doing its job. A broad Fortune 500 Workday sweep is mostly international postings, onsite-elsewhere roles, and domain mismatches dressed up with the right title.

A few things need your eyes — they're in the Risks and Kaizen sections.

---

## 🔴 P1 Incident — corrupted databases (found, fixed, verified)

**What broke.** Five data files were corrupt when this run began:

| File | Corruption | Effect |
|------|-----------|--------|
| `data/sus-db.json` | Truncated mid-string at a half-written `capitalrx` entry | `auto-submit.mjs` exits 1 — "ERROR loading databases" |
| `data/blocked-jobs.json` | Truncated — array never closed | Same |
| `data/bat-run-log.json` | Valid JSON + trailing NUL bytes | Same |
| `data/last-refresh.json` | Valid JSON + ~85 trailing NUL bytes | Same |
| `data/applications.md` | Truncated mid-row at a fragment `\| 081` | Lost rows 077, 079, 081–083; verify-pipeline failed |

The headline: **AutoSubmit was completely dead.** Any card the 6:10 bat or the VM tried would fail at database load. This is the single most important finding of the run.

**How I fixed it.** Every corrupt file was backed up first (`*.corrupt-2026-05-22T11-26.bak` / `...T11-28.bak`) so nothing is lost for forensics. Then:

- `bat-run-log.json`, `last-refresh.json` — stripped trailing NUL bytes, re-validated.
- `blocked-jobs.json` — closed the truncated array; **43 entries preserved**, re-validated.
- `sus-db.json` — reconstructed from the intact prefix (all 36 original companies) + the half-written `capitalrx` entry completed; **37 companies, 9 confirmed**, re-validated.
- `applications.md` — restored from the clean `applications.md.bak` (recovered the 5 lost rows).

All six JSON databases now pass `JSON.parse`. `verify-pipeline.mjs` went from **1 error → 0 errors**. I re-ran `auto-submit.mjs` against a live card afterward and it loaded cleanly, passed the F500 gate, and deferred correctly (no Chromium in the VM — expected, TD-03).

**Root cause (best read).** The corruption signature — truncated writes plus trailing NUL-byte padding across multiple files — points to **non-atomic file writes on the mounted folder, almost certainly aggravated by a concurrency collision.** Today's 6:10 AM Windows AutoSubmit bat (`ran_at 2026-05-22T11:12:48Z`) and this refresh were both touching the same files inside the same ~3-minute window. Two writers, no file locking, no write-temp-then-rename — that is exactly how you get half-written JSON. See Kaizen #2 and #3.

---

## Discovery — `scan.mjs` (primary)

Clean run, 11 seconds, zero dead URLs (direct ATS APIs are self-verifying).

- Companies scanned: **60**
- Jobs seen: **6,233** → 5,782 filtered by title → 422 duplicates → **29 new offers**
- 1 minor error: Salesforce Workday returned nothing (likely a soft block — non-blocking)

**The one real fit — and why the other 28 didn't make it:**

After applying your no-relocation policy, domain-fit judgment, and live-URL verification against the Workday CXS API, the 29 collapsed to one genuine card. The rest broke down as:

- **International** (~12): Dublin, Brazil, Switzerland, Malaysia, Poland, India, Canada, Hong Kong, UK, Italy.
- **Onsite, not Dallas** (~10): El Segundo, Annapolis, Scottsdale, Dulles, Brooklyn Park MN, Charlotte, Saint George UT, Minneapolis, Chicago, Atlanta.
- **Domain mismatch, title looked right** (~5): GE Vernova "Project Manager – Solar & Storage" is utility-scale solar/battery **EPC construction** (engineering degree, BESS plant experience); Stripe "Program Manager, Solutions Architecture" is a **GTM / pre-sales sales-ops** role (your title filter flags "Sales"); GE Vernova environmental/chemistry PM roles; Target "Safety Manager." Real titles, wrong job for an Agile delivery leader.

This is the system being honest rather than padding the board. Quality over quantity, exactly as `CLAUDE.md` asks.

---

## Card injected — `live-64`

**Motorola Solutions — Technical Program Manager — Richardson, TX** · Grade **B**

- Workday CXS-verified **live** today (`canApply: true`).
- **Base salary $130,000–$150,000** — confirmed in the posting, meets your floor.
- **Richardson is DFW metro** — onsite, no relocation. Relocation: "None."
- The JD is a real platform-TPM role: end-to-end delivery across app services and infrastructure, Jira/Confluence, dependency and risk management, executive alignment. It maps cleanly onto your Toyota $125MM portfolio and Snowflake ETL work.

**Routing:** I placed it in the **SuS / Blocked** column. Motorola Solutions is a genuine Fortune 500 company, but it is **not in the Kanban `FORTUNE_500` set** and not whitelisted — so the gate correctly holds it for you. Move the card to **AutoSubmit Ready** to release it, or see Kaizen #1.

A tailored cover letter is ready: `output/cl_motorola-solutions_technical-program-manager_2026-05-22.txt` (249-word cap, every metric checked against `cv.md` — I used only CV-verifiable numbers).

`SEED_VERSION` bumped `v35 → v36`.

---

## AutoSubmit status

- **This refresh:** the VM has no Chromium, so `auto-submit.mjs` defers (exit 4) by design — 0 real submissions from the cloud side. Correct behavior.
- **Today's 6:10 AM Windows bat** had already run (`11:12:48Z`) on the v35 board: **4 applied · 15 blocked · 27 → SuS**. The 4 applied were the Ashby cards (Datatonic, Acorns, Deepgram, SpruceID). The GE Aerospace ×3, Humana, Medtronic, and Philips carryover cards all **blocked** on form-fill — so despite being F500-confirmed, none of them actually went out today.

---

## Risks & escalations

1. **Concurrency hazard (the real root cause).** The daily refresh and the 6:10 AM bat ran in the same 3-minute window and corrupted shared files between them. This task is named "1am refresh" but executed at ~6:10 AM Central — colliding head-on with the bat. **The refresh must finish well before 6:10.** Until that's fixed, this corruption will keep recurring.

2. **Mount writes are not atomic.** Every JSON writer in the stack (`auto-submit.mjs`, `write-refresh-status.mjs`, the bat) writes in place. One interrupted write = a corrupt database and a dead pipeline. This is a structural fragility, not a one-off.

3. **Fabricated URLs in `sus-db.json` — corrected.** Six entries (Humana, Medtronic, Philips, GE Aerospace ×3) held placeholder URLs with obviously synthetic IDs (`R-000123456`, `R00123456`, `R000012345`, `R3790677/8/9`). I confirmed the Humana one dead via the Workday CXS API and replaced all six with the real, CXS-verified URLs during the repair. The Kanban cards themselves already had correct URLs, so no wrong submissions resulted — but fabricated data in an autosubmit system is not something to leave sitting.

4. **Plaintext credentials in `config/profile.yml`.** Your LinkedIn login (and Workday email) sit in clear text in that file. It's gitignored, which limits the blast radius, but a plaintext password on disk is still a real exposure. See Kaizen #4.

5. **`career-ops` update available: v1.3.0 → v1.8.0.** Five minor versions behind. I did **not** apply it — an unattended five-version jump mid-incident is not a safe call. Your data is never touched by updates; run `node update-system.mjs apply` when you can sit with it.

6. **GE Aerospace carryover cards (live-54/55/56) are a weak fit.** I read the JD — these "Sr Staff Technical Product Manager – Logistics" roles are really **Oracle EBS WMS Application Architect** positions ("8+ years implementing Oracle WMS functionalities"). That's a specialist stack you don't have. They're graded B and sat in the AutoSubmit lane; they blocked today, but they'll keep retrying. See Kaizen #5.

7. **Humana carryover (live-57)** — verified live, but comp is **$104K–$143K**: most of that band is under your $130K floor.

8. **AutoSubmit block rate is high** — 15 of 19 attempts blocked today. Workday form-fill and the Stripe URL bug (TD-19) are the usual suspects. Known territory, but the success rate is low enough to be worth a focused look.

9. **4 duplicate tracker rows** — Datatonic, Databricks, Acorns, Deepgram each appear twice in `applications.md` (the bat re-added rows). Non-blocking warnings. A quick `node dedup-tracker.mjs` clears them.

---

## Kaizen proposals — need your OK before I make these changes

1. **Add `motorola solutions` to the `FORTUNE_500` set** (in `dashboard/job-pulse-kanban.html` and `auto-submit.mjs`). Motorola Solutions is a real Fortune 500 company — same gap that KAIZEN-GE fixed for GE Aerospace/Vernova. While there, I'd also verify `medtronic` and `philips` are present in the Kanban set (they're in `sus-db` confirmed but I didn't see them in the set). **Approve?**

2. **Atomic writes for every JSON database writer.** Switch `auto-submit.mjs`, `write-refresh-status.mjs`, and the bat to write-to-temp-then-rename. This kills the entire truncation/NUL-byte corruption class permanently. **Approve?** (I'd treat this as the top remediation.)

3. **Move the refresh schedule earlier** so it fully completes before the 6:10 AM bat — e.g., a true 1:00 AM start, or a lock file the bat checks. No more collisions. **Approve?**

4. **Move credentials out of `config/profile.yml`** into OS keychain / environment variables, with the YAML reading from there at runtime. **Approve?**

5. **Re-grade the GE Aerospace logistics cards (live-54/55/56) from B to C**, which drops them out of the AutoSubmit lane. They're Oracle-WMS-specialist roles that don't match your background. **Approve?**

---

## Loose end

I created a one-off repair script, `_repair-json-tmp.mjs`, to fix the corrupt files. The VM mount blocked me from deleting it (unlink is not permitted from the VM side), so I emptied it to a harmless comment instead. **Please delete `_repair-json-tmp.mjs` from the `career-ops` root manually** — it's inert, just untidy.

---

## Run Summary

```
=== JOB PULSE REFRESH — 2026-05-22 (v36) ===

P1 INCIDENT:      5 files corrupt (sus-db, blocked-jobs, bat-run-log,
                  last-refresh, applications.md) — ALL REPAIRED & VERIFIED

SuS resolved:     0 auto-confirmed (no unconfirmed F500 pending)

PRIMARY SCAN (scan.mjs — direct ATS API)
  Companies:      60
  Jobs seen:      6,233  → 29 new offers
  Genuine fits:   1  (A:0  B:1  C:0)  · 28 filtered (intl / onsite / domain)
  Dead URLs:      0

WORKDAY SCRAPER:  deferred (no Chromium in VM — TD-03)
SECONDARY SCAN:   skipped (WebSearch suspended — KAIZEN-01)

Cards injected:   1  →  live-64 Motorola Solutions TPM (B) → SuS/Blocked
Cover letters:    1 generated  ·  6 reused

AutoSubmit (refresh):  VM defers (exit 4) — 0 real submissions
Today's 6:10 bat:      4 applied · 15 blocked · 27 → SuS  (ran separately)

Data hygiene:     6 fabricated sus-db URLs corrected
                  verify-pipeline: 0 errors, 4 dup warnings

SEED_VERSION:     v36-live-jobs
================================
```

*Five Kaizen items above are waiting on your approval. Defects (the corruption, the fabricated URLs) were fixed without waiting, per your standing instruction.*
