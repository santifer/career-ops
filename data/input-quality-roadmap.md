# Input-Quality Roadmap — Adjudicated 2026-05-19

Source: [data/council-input-quality-audit-2026-05-19-adjudicated.md](council-input-quality-audit-2026-05-19-adjudicated.md)

Total project estimate: **~52 hours** for the complete system overhaul (excluding full launchd migration).
Highest-ROI 6 items capture **80% of value in ~14 hours**.

---

## P0 — Foundational reliability + cadence (~9.5h)

- [ ] **P0-1** — Healthchecks.io integration (30 min, blocks on user signup)
- [x] **P0-2** — Tiered every-4h cadence (1h) — *see scripts/launchd/com.mitchell.career-ops.scan.plist*
- [ ] **P0-3** — Gmail-alert processing every 15-30 min (2h)
- [ ] **P0-4** — Zombie composite scorer baseline (4h) — *Opus formula: 0.35 age + 0.25 cluster + 0.20 cosine + 0.10 unmaintained + 0.10 evergreen-regex*
- [ ] **P0-5** — `first_seen_at` instrumentation (2h, depends on P0-2)

## P1 — High-value follow-on (~32h)

- [ ] **P1-1** — HN "Who is Hiring" Algolia API ingestion (2h)
- [ ] **P1-2** — 10 VC-portfolio Getro/Pallet boards (4h) — *a16z / Sequoia / Greylock / Index / Lightspeed / Bessemer / NEA / Accel / Insight + Khosla (Pallet, different endpoint)*
- [x] **P1-3** — 12 vertical-AI companies added to portals.yml (2h) — *Harvey, Hippocratic, Decagon, Cursor, Perplexity, Scale, Together, Fireworks, Baseten, Modal, Hugging Face, Replit*
- [ ] **P1-4** — YC Work-at-a-Startup GraphQL polling (2h)
- [ ] **P1-5** — Loud dashboard widget (SKIPPED / yellow-late / red / purple-low-volume states) (2h, depends on P0-1)
- [ ] **P1-6** — SQLite `job_runs` ledger (2h)
- [ ] **P1-7** — Cosine-similarity embedding for chronic-relist detection (4h, depends on P0-4)
- [ ] **P1-8** — Wrapper-script launchd patch (Grok-4's interim workaround) (2h, depends on P0-1)
- [ ] **P1-9** — `pmset repeat wakeorpoweron MTWRFSU 01:55:00` (15 min, needs sudo)
- [x] **P1-10** — Drop Anthropic Discord, Carta, EquityZen, Forge from candidate configs (5 min) — *confirmed not present anywhere*
- [ ] **P1-11** — Keyword-expansion filter for FDE-equivalents (2h) — *"Forward Deployed", "Customer Engineer", "Solutions Architect", "AI Engineer Customer", "Deployment Strategist", "Field Engineer", "Technical Account", "Strategic Product Engineer", "AI Transformation", "AI Enablement"*
- [ ] **P1-12** — GitHub Actions cron migration for 3 highest-stakes plists (portal-scan, dashboard-server, telegram-bot) (1d)

## P2 — Optional polish (~10h)

- [ ] **P2-1** — AI Engineer Foundation job board scrape (2h)
- [ ] **P2-2** — Latent Space Discord bot integration (half-day)
- [ ] **P2-3** — Curated X List of 50-100 AI founders + mobile notifications (2h one-time)
- [ ] **P2-4** — Modal Labs jobs board scrape (30 min)
- [ ] **P2-5** — Add 5-8 second-tier vertical AI cos (Abridge, Ambience, EvenUp, Spellbook, Hebbia, Rogo, Crescendo, Lorikeet) (2h, depends on P1-3)
- [ ] **P2-6** — Defense/govtech AI (Anduril, Shield AI, Applied Intuition) (1h)
- [ ] **P2-7** — LangChain + LlamaIndex (1h)
- [ ] **P2-8** — Workday endpoint scrape for Palantir + other Workday AI cos (half-day)
- [ ] **P2-9** — Levels.fyi unofficial API as post-ingestion comp-filter layer (2h)
- [ ] **P2-10** — Missing-ATS detector (auto-add unknown companies from VC boards) (2h, depends on P1-2)
- [ ] **P2-11** — Full launchd migration for remaining 39 plists (2-3d, depends on P1-12)
- [ ] **P2-12** — Calibrate Opus composite scorer coefficients against 14-day corpus (2h, depends on P0-4 + 14d data)
- [ ] **P2-13** — Re-adjudicate Impasse 2 (FDE hour-of-day) against `first_seen_at` data (2h, depends on P0-5 + 14d data)

---

## Key impasse verdicts (from dealbreaker)

1. **Tier-A cadence:** every-4h baseline. Hourly buys <5% incremental signal at 2x cost. Greenhouse boards-api is unrate-limited.
2. **FDE hour-of-day:** undecidable until `first_seen_at` data (P0-5) lands + 14d corpus accumulates.
3. **LinkedIn signal:** Gmail-alert ingestion ONLY. NO direct scraping (late-2025 login wall + active enforcement).
4. **X $200/mo API:** SKIP. Grok-x-search conflict-of-interest correctly flagged. Free curated X List + mobile notifs gets 70-80% of signal.
5. **Launchd migration:** P0 = wrapper-script patch + Healthchecks; P1 = GitHub Actions for 3 critical plists; P2 = full migration.
6. **Zombie age threshold:** 45 days. Apply via composite scorer, not standalone binary.
7. **Latent Space Discord lead time:** conservative same-day-to-1-day per dealbreaker (Grok-x-search's 4-18h needed methodology review).
