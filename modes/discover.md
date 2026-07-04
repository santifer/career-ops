# Mode: discover — Natural-Language Job Discovery (Proposer)

Takes a free natural-language **intent** ("AI infra roles at climate startups, remote EU; not staff-level") and searches the **public** web for matching fresh job postings. Emits the matches as **candidates** for the user to review — it is a **proposer, never a writer**.

> **What this is NOT:** This is not `scan` (`modes/scan.md`). `scan` is deterministic and config-driven: it walks `portals.yml` (`tracked_companies` + `search_queries`) and hits real ATS APIs, so its results are live by construction and zero-token. `discover` is the opposite end: there is no config, no fixed company list — the user types intent in plain language and an AI agent figures out where to look. Use `scan` for "check my watched companies/portals again" (cheap, deterministic, default). Use `discover` for free intent the scan can't express ("seed-stage robotics companies hiring forward-deployed engineers in Berlin"), at the cost of the user's own tokens. The two converge into the **same** review → add → evaluate funnel.

## The proposer-not-writer contract (READ THIS FIRST)

`discover` **NEVER persists anything.** It does not touch `data/pipeline.md`, `data/applications.md`, `data/scan-history.tsv`, `reports/`, `output/`, or `portals.yml`. It only **proposes**.

- The agent emits candidates (machine envelopes for the web, a numbered list for the CLI).
- The **human decides** what to add. Persistence happens **only** when the user adds a candidate — at which point the **canonical** `scan.mjs` writers run (`appendToPipeline` + `appendToScanHistory` with status `added`, source `ai-search`). The web calls these on add; the CLI offers to add the chosen ones (human-in-the-loop, see [CLI flow](#human-channel--cli-flow)).
- This keeps a single source of truth: every offer that enters the pipeline — whether from the deterministic scan or from AI discovery — goes through the **same** writers and lands in the **same** files. `discover` never forks a parallel store.

If you find yourself about to write to a data file, **stop** — that is the user's call, not yours.

## Why this mode exists

The free scanner answers "what's new at the companies/portals I already track?" It cannot answer free intent: a role family it doesn't filter for, a company it never heard of, a constraint ("Series A, climate, remote-EU, hands-on") that no `title_filter` encodes. `discover` is the natural-language front door to the public job web — the user describes the job they want in their own words, and a careful research agent goes and finds candidates, transparently, on the user's own AI budget.

## FINDER, not JUDGE — the methodology boundary (IMPORTANT)

`discover` is a generous **finder**. Its job is to SURFACE plausible candidates the user would want to see — NOT to score them or rigorously judge fit. The deep judgment is a separate, later step: the **A–F evaluation** (`oferta` mode) reads the FULL job description with Playwright, scores it against the user's CV across the A–F dimensions, and checks legitimacy (block G). `discover` must NOT encroach on that territory — it has only shallow public signal (a search snippet, a careers-page list), and acting like a judge on shallow signal throws away real matches.

- **Search on the CORE intent** (role family + rough location) so results are relevant — but be GENEROUS at the margins. Recall over precision.
- **When a constraint can't be confirmed from the shallow signal you have, INCLUDE the candidate and FLAG the uncertainty in `why` — do NOT discard it.** A snippet that reads "US" may, in the full JD, say "US or remote-EU for the right person"; a title that looks senior may be open to your level inside. Discarding a real match on a shallow read is the worse error — the evaluation step (and the user) will filter rigorously later, with the full text.
- **Never produce an A–F/G score, a fit verdict, or a recommendation to apply/skip.** `why` is a one-line "here's how this maps to your intent" HINT, explicitly NOT a judgment. The score, the red-flags, the comp read, the legitimacy tier — all of that comes ONLY from the evaluation, once the role is in the pipeline.
- **Hard-exclude only on unambiguous, cheap signals**: the role family is plainly wrong (a "Sales Director" for an "AI engineer" intent), or the posting ITSELF states, unambiguously, something the user marked as a hard block. Everything else: surface + flag, and let `evaluate` be the judge.

---

## INPUT — parse intent into a small set of efficient searches

The input is one free-text intent. Decompose it into structured **facets**, then turn the facets into a **handful** of well-chosen searches. Do NOT fire one query per permutation — that burns tokens and returns noise.

**Facets to extract (any may be absent):**

| Facet | Examples |
|-------|----------|
| **role / skills** | "AI infra engineer", "forward-deployed", "RAG/agents", "platform" |
| **seniority** | senior, staff, lead, head, IC vs manager; *negative* seniority ("not staff+") |
| **location / remote** | "remote EU", "Berlin", "US-remote", timezone bands, hybrid/on-site |
| **company type** | seed/Series A, climate, devtools, healthtech, "not big-tech", "<200 people" |
| **recency** | "posted this week", "fresh", "last 30 days" |
| **ATS hints** | the user named a portal, or the company-type maps to a known ATS pattern |

**Defaults when a facet is missing:** fall back to the user's profile. Read `config/profile.yml` (target roles, location policy, seniority, comp band) and `modes/_profile.md` (archetypes, deal-breakers). The intent **overrides** the profile where they conflict ("remote EU" beats a profile that says "Madrid on-site"). If the intent is too vague to search well ("a good job"), ask **one** clarifying question — role family or location — then proceed. Don't interrogate.

**Turn facets into searches (the planning step):** aim for **3–6 queries total**, each targeting a different surface. A good plan mixes:
- 1–2 **portal-scoped** `site:` queries (the role × an ATS host) for broad discovery of unknown companies;
- 1–2 **company-type** queries (the company descriptor × role, to surface specific employers);
- 0–2 **named-company** lookups (if the intent or profile names companies, go straight to their ATS/careers page — cheaper and live).

State the plan in the narration channel before you search, so the user (and the web's live view) can see the strategy and its cost.

---

## STRATEGY — conservative, public, efficient

Three tactics, cheapest and most reliable first. **Public sources only.** Be deliberately frugal: a handful of strong queries beats fifty weak ones.

### (a) Public ATS APIs + known portals (PREFERRED when intent maps to a company)

When the intent or the profile names a **specific company** — or a company-type maps cleanly to a known employer — go straight to its public ATS, exactly like `scan` Level 2. This is the most reliable signal short of Playwright: structured, current, no Google-cache lag.

- **Greenhouse:** `https://boards-api.greenhouse.io/v1/boards/{company}/jobs` → `jobs[]` (`title`, `absolute_url`, `location.name`, `updated_at`)
- **Lever:** `https://api.lever.co/v0/postings/{company}?mode=json` → `[]` (`text`, `hostedUrl`, `categories.location`, `createdAt`)
- **Ashby:** POST `https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams`, `variables.organizationHostedJobsPageName={company}` → `jobBoard.jobPostings[]` (`title`, `id`, `locationName`)
- **Workday / Teamtailor / BambooHR:** see `modes/scan.md` § "API/Feed Patterns by Platform" for endpoints and parsing.

Reuse the parsing conventions documented in `modes/scan.md` verbatim — do not invent your own. If `portals.yml` already lists the company, you can lift its `careers_url`/`api`. (You may **read** `portals.yml`; you must **not** write to it.)

### (b) WebSearch with smart `site:` filters (BROAD DISCOVERY)

To surface companies the user doesn't yet track, use a **handful** of WebSearch queries scoped to ATS hosts. The `site:` filter is what keeps this efficient — it goes straight to real postings instead of aggregator spam.

Canonical ATS hosts to scope against:
- `site:job-boards.greenhouse.io` (and `site:job-boards.eu.greenhouse.io`)
- `site:jobs.ashbyhq.com`
- `site:jobs.lever.co`
- `site:*.myworkdayjobs.com`
- `site:*.teamtailor.com`

Compose role × constraint into each, e.g.:
- `site:jobs.ashbyhq.com ("AI infrastructure" OR "ML platform") remote`
- `site:job-boards.greenhouse.io "forward deployed engineer" (climate OR energy)`
- `("Series A" OR "seed") AI agents engineer careers remote EU`

Also useful: company **career domains** when the company-type narrows the field (`site:openai.com/careers`, `site:stripe.com/jobs`). Robots-respecting public search only.

From each result extract `{title, url, company, location?}` using the same patterns as `modes/scan.md` § "Extraction of Title and Company from WebSearch Results" (generic regex `(.+?)(?:\s*[@|—–-]\s*|\s+at\s+)(.+?)$`; company falls out of the host/path for ATS URLs). **Stop adding queries once you have a strong set** — see [Efficiency](#efficiency--cost).

### (c) WebFetch of PUBLIC career pages (CONFIRM + ENRICH)

For a promising hit where the search snippet is thin, WebFetch the **public** posting or careers page to confirm it parses as a real job and to fill `{title, company, location, postedHint}`. Prefer this over guessing from a snippet. WebFetch a small number of the **most promising** candidates — not every hit.

### What this mode will NOT do

- **No anti-bot or walled scraping, no evasion.** No logged-in pages, no CAPTCHA-bypass, no headers/cookies spoofing, no rate-limit circumvention, no LinkedIn/Indeed/Glassdoor scraping behind their walls. If a page needs auth or actively blocks bots, **skip it** and note why.
- **Respect robots.txt and ToS.** Public, indexable, robots-permitted pages only.
- **No bulk crawling.** This is targeted discovery, not a spider. A handful of fetches, not hundreds.

This conservatism is deliberate and non-negotiable: the local tool stays on the safe, public side of the line.

---

## DEDUP — never propose what's already known

Before showing **any** candidate, dedup against what the user has already seen or acted on. Proposing a job that's already in their pipeline is noise that erodes trust.

Dedup against three sources (read-only):
1. **`data/scan-history.tsv`** — every URL ever surfaced (column 0). Normalize URLs the same way `scan.mjs` does (`normalizeScanUrl`: strip query/fragment/trailing slash, lowercase host) before comparing.
2. **`data/applications.md`** — already evaluated: match on normalized **company + role**, so a re-posting at a new URL still dedups.
3. **`data/pipeline.md`** — already queued: exact URL in Pending or Processed.

Also dedup **intra-run** by normalized URL — the same posting often appears across multiple ATS-scoped queries; emit it once.

Drop every match silently (don't propose it), and reflect the count in the effort summary ("12 found, 4 already known → 8 new").

---

## VERIFICATION — every proposal is UNVERIFIED

**This is a hard rule (see `AGENTS.md` § Offer Verification).** WebSearch and WebFetch **cannot** confirm a posting is still live — Google caches results for weeks, and a fetched page can be a stale static shell. So **every** candidate `discover` proposes is **unverified by construction**.

- Mark every candidate with the canonical vocabulary: **`**Verification: unconfirmed**`**. The web renders this as a distinct **"unverified" badge** — visually separate from deterministic-scan results, which hit a live ATS API and are live by construction.
- **Never present an AI-discovered offer as live-confirmed.** Say so plainly in the narration and the CLI list: "These are AI-discovered candidates. I can't confirm any are still open until they're verified."
- **Real verification happens later, with Playwright:**
  - **on add** (optional) — the web can run `liveness-browser.mjs` / `check-liveness.mjs` against the chosen URL;
  - **at evaluate** — the `oferta` / auto-pipeline path navigates the URL with Playwright and writes the real `**Verification:**` header into the report.
- **Bias toward freshness, be honest about uncertainty.** Prefer postings that look recently posted (use `updated_at`/`createdAt`/`datePosted` from ATS payloads, or a date in the page) and surface that as `postedHint`. When you can't tell, say so — `postedHint: "unknown"` is honest; a fabricated date is not.

---

## OUTPUT — two channels from the same mode

`discover` speaks on two channels **simultaneously**. The machine channel is for the web (parsed into cards); the human-readable narration is shared by both (it's the "agent is hunting" reasoning the web surfaces live, and the running commentary a CLI user reads). The numbered list + add-offer are the CLI's interactive tail.

### Machine channel — the offer envelope (for the web)

Emit each candidate as a **single-line** envelope the moment you're confident in it — stream them as you go, don't batch to the end. One JSON object per line, prefixed and suffixed exactly:

```text
<<offer:{"url":"https://jobs.ashbyhq.com/acme/abc123","title":"AI Infrastructure Engineer","company":"Acme","location":"Remote (EU)","source":"ai-search","why":"ML platform role at a Series A climate startup; remote-EU — matches your intent","postedHint":"~5 days ago","ats":"ashby","verification":"unconfirmed"}>>
```

**Field contract** (matches the web's `DiscoveredOffer` type so it drops straight into the card grid):

| Field | Req | Meaning |
|-------|-----|---------|
| `url` | ✅ | Canonical public posting URL. Normalized (no tracking query params). The dedup key. |
| `title` | ✅ | Role title, as posted. |
| `company` | ✅ | Employer name (not the ATS vendor). |
| `location` | ✅ | As posted ("Remote (EU)", "Berlin", "Hybrid — NYC"). Empty string if truly unknown. |
| `source` | ✅ | Always `"ai-search"`. This is what `appendToScanHistory` records, distinguishing AI finds from the deterministic scan. |
| `why` | ✅ | One line: why this matches the intent. This is the agent's judgment — the thing a deterministic scan can't give. |
| `postedHint` | ✅ | Freshness as known: `"~5 days ago"`, `"2026-06-12"`, or `"unknown"`. Never fabricated. |
| `ats` | ⬚ | `greenhouse` \| `lever` \| `ashby` \| `workday` \| `""` — the host platform, when known. |
| `verification` | ✅ | Always `"unconfirmed"` for this mode. Drives the unverified badge. |

Rules: one envelope per line; no line breaks **inside** the JSON; valid JSON (double-quoted keys/strings, escaped quotes); emit each URL **once** (intra-run dedup applies before emitting). Anything outside `<<offer:...>>` markers is treated as narration.

### Narration channel — "the agent is hunting" (shared)

Between envelopes, narrate in plain language what you're doing — the search plan, which surface you're hitting, what you found and discarded. Keep it short and live. This is what makes the web's AI-search surface feel like watching a brilliant researcher work, and what keeps a CLI user oriented.

Example narration beats:
> Parsing intent → AI-infra / ML-platform · Series A climate · remote-EU · fresh.
> Plan: 2 Ashby+Greenhouse `site:` queries, 1 climate-startup query, plus a direct check on 2 companies in your profile. ~5 searches.
> Searching Ashby for ML-platform roles, remote… 6 hits, 2 already in your pipeline.
> Fetching Acme's posting to confirm it's real and recent… confirmed, ~5 days old.
> Done. 8 fresh candidates, all unverified — verify on add or at evaluate.

### Human channel — CLI flow

For direct CLI use (`/career-ops discover "…"`), after the narration + envelopes, print a clean numbered list and offer to add. Envelopes are silent on the surface a human reads (the web parses them; the CLI shows the list), but they're still emitted on the stream — keep both.

```text
Discover — "AI infra roles at climate startups, remote EU"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Searched: 5 queries · 14 found · 6 already known · 8 new candidates
⚠️  All candidates are AI-discovered and UNVERIFIED — I can't confirm any
    are still open until they're verified (on add, or when you evaluate).

  1. Acme — AI Infrastructure Engineer · Remote (EU) · ~5 days ago
     Series A climate startup, ML-platform role — matches "climate + infra + remote EU"
     https://jobs.ashbyhq.com/acme/abc123   [unconfirmed]
  2. Verdantix — ML Platform Engineer · Berlin / Remote · ~2 weeks ago
     ...
  8. ...

Add which to your pipeline? (e.g. "1, 3, 5" · "all" · "none")
```

On the user's selection, **add only the chosen ones** through the canonical writers — the same code path the web's add button uses:
- `appendToPipeline(selected)` → writes `- [ ] {url} | {company} | {title}` to `data/pipeline.md`.
- `appendToScanHistory(selected, today, "added")` → records each as `added` with `source = "ai-search"` and the location column, so a later scan/discover dedups it.

Then point them at the next step:
> Added 3 to your pipeline. Run `/career-ops pipeline` to evaluate them (that's when each gets Playwright-verified). Or paste one back to me to evaluate now.

Adding is **always** opt-in and explicit. "none" is a valid, common answer — discovery that surfaces good intel the user chooses not to queue is still a success.

---

## EFFICIENCY + COST

This mode spends the user's **own** tokens (their configured CLI/key). Be honest and frugal about it.

- **Few, targeted searches.** Plan 3–6 queries up front; only add more if the early results are thin. A `site:`-scoped query is worth ten unscoped ones.
- **Stop when you have a strong set.** Target **~10–25 strong candidates**, then stop searching. More is rarely better — it's just noise and spend. If you're past ~6 queries and still thin, say so and stop rather than grinding.
- **Prefer cheap signals.** A direct ATS API call (tactic a) is cheaper and more reliable than a search + multiple fetches. Fetch (tactic c) only the most promising thin hits.
- **Summarize effort** at the end: queries run, pages fetched, candidates found, duplicates dropped, new proposed. The web shows this as a small ledger; the CLI prints it in the summary header. The user should always know what the search cost.

> **On "free search":** the free, always-available default is the **deterministic Scan** (`scan.mjs`, zero-token). AI `discover` is the paid-with-your-own-key power-up for intent the scan can't express. If a user wants AI discovery without paying premium token rates, the answer is to configure a **free-tier AI CLI** — career-ops itself doesn't bundle a free AI tier. (Note: `gemini-eval` is an *evaluator*, not a web-search agent; don't route discovery through it.)

---

## Worked example

**Intent:** `"forward-deployed / applied AI engineer at Series A devtools startups, US-remote, posted recently"`

**Plan (narrated):** 5 searches — 2 ATS-scoped (`site:job-boards.greenhouse.io`, `site:jobs.ashbyhq.com`) × `"forward deployed" OR "applied AI"`, 1 devtools-startup query, plus direct Greenhouse API checks on 2 devtools companies from the profile.

**Run:**
1. Read `config/profile.yml` + `modes/_profile.md` → seniority = senior IC, US-remote OK, devtools is an existing target. Read `scan-history.tsv` / `applications.md` / `pipeline.md` for dedup.
2. `site:job-boards.greenhouse.io ("forward deployed" OR "applied AI") engineer remote` → 5 hits.
3. `site:jobs.ashbyhq.com "applied AI engineer" (devtools OR developer tools) remote` → 4 hits.
4. `("Series A" devtools) "forward deployed engineer" careers remote US` → 3 hits.
5. Greenhouse API for the 2 profiled companies → 2 live matches with `updated_at`.
6. Merge + intra-run dedup → 11 unique. Dedup vs history/apps/pipeline → drop 3 known. WebFetch the 3 thinnest of the remaining 8 to confirm title/recency.
7. Emit 8 `<<offer:...>>` envelopes (each `source:"ai-search"`, `verification:"unconfirmed"`), narrating as I go.

**Tail (CLI):**
```text
Searched: 5 queries · 3 fetched · 11 found · 3 already known · 8 new
⚠️  All 8 are AI-discovered and UNVERIFIED — verify on add or at evaluate.
  1. … 8. …
Add which to your pipeline? (e.g. "1, 3, 5" · "all" · "none")
```

User picks `1, 4, 7` → `appendToPipeline` + `appendToScanHistory(..., "added")` on those three only. → "Added 3. Run `/career-ops pipeline` to evaluate (Playwright-verified there)."

---

## Summary contract

- **Proposer, never writer.** Emit candidates; the human adds. Persistence only on add, only via canonical `scan.mjs` writers (`appendToPipeline` + `appendToScanHistory`, source `ai-search`).
- **Public + conservative.** ATS APIs → scoped WebSearch → public WebFetch. No walled/anti-bot scraping, respect robots/ToS.
- **Dedup before proposing** against `scan-history.tsv` + `applications.md` + `pipeline.md`, plus intra-run.
- **Everything is `**Verification: unconfirmed**`.** Real liveness is Playwright, on add or at evaluate. Never claim live-confirmed.
- **Two channels:** `<<offer:{…}>>` envelopes + live narration for the web; numbered list + add-prompt for the CLI.
- **Frugal:** 3–6 searches, stop at ~10–25 strong candidates, summarize the effort. The user's own tokens — spend them like they're yours, because they're theirs.
