# System Context -- career-ops

<!-- ============================================================
     THIS FILE IS AUTO-UPDATABLE. Don't put personal data here.
     
     Your customizations go in modes/_profile.md (never auto-updated).
     This file contains system rules, scoring logic, and tool config
     that improve with each career-ops release.
     ============================================================ -->

## Sources of Truth

| File | Path | When |
|------|------|------|
| cv.md | `cv.md` (project root) | ALWAYS |
| article-digest.md | `article-digest.md` (if exists) | ALWAYS (detailed proof points) |
| profile.yml | `config/profile.yml` | ALWAYS (candidate identity and targets) |
| _profile.md | `modes/_profile.md` | ALWAYS (user archetypes, narrative, negotiation) |

**RULE: NEVER hardcode metrics from proof points.** Read them from cv.md + article-digest.md at evaluation time.
**RULE: For article/project metrics, article-digest.md takes precedence over cv.md.**
**RULE: Read _profile.md AFTER this file. User customizations in _profile.md override defaults here.**

---

## Scoring System

The evaluation uses 6 blocks (A-F) with a global score of 1-5:

| Dimension | What it measures |
|-----------|-----------------|
| Match con CV | Skills, experience, proof points alignment |
| North Star alignment | How well the role fits the user's target archetypes (from _profile.md) |
| Comp | Salary vs market (5=top quartile, 1=well below) |
| Cultural signals | Company culture, growth, stability, remote policy |
| Red flags | Blockers, warnings (negative adjustments) |
| **Global** | Weighted average of above |

**Score interpretation:**
- 4.5+ → Strong match, recommend applying immediately
- 4.0-4.4 → Good match, worth applying
- 3.5-3.9 → Decent but not ideal, apply only if specific reason
- Below 3.5 → Recommend against applying (see Ethical Use in CLAUDE.md)

## Posting Legitimacy (Block G)

Block G assesses whether a posting is likely a real, active opening. It does NOT affect the 1-5 global score -- it is a separate qualitative assessment.

**Three tiers:**
- **High Confidence** -- Real, active opening (most signals positive)
- **Proceed with Caution** -- Mixed signals, worth noting (some concerns)
- **Suspicious** -- Multiple ghost indicators, user should investigate first

**Key signals (weighted by reliability):**

| Signal | Source | Reliability | Notes |
|--------|--------|-------------|-------|
| Posting age | Page snapshot | High | Under 30d=good, 30-60d=mixed, 60d+=concerning (adjusted for role type) |
| Apply button active | Page snapshot | High | Direct observable fact |
| Tech specificity in JD | JD text | Medium | Generic JDs correlate with ghost postings but also with poor writing |
| Requirements realism | JD text | Medium | Contradictions are a strong signal, vagueness is weaker |
| Recent layoff news | WebSearch | Medium | Must consider department, timing, and company size |
| Reposting pattern | scan-history.tsv | Medium | Same role reposted 2+ times in 90 days is concerning |
| Salary transparency | JD text | Low | Jurisdiction-dependent, many legitimate reasons to omit |
| Role-company fit | Qualitative | Low | Subjective, use only as supporting signal |

**Ethical framing (MANDATORY):**
- This helps users prioritize time on real opportunities
- NEVER present findings as accusations of dishonesty
- Present signals and let the user decide
- Always note legitimate explanations for concerning signals

## Archetype Detection

Classify every offer into one of these types (or hybrid of 2):

| Archetype | Key signals in JD |
|-----------|-------------------|
| AI Platform / LLMOps | "observability", "evals", "pipelines", "monitoring", "reliability" |
| Agentic / Automation | "agent", "HITL", "orchestration", "workflow", "multi-agent" |
| Technical AI PM | "PRD", "roadmap", "discovery", "stakeholder", "product manager" |
| AI Solutions Architect | "architecture", "enterprise", "integration", "design", "systems" |
| AI Forward Deployed | "client-facing", "deploy", "prototype", "fast delivery", "field" |
| AI Transformation | "change management", "adoption", "enablement", "transformation" |

After detecting archetype, read `modes/_profile.md` for the user's specific framing and proof points for that archetype.

## Global Rules

### NEVER

1. Invent experience or metrics
2. Modify cv.md or portfolio files
3. Submit applications on behalf of the candidate
4. Share phone number in generated messages
5. Recommend comp below market rate
6. Generate a PDF without reading the JD first
7. Use corporate-speak
8. Ignore the tracker (every evaluated offer gets registered)

### ALWAYS

0. **Cover letter:** If the form allows it, ALWAYS include one. Same visual design as CV. JD quotes mapped to proof points. 1 page max.
1. Read cv.md, _profile.md, and article-digest.md (if exists) before evaluating
1b. **First evaluation of each session:** Run `node cv-sync-check.mjs`. If warnings, notify user.
2. Detect the role archetype and adapt framing per _profile.md
3. Cite exact lines from CV when matching
4. Use WebSearch for comp and company data
5. Register in tracker after evaluating
6. **Respond to the user in their language.** If the user writes in French, Spanish, German, Japanese, or any other language, reply in that language. Generated content (CVs, cover letters, evaluation reports) follows the JD language — EN if not specified.
7. Be direct and actionable -- no fluff
8. Native tech English for generated text. Short sentences, action verbs, no passive voice.
8b. Case study URLs in PDF Professional Summary (recruiter may only read this).
9. **Tracker additions as TSV** -- NEVER edit applications.md directly. Write TSV in `batch/tracker-additions/`.
10. **Include `**URL:**` in every report header.**

### Tools

| Tool | Use |
|------|-----|
| WebSearch | Comp research, trends, company culture, LinkedIn contacts, fallback for JDs |
| WebFetch | Fallback for extracting JDs from static pages |
| Playwright | Verify offers (browser_navigate + browser_snapshot). **NEVER 2+ agents with Playwright in parallel.** |
| Read | cv.md, _profile.md, article-digest.md, cv-template.html |
| Write | Temporary HTML for PDF, applications.md, reports .md |
| Edit | Update tracker |
| Canva MCP | Optional visual CV generation. Duplicate base design, edit text, export PDF. Requires `canva_resume_design_id` in profile.yml. |
| Bash | `node generate-pdf.mjs` |

### Time-to-offer priority
- Working demo + metrics > perfection
- Apply sooner > learn more
- 80/20 approach, timebox everything

---

## Professional Writing & ATS Compatibility

These rules apply to ALL generated text that ends up in candidate-facing documents: PDF summaries, bullets, cover letters, form answers, LinkedIn messages. They do NOT apply to internal evaluation reports.

### Avoid cliché phrases
- "passionate about" / "results-oriented" / "proven track record"
- "leveraged" (use "used" or name the tool)
- "spearheaded" (use "led" or "ran")
- "facilitated" (use "ran" or "set up")
- "synergies" / "robust" / "seamless" / "cutting-edge" / "innovative"
- "in today's fast-paced world"
- "demonstrated ability to" / "best practices" (name the practice)

### Unicode normalization for ATS
`generate-pdf.mjs` automatically normalizes em-dashes, smart quotes, and zero-width characters to ASCII equivalents for maximum ATS compatibility. But avoid generating them in the first place.

### Vary sentence structure
- Don't start every bullet with the same verb
- Mix sentence lengths (short. Then longer with context. Short again.)
- Don't always use "X, Y, and Z" — sometimes two items, sometimes four

### Prefer specifics over abstractions
- "Cut p95 latency from 2.1s to 380ms" beats "improved performance"
- "Postgres + pgvector for retrieval over 12k docs" beats "designed scalable RAG architecture"
- Name tools, projects, and customers when allowed

---

## Market-Specific Notes

Apply these sections only when evaluating job postings in that market. Skip if not applicable.

---

### DACH (Germany, Austria, Switzerland)

**Compensation data sources:** Glassdoor, Levels.fyi, Kununu, Gehalt.de, StepStone Gehaltsreport

**Freelance rates:** Typically 30–60% above the gross hourly equivalent of permanent employment (social insurance, vacation, sick leave, bookkeeping costs).

| Term | Meaning | Evaluation Impact |
|------|---------|-------------------|
| **AGG** (Allgemeines Gleichbehandlungsgesetz) | Anti-discrimination law. Job ads must include "(m/w/d)" | Don't reject the posting for missing it — note as compliance gap |
| **13. Monatsgehalt** / Weihnachtsgeld | Extra month salary, typically paid in November | Comp calculation: gross × 13 (or × 13.5–14 in unionized sectors). NEVER omit from comparisons |
| **Festanstellung** vs **Freelance / Freie Mitarbeit** | Permanent vs self-employed | Permanent = social insurance covered, lower risk, lower rate. Freelance = higher rate, check Scheinselbstständigkeit risk |
| **Probezeit** | Typical 6-month trial period with shortened notice (2 weeks) | Market standard — not a red flag. Flag only if > 6 months |
| **Kündigungsfrist** | Statutory notice period post-probation, often 1–3 months | Relevant when switching jobs: plan start date accordingly |
| **Urlaub** | 25–30 days standard (legal min. 20 for 5-day week) | < 28 days = below tech market standard. Negotiable |
| **Tarifvertrag** / TVöD / IG Metall | Collective bargaining agreement | Narrower negotiation room — but higher security and fixed salary increases |
| **Betriebsrat** | Works council / employee representation | Common in Mittelstand and corporations. Input on dismissals and hours. Stability signal |
| **Bewerbungsmappe** | Cover letter + CV + references/certificates | Expected in DACH, unlike EN markets. Zeugnisse may be requested |
| **Arbeitszeugnis** | Structured reference document from former employer | DACH standard, uses coded language |
| **VWL** (Vermögenswirksame Leistungen) | Employer contribution to a savings plan | Small (often €40/month) but counts as a benefit |
| **bAV** (Betriebliche Altersvorsorge) | Company pension | Include in comp comparison — can be several hundred EUR/month |

**Negotiation scripts:**
- *Salary expectation:* "Based on current market data for this role, I'm targeting [range from profile.yml]. I'm flexible on structure — what matters is the total package and growth trajectory."
- *Geo-discount pushback:* "The roles I compete for are results-driven, not location-dependent. My track record doesn't change with the zip code."
- *When offer is below target:* "I'm comparing with offers in the [higher range]. [Company] appeals to me because of [reason]. Can we get to [target] together?"
- *13th month / bonus:* "I'd like to compare packages fairly. Could you break down the base salary, 13th month, and any variable component separately?"

---

### Francophone Market (France, Belgium, Switzerland, Luxembourg, Quebec)

**Compensation data sources:** Glassdoor, Levels.fyi, Welcome to the Jungle, APEC, Talent.io, Indeed Salaires

**Freelance rates:** Typically 30–50% above gross hourly CDI equivalent (social charges, vacation, sick leave, prospecting costs).

| Term | Meaning | Evaluation Impact |
|------|---------|-------------------|
| **CDI** (Contrat à Durée Indéterminée) | Permanent employment contract | Expected standard. A CDD for a senior role is a yellow flag |
| **CDD** (Contrat à Durée Déterminée) | Fixed-term contract | Acceptable for specific missions. Otherwise, ask why not CDI |
| **Période d'essai** | Trial period: 3–4 months for cadres (renewable once, max 8 months total) | Market standard. Flag if > 4 months initial |
| **Préavis** | Notice period: 1–3 months depending on collective agreement and seniority | Plan start date accordingly |
| **Statut cadre** | French professional category with specific social contributions and forfait jours | Almost all tech roles are cadre. Verify if mentioned |
| **Convention collective SYNTEC** | Most common IT/consulting collective agreement. Defines salary minimums and classifications | Verify position + coefficient to validate the offered salary |
| **RTT** (Réduction du Temps de Travail) | Extra rest days (typically 8–12/year) for cadres on forfait jours | Real perk — equivalent to 1–2 extra weeks of leave |
| **13e mois** | Extra salary month, often paid in December | Include in calculation: annual gross = monthly gross × 13. NEVER omit from comparisons |
| **Intéressement / Participation** | Profit-sharing. Participation is mandatory at 50+ employees | Can be 1–3 extra months salary/year. Variable — weigh cautiously |
| **Titres-restaurant** | Meal vouchers (Swile, Edenred). ~60% employer-covered | Common perk. ~€1,000–1,500/year in savings |
| **Mutuelle** | Supplementary health insurance. Mandatory, ≥50% employer-covered | Standard. Check quality of coverage (family, dental, vision) |
| **Prévoyance** | Life/disability/incapacity insurance | Less common as a selling point, but worth verifying |
| **CSE** (Comité Social et Économique) | Employee representative body | Benefits (holiday vouchers, culture, sport) = non-trivial perk in large companies |
| **Congés payés** | 25 legal days (5 weeks). Some agreements give more | < 25 days = illegal in France. 25 + RTT = tech standard. > 30 days = excellent |
| **Portage salarial** | Hybrid status between employment and freelance | Alternative to pure freelance. Simplifies admin but costs ~10% |
| **Auto-entrepreneur / Micro-entreprise** | Simplified freelance status with revenue cap | For short missions. Watch the revenue cap |

**Negotiation scripts:**
- *Salary expectation:* "Based on current market data, I'm targeting [range from profile.yml]. I'm flexible on structure — what matters is the total package and growth trajectory."
- *Geo-discount pushback:* "The roles I compete for are results-driven, not location-dependent. My track record doesn't change with the zip code."
- *When offer is below target:* "I'm comparing with packages in the [higher range]. [Company] appeals to me because of [reason]. Can we reach [target]?"
- *13th month / variable:* "To compare packages fairly, could you break down the gross annual base, any 13th month, and variable component separately?"

---

### Japan

**Compensation data sources:** OpenWork, Bizreach (ビズリーチ), Levels.fyi, Glassdoor, Blind

**Freelance rates:** Typically 30–60% above full-time equivalent hourly rate (social insurance, paid leave, bonuses, expenses, accountant fees).

| Term | Meaning | Evaluation Impact |
|------|---------|-------------------|
| **正社員** (Seishain) | Regular permanent employment. Covered by social insurance, paid leave, bonuses, and severance | Annual comp = monthly salary × 12 + bonuses (typically 2–6 months) |
| **業務委託** (Gyōmu itaku) | Contractor/freelance agreement, working as sole proprietor | Monthly rate looks high but no social insurance, bonuses, or severance. Calculate permanent equivalent for fair comparison |
| **賞与 / ボーナス** (Bonus) | Additional salary paid twice a year (summer + winter) | Major part of permanent comp. Annual salary = monthly × (12 + bonus months). Never omit from comparisons |
| **年俸制** (Nenpōsei) | Annual salary divided by 12 or 14–16 installments | Bonuses may be included in the annual total — verify the breakdown |
| **みなし残業 / 固定残業代** (Deemed overtime) | A set amount of overtime is pre-baked into the monthly salary | Verify how many hours are included and whether overtime beyond that is paid separately. Potential red flag |
| **36協定** (San-roku kyōtei) | Labor-management agreement on overtime limits | Indicator of a compliant work environment |
| **試用期間** (Shiyō kikan) | Trial period, typically 3–6 months | Standard in Japan — not a red flag |
| **退職金** (Taishokukin) | Severance payment upon leaving | Common in large/traditional companies. Rare in startups. Long-tenure perk |
| **通勤手当** (Tsūkin teate) | Commuting allowance (actual cost reimbursed) | Standard in Japan. Check monthly cap (e.g., ¥50,000/month) |
| **住宅手当 / 家賃補助** (Housing allowance) | Rent assistance | Offered by some large companies and startups. ~¥20,000–100,000/month |
| **健康保険 / 厚生年金** (Social insurance) | Health insurance + pension. Mandatory for permanent employees, employer covers half | Hidden comp in permanent employment. Critical when comparing with freelance rates |
| **有給休暇** (Yūkyū kyūka) | Paid leave: legal minimum 10–20 days/year | Check utilization rate. Very low = red flag |
| **退職予告** (Notice period) | Typically 1–2 months for permanent employees | Plan start date considering current employer notice |
| **ストックオプション** (Stock options) | Equity in startups | Growing in Japanese startups. Evaluate vesting, cliff, and tax treatment (tax-qualified vs non-qualified) |

**Negotiation scripts:**
- *Desired salary:* "Based on current market data for this role, my target is [range from profile.yml]. I'm flexible on structure — what matters is the overall package and growth opportunity."
- *Geo-discount pushback:* "The roles I'm applying to are results-oriented, not location-dependent. My track record doesn't change with the zip code."
- *When offer is below target:* "I'm comparing with offers in the [higher range]. I'm drawn to [company] because [reason]. Is there room to reach [target]?"
- *Permanent vs contractor comparison:* "To compare fairly, I'd like to understand the full comp structure: base salary, bonuses, paid leave, social insurance, commuting and housing allowances, and severance. For a contractor rate, what's the monthly equivalent once those are factored in?"
- *Deemed overtime (みなし残業):* "If the monthly salary includes deemed overtime, how many hours does that cover, and is overtime beyond that paid separately?"

---

### Brazil (PT-BR)

**Compensation data sources:** Glassdoor, Levels.fyi, Blind

**Freelance rates:** Typically 30–60% above CLT gross hourly equivalent (encargos, férias, FGTS, INSS, accountant fees).

| Term | Meaning | Evaluation Impact |
|------|---------|-------------------|
| **CLT** (Consolidação das Leis do Trabalho) | Formal employment with a signed work card (carteira assinada) | Includes FGTS, INSS, vacation, 13th month, prior notice. Factor in full employer cost for comparisons |
| **PJ** (Pessoa Jurídica) | Contractor billing via company (nota fiscal) | Higher monthly rate but no CLT benefits. Calculate CLT equivalent for fair comparison |
| **13º Salário** | Mandatory 13th month bonus for CLT employees | CLT comp = salary × 13 (or × 13.33 with vacation bonus ⅓). NEVER omit from comparisons |
| **FGTS** (Fundo de Garantia do Tempo de Serviço) | 8% of salary deposited by employer into a severance fund | CLT benefit — doesn't appear on payslip but is real compensation |
| **Vale-Refeição / Vale-Alimentação** | Food benefit (iFood, Sodexo, Alelo) | Common in CLT roles. Can reach R$1,500+/month. Include in total comp |
| **PLR** (Participação nos Lucros e Resultados) | Profit-sharing bonus | Can be 1–3 extra months salary/year. Variable — weigh cautiously |
| **Stock Options / VSOP** | Equity in startups | Common in Brazilian startups. Evaluate vesting, cliff, and liquidity |
| **Período de Experiência** | Trial period: 45+45 days (CLT) or per contract (PJ) | Market standard — not a red flag |
| **Aviso Prévio** | Notice period: 30 days (CLT) + 3 days per year worked | Plan start date based on current employment |
| **Plano de Saúde** | Health insurance (Amil, SulAmérica, Bradesco Saúde) | Highly valued in Brazil. No health plan = red flag for CLT roles |
| **Cooperativa / MEI** | Alternative contracting structures | Evaluate carefully — may indicate labor precariousness |

**Negotiation scripts:**
- *Salary expectation:* "Based on current market data for this role, I'm targeting [range from profile.yml]. I'm flexible on structure — what matters is the total package and growth trajectory."
- *Geo-discount pushback:* "The roles I compete for are results-driven, not location-dependent. My track record doesn't change with the zip code."
- *When offer is below target:* "I'm comparing with offers in the [higher range]. [Company] appeals to me because of [reason]. Can we reach [target] together?"
- *CLT vs PJ comparison:* "To compare fairly, I need to understand the full comp: base salary, 13th month, vacation, FGTS, meal vouchers, health plan, and PLR. For PJ, what's the monthly equivalent factoring those in?"

---

### Russia

**Compensation data sources:** habr.com/salary, hh.ru/salary, Levels.fyi (for international comparison), Glassdoor, Blind

**Currency:** Rubles (₽ / RUB). Use current USD/EUR exchange rate for international comparisons.

**Gross vs Net:** Salaries in Russia are frequently quoted gross (before income tax / НДФЛ 13%). Always clarify: gross or net (на руки). Approximate formula: `net ≈ gross × 0.87` (standard НДФЛ rate; actual rate may vary with income level and status).

**Bonuses:** Annual bonus (typically 1–3 months salary), quarterly KPI bonuses, 13th salary.

**Employment types:**

| Type | Description | Scoring Impact |
|------|-------------|----------------|
| **ТК РФ** | Employment under the Labor Code. Maximum legal protection | +0.3 to stability |
| **ГПХ** | Civil law contract (Договор ГПХ). Less protection | −0.1 to stability |
| **Самозанятость** | Self-employed status (NPD 6% tax). Minimal protection | −0.2 to stability |
| **ИП** | Individual entrepreneur | Neutral (context-dependent) |

**Typical benefits:**
- **ДМС** (voluntary medical insurance) — standard at large companies
- **ДМС стоматология** (dental ДМС) — extended package, positive signal
- Meal allowance — ₽5,000–15,000/month
- Sport/fitness reimbursement — ₽3,000–10,000/month
- Learning budget — conferences, courses, books (₽30,000–150,000/year)
- Remote work reimbursement — equipment, internet (₽3,000–10,000/month)

**Labor law (ТК РФ):**
- Trial period: up to 3 months (up to 6 months for managers)
- Vacation: minimum 28 calendar days + additional days (irregular schedule, hazardous conditions)
- Sick leave: covered by ФСС + employer top-up
- Termination: 2 weeks notice (can be waived by mutual agreement)
