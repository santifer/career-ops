# Schedule: Prospect Scan (every 6h)

## Purpose

Run all 3 discovery modes from `modes/prospect.md` to surface new job prospects. Dedup against existing entries and append net-new results to `prospects.md`. Write a summary of the run to `intelligence.md`.

## Trigger

- **Interval:** every 6 hours
- **Type:** background agent

## Required Tools (at least one)

- `exa` (preferred for semantic search)
- `parallel` (multi-source sweep)
- `tavily` (fallback)
- **Fallback:** WebSearch if none of the above are available

## Steps

1. **Load context**
   - Read `config/profile.yml` — target roles, keywords, location, deal-breakers
   - Read `intel/strategy-ledger.md` — active strategy, scoring weights, learned preferences
   - Read `intel/intel.yml` — source config, query templates, enabled providers

2. **Run discovery (3 modes from `modes/prospect.md`)**
   - Mode 1: Semantic match — vector/semantic search for roles matching profile archetype
   - Mode 2: Signal-based — search for companies showing hiring signals (funding, headcount growth, new product launches)
   - Mode 3: Market sweep — broad keyword sweep across configured job boards and portals

3. **Dedup**
   - Load existing entries from `intel/prospects.md`
   - Remove any results whose URL already appears in `prospects.md` or `data/scan-history.tsv`
   - Remove duplicates within this run's results

4. **Append net-new prospects**
   - Write each new prospect to `intel/prospects.md` in the standard prospect format
   - Each entry: company, role, URL, source, match signal, discovery date, initial score (if computable)

5. **Write run summary to `intel/intelligence.md`**
   - Append a timestamped block: run time, sources used, total found, net-new added, top 3 prospects (company + role)
   - If zero net-new: note "no new prospects this cycle"

## Config

```yaml
interval: 6h
required_tools:
  one_of: [exa, parallel, tavily]
  fallback: WebSearch
output:
  prospects: intel/prospects.md
  summary: intel/intelligence.md
  dedup_against: [intel/prospects.md, data/scan-history.tsv]
```

## Notes

- Do not re-evaluate prospects that already exist in `data/applications.md`
- If `intel/intel.yml` defines custom query templates, use them; otherwise derive queries from `config/profile.yml` target roles
- Score is optional at this stage — full evaluation runs separately via `modes/oferta.md`
