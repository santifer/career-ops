# Evaluación: Sola — Software Engineer, Desktop Automation

**Fecha:** 2026-05-08
**Arquetipo:** AI Platform / MLOps Engineer (Windows desktop substrate) + adjacencies to Agentic/Automation
**Score:** 2.6/5
**URL:** https://jobs.ashbyhq.com/sola/9a9c39a9-6a15-4b76-b538-f7d219fdb92e
**Legitimacy:** High Confidence
**Location:** Full-time remote OR in-person 5 days at NY HQ; relocation supported for NY
**PDF:** Not generated (score < 3.0)

---

## A) Resumen del Rol

| Campo | Valor |
|-------|-------|
| Empresa | Sola (a16z + Conviction + YC; $21M raised; Series A) |
| Rol | Software Engineer, Desktop Automation |
| Arquetipo | AI Platform / Systems Engineer (Windows desktop substrate for agentic execution) |
| Domain | Horizontal RPA/agentic automation across healthcare, finance, legal, logistics; Fortune 100 customers |
| Function | Build the desktop execution platform — session lifecycle, RDP/VNC, Win32 accessibility, hybrid VLM perception |
| Seniority | Mid-to-senior IC ($160-300K range implies wide band; founding-team adjacent) |
| Remote | Remote OR NY HQ in-person 5d/wk; relocation covered |
| Comp | $160K-$300K + meaningful Series-A equity + 401(k) match + comprehensive medical/dental/vision + 4-week PTO |
| Stack | TypeScript, Python, Appium, VNC/RFB, RDP, Tailscale, Temporal, Kubernetes; Windows accessibility (UIA, MSAA, Win32); VLM-based visual grounding |
| Education | Not specified |
| TL;DR | Strong Series-A startup with a16z backing, but the role is **deep Windows desktop systems engineering** (RDP/VNC protocols, accessibility frameworks, Win32 internals) — significantly off Deepak's healthcare-RAG/agentic Applied AI North Star. The "AI" surface is the perception layer (VLM grounding) sitting on top of OS-level plumbing the candidate has not built. |

## B) Match con CV

| JD Requirement | CV Match | Source |
|---|---|---|
| Built and operated automation infrastructure (browser or desktop) | No direct match — closest is Manga Lens content-script automation, but that is browser DOM, not desktop OS | cv.md L60 |
| OS-level APIs / remote desktop protocols / browser internals / accessibility | None — Deepak has not worked with VNC/RDP/UIA/MSAA/Win32 | — |
| Strong reliability + failure-mode instincts | Partial — FastAPI services with structured logging + load simulation; ~30% defect reduction post-deploy | cv.md L28 |
| TypeScript | Manga Lens TS extension (Manifest V3, content scripts, service workers) | cv.md L60 |
| Python | Strong — Progress Solutions (FastAPI/Flask + RAG + agentic LLM + ML pipelines) | cv.md L22-30 |
| Appium / VNC / RFB / Tailscale / Temporal / Kubernetes | None — no production experience with any of these | — |
| Windows desktop VM automation / orchestration | None | — |
| Hybrid perception pipeline (Windows accessibility trees + VLM visual grounding) | Adjacent — YOLOv8 visual perception (Driver Drowsiness) + ControlNet/OpenPose for pose conditioning + multi-provider VLM (Manga Lens: Claude Sonnet, GPT-4o mini, Ollama) | cv.md L68, L62, L60 |
| AI agents / LLM orchestration (the agent side) | Strong — agentic LLM workflows + multi-agent claims pipeline + LLM orchestrator in Pixel Character engine | cv.md L26, L72, L62 |
| 5-day NY in-person OR proven remote-with-self-motivation | Kent OH-based; remote-track preferred; F-1 OPT requires US W-2 (compatible with US-remote OR NY relocation) | profile.yml |

**Gaps:**
1. **Windows desktop internals (UIA, MSAA, Win32)** — **hard blocker**. The role's core is OS-level plumbing the candidate has zero exposure to. Mitigation: only realistic if the team is willing to invest 3-6 months ramp on RDP/VNC/Win32 — unlikely at Series A pace.
2. **Remote desktop protocols (VNC/RFB/RDP)** — **hard blocker**. Protocol-level work, not application-level.
3. **Temporal / Kubernetes for orchestration** — **soft blocker**. Docker is in CV; K8s and Temporal are not.
4. **Appium / browser-internals automation** — **soft**. Manga Lens uses Manifest V3 + capture pipelines, adjacent but not Appium-style.

The VLM-perception side of the role is the only place Deepak's strengths (Manga Lens multi-provider vision, ControlNet, YOLOv8) plug in directly — but it is one slice of a job whose center of mass is OS plumbing.

## C) Nivel y Estrategia

The compensation band ($160-300K) implies they expect anything from Mid IC (low end) to Staff (high end). Deepak's 2.5y profile lands at the bottom of the band only if Windows-internals expertise compensates — and it doesn't.

**Sell honestly (don't overclaim):**
- "I've built browser-extension automation (Manga Lens — Chrome Web Store, four vision providers, multi-section capture pipeline) and multi-provider LLM perception, so I understand the agent + perception side. I have not built the OS desktop protocol layer yet."
- "If you're hiring an AI Engineer for the perception/grounding side, I'd be a 4-5/5 fit. For the desktop-substrate role as written, I'd be a 2-3/5 — I can ramp but it would be measured in quarters."

**Recommendation:** SKIP for this exact JD. Watch Sola for an "Applied AI Engineer (perception)" or "Agent Reliability Engineer" role that maps to the candidate's strengths.

## D) Comp y Demanda

| Source | Range | Notes |
|--------|-------|-------|
| JD-disclosed | $160-300K base + Series-A equity | Wide band reflects mid-to-staff |
| Levels.fyi (Mid Series-A) | $150-200K base + 0.10-0.50% equity | Mid IC at a16z Series A |
| Glassdoor (Desktop Automation Engineer) | $140-180K | RPA/Win32 specialty premium |
| a16z Series-A equity norms | 0.05-0.30% for 1st 20 hires | Sola is small founding team |
| Demand trend | Computer-use / desktop agents extremely hot 2026 (Anthropic Claude Computer Use, OpenAI Operator, Sola, Browser Use) | Strong demand for Win32-savvy engineers |

**Negotiation anchor (if pursuing):** Bottom of band ($160-180K) + strong equity given role mismatch.

## E) Plan de Personalización

| # | Sección | Estado actual | Cambio propuesto | Por qué |
|---|---------|---------------|------------------|---------|
| 1 | Summary | "Healthcare-focused..." | Rewrite to "Applied AI engineer with multi-provider vision + agentic LLM orchestration; built Chrome extension automation at Web Store scale" | Match the perception/agent side, since OS side is uncoverable |
| 2 | Manga Lens | Listed | Promote to project #1 — emphasize "four AI vision providers, multi-section capture pipeline, viewport-slice screenshots with coordinate remapping" | Closest analogue to "hybrid perception pipeline" |
| 3 | Pixel Character LLM Orchestrator | Listed | Promote — emphasize "LLM-based agent orchestrator decomposes high-level prompts into generation tasks" | Direct agent-orchestration signal |
| 4 | Skills | Generic Python+TS | Add explicit "Browser-extension automation, Manifest V3, multi-provider VLM, screen-capture pipelines" | JD asks for browser-internals adjacency |
| 5 | Gap honesty | — | In cover letter: "I don't have RDP/VNC/Win32 yet — happy to ramp if the perception side is the priority hire" | Forthright framing — better than papering over |

**LinkedIn:** No headline change for this role given the overall fit is weak.

## F) Plan de Entrevistas

| # | JD Requirement | Story (STAR+R) | S | T | A | R | Reflection |
|---|----|----|----|----|----|----|----|
| 1 | Reliability + failure modes in automation | Manga Lens multi-provider failover | Some manga sites cause CUDA crashes on Ollama; cloud providers rate-limit at peak | Build per-provider payload selection (WebP for cloud, JPEG for Ollama) + failover order + 7-day cache | Multi-provider routing with explicit per-provider quirks documented | Stable extension shipped to Chrome Web Store with 4 providers live | **Provider-quirk handling is most of the work in multi-vendor AI** — would lead with a failure-mode matrix in next multi-vendor system |
| 2 | Hybrid perception pipeline | Driver Drowsiness YOLOv8 + sliding-window aggregation | False positives from blinks degraded usability | Sliding-window confidence aggregation + adaptive frame skipping + NMS tuning | ~25% reduction in blink-driven false positives + ~30% latency cut | Stable real-time fatigue monitoring | **Confidence aggregation > raw model output** — the lesson generalizes to any visual-grounding pipeline including Sola's VLM substrate |
| 3 | LLM-based agent orchestration | Pixel Character Engine agent orchestrator | High-level prompts (e.g. "running pixelated knight") needed task decomposition into pose, identity, animation steps | LLM orchestrator decomposes into pose + identity + texture sub-tasks; ControlNet for pose, LoRA for identity, latent-space consistency for animation | Coordinated 4-stage generation pipeline | Identity-consistent pose-controlled sprite-sheet output | Agent decomposition is the hard part, not single-shot LLM calls — this maps to "decompose user workflow → desktop actions" |
| 4 | Honesty about gap | Gap framing | Recruiter probes Win32/VNC depth | "I don't have it. I have multi-provider VLM perception, agent orchestration, and browser-extension automation. If your hire prioritizes the perception/agent side, I ramp on the OS side over a quarter" | Direct, no overclaiming | Either get a perception-focused offer or a clean "thanks, not a fit" | **Honest gap framing > forced fit** — saves both sides time |
| 5 | Self-motivated remote work | Manga Lens solo ship | No team, no spec, no deadline | Independent design, build, ship, maintain | Live on Chrome Web Store with 29 site selectors and 7-day cache | Solo public artifact | **Solo public ship is the strongest remote-self-motivation signal at Mid IC** |

**Case study:** Manga Lens — Chrome extension multi-provider vision pipeline.

**Red-flag question:** "What's your Win32 / accessibility framework experience?" → "Honest answer: zero — but I built browser-extension automation at Web Store scale, multi-provider VLM payload handling, and YOLOv8 perception. If your hire prioritizes the perception layer, those are 1:1 transferable. If you need OS-internals on day one, I'd be honest that I'd need a quarter to ramp."

## G) Posting Legitimacy

| Signal | Finding | Weight |
|--------|---------|--------|
| Posting freshness | Active on Ashby — listed in current job board | Positive |
| Description quality | Specific stack (TypeScript, Python, Appium, VNC/RFB, Tailscale, Temporal, K8s); specific founders + investors named (a16z, Sarah Guo Conviction, YC); specific customers (Anthropic, AWS AGI Lab partnerships) | Positive |
| Salary transparency | Disclosed $160-300K + equity + benefits | Positive |
| Reposting pattern | First seen this scan | Neutral |
| Company hiring trend | $21M Series A; growing fast; Fortune 100 customers | Positive |
| Role-company fit | Desktop Automation is core to Sola's product (computer-use agent platform) — not an evergreen / vague role | Positive |
| Layoff news | None — early Series A | Neutral |

**Assessment:** **High Confidence** — real, well-funded, hot-domain role with a specific technical scope.

## H) Draft Application Answers

(Score < 4.5 — drafts skipped per modes/oferta.md.)

---

## Keywords extraídas

Software Engineer, Desktop Automation, Sola, agentic automation, computer-use, Win32, MSAA, UIA, accessibility framework, RDP, VNC, RFB, Tailscale, Temporal, Kubernetes, TypeScript, Python, Appium, VLM, visual grounding, hybrid perception pipeline, browser internals, a16z, Conviction, Y Combinator, Series A, Fortune 100, $160-300K, NY HQ
