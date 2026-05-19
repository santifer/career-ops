---
name: intel-refresh
description: Refresh cached intel slots (hm-intel, toxicity composite, strategy-ceiling, positioning) for one apply-now row or all rows. Trigger when Mitchell says "refresh intel for X", "regenerate positioning for X", "what's the toxicity at X", "fill missing data for this role", "intel-refresh row N", or "rebuild intel caches". Wraps `scripts/agents/intel-refresh.mjs`. 3-day cache TTL. Each row burns ~$30 hm-intel + ~$2 toxicity + ~$1 strategy + ~$1 positioning = ~$35/row at full refresh. Resumable via `data/intel-refresh-state.json`. Also runs nightly at 02:00 PT via launchd.
user_invocable: true
args: query
argument-hint: "row 044  OR  --all --slots positioning  OR  --row 048 --slots hm-intel,toxicity"
---

# intel-refresh — Keep the apply-pack intel layer fresh

## What this skill does

Refreshes one or more of 4 cache slots for one apply-now row (or every row when `--all`):

| Slot | Output | Purpose |
|---|---|---|
| `hm-intel` | `data/hm-intel/<slug>.json` | HM + recruiter + comp intel + honest gaps. Shells to existing `scripts/hiring-manager-research.mjs --no-skip-deep` (full Gemini Deep Research Max engagement, ~$30/role). |
| `toxicity` | `data/company-toxicity-cache/<companySlug>.json` | Glassdoor + Blind + Reddit + Levels.fyi + LinkedIn + X sentiment, quoted excerpts + composite. ~$2/row. |
| `strategy-ceiling` | `data/strategy-ceiling/<num>-<metric>.json` (per-metric: alignment, interview-likelihood, hm-noticing) | Role-specific ceiling + concrete lift moves. ~$1/row. |
| `positioning` | `data/positioning-cache/<num>.json` | Full 4-model council + Opus dealbreaker on the strongest 3-sentence positioning. ~$1/row. |

**Cache TTL:** 3 days (quality-first; per Decision-Maximization Policy). `--force` to bypass.

**Resumability:** `data/intel-refresh-state.json` tracks last refresh per row + slots done. If the job crashes, re-running picks up where it left off (re-checks freshness per slot).

**Auto-schedule:** `com.mitchell.career-ops.intel-refresh.plist` runs nightly at **02:00 PT** with `--all --slots all`. Stale caches (>3d) get refreshed.

## When to trigger

- `/intel-refresh 044` — refresh row 044 (all 4 slots)
- "refresh intel for Anthropic Communications Lead"
- "regenerate positioning for row 048"
- "what's the toxicity at OpenAI" → trigger with the appropriate row
- "fill missing data for this role"
- "rebuild intel caches" → `--all`
- "intel refresh row N slots hm-intel"

## Example invocations

### Refresh ONE row, all 4 slots
```bash
node scripts/agents/intel-refresh.mjs --row 044
```

### Refresh ONE row, only toxicity + positioning (faster, cheaper)
```bash
node scripts/agents/intel-refresh.mjs --row 044 --slots toxicity,positioning
```

### Refresh EVERY row, all slots (the nightly cadence)
```bash
node scripts/agents/intel-refresh.mjs --all
```

### Force-refresh a single row regardless of TTL
```bash
node scripts/agents/intel-refresh.mjs --row 044 --force
```

### Via dashboard
Click the **↻ Refresh intel** button in any right-rail drawer. The button POSTs to `/api/intel-refresh`, opens the alpha-job SSE stream, renders progress in the drawer popout. Per-slot completion lights up the relevant intel widgets in the drawer.

## Inputs
- `data/apply-now-queue.json` (row → company/role lookup)
- `cv.md` (for strategy-ceiling + positioning prompts)
- `data/hm-intel/<slug>.json` (positioning reads this for context)
- `.env` (`PERPLEXITY_API_KEY`, `XAI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` — at least 2 of the 4 council models must respond per slot)

## Outputs
- `data/hm-intel/<slug>.json` — HM intel cache (shape per existing `scripts/hiring-manager-research.mjs`)
- `data/company-toxicity-cache/<companySlug>.json` — toxicity composite + per-signal quotes + URLs + verdict
- `data/strategy-ceiling/<num>-<metric>.json` × 3 metrics — current/ceiling pct + lift moves with cv.md citations
- `data/positioning-cache/<num>.json` — 3-sentence positioning + 1-sentence DM version + anti-positioning + citations
- `data/intel-refresh-state.json` — resumability state

## Constraints / hard rules

- Never invent quotes for toxicity signals. If no URL → don't include.
- Every positioning sentence cites cv.md:N or an hm-intel field.
- Cache TTL: 3 days. Don't shorten without an explicit reason (quality-first).
- `--no-skip-deep` is the default for hm-intel — never skip Gemini Deep Research Max unless explicitly cost-capped.

## Anti-hallucination + anti-sycophancy reminders

- The hm-intel research is the expensive ground truth. Don't paraphrase it into the toxicity / positioning slots — quote it.
- The positioning Opus dealbreaker is the failsafe. If the per-model council converges on hype, the dealbreaker should prune it. Read the `dealbreaker_notes` field.
- If a slot fails to produce real evidence (e.g., toxicity finds zero Glassdoor signals for a stealth-mode startup), surface the empty result with `composite_band: "unknown"` instead of making up a band.

## Related agents / skills
- `apply-pack-polish` — consumes the cached intel during Phase 1 signal harvest. Refresh intel before polish for the freshest signals.
- `hiring-manager-research` — the underlying research script for the hm-intel slot.
