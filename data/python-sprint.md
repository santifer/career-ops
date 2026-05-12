# Python Sprint — 90-Day Tracking

**Goal:** Close the Python gap that all four cross-model audit models flagged as a career-scale blocker.
**North Star artifact:** `Newsroom-Agent-Benchmark` — a public, runnable benchmark measuring factuality, style fidelity (Voice DNA cosine similarity), and token latency across Claude, GPT-4o, and Gemini for LLM-generated broadcast news copy.
**By day 90:** deployed Python service, published technical thought-leadership, multi-model benchmark with leaderboard, video demo, open-source contribution.
**Reference:** `data/CROSS-MODEL-CAREER-INTELLIGENCE-REPORT.md` §6

---

## WEEK 1 — Days 1–7: Python Fundamentals

**Target:** Write Python every day. Internalize syntax and idioms before touching web frameworks.

- [ ] Complete *Automate the Boring Stuff with Python* chapters 1–6 (functions, lists, dicts, file I/O, regex) — free at automatetheboringstuff.com
- [ ] Write one Python script per day (suggested: rewrite a Node.js script from career-ops in Python — start with the simplest one)
- [ ] Set up a local venv: `python3 -m venv .venv && source .venv/bin/activate`
- [ ] Install core packages: `pip install fastapi uvicorn requests openai anthropic`
- [ ] Push a daily practice folder to a private GitHub repo — habit formation, not portfolio (yet)

**Day 1 suggested script:** Rewrite `scripts/token-counter.mjs` in Python. Same logic, different runtime — forces you to translate file I/O, string manipulation, and basic math.

---

## WEEK 2 — Days 8–14: Deploy Voice OS as a Web Service

**Target:** Shipped public FastAPI endpoint. This is the first real portfolio artifact.

- [ ] Read `corpus/projects/voice-os.md` to understand the current Voice OS design
- [ ] Build a FastAPI endpoint: `POST /analyze` accepts text, returns voice similarity score vs. the reference corpus
  - Start with a simple string-matching approach; upgrade to embeddings in Week 4+
  - Use `anthropic` SDK to call Claude for analysis if needed
- [ ] Add a basic `GET /health` endpoint (production discipline from day one)
- [ ] Deploy to Vercel or Modal (free tier) — don't skip this step, a live URL is the point
- [ ] Push to GitHub with a clean README explaining what the service does
- [ ] Update `cv.md` projects section: add "Deployed public FastAPI service (Voice OS API — [link])"

**Day 14 milestone:** Share the GitHub URL with 1 person in an AI builder community (Discord, X) as accountability.

---

## WEEK 3 — Days 15–21: Publish First Technical Post

**Target:** Published thought-leadership in Mitchell's specific niche. "Kill-List RAG" is the topic because it's yours — no one else can write this piece.

- [ ] Write "Kill-List RAG: negative-example conditioning for stylistic risk control" — 1,500–2,000 words
  - Structure: Problem → The naive approach → What we actually built → The Kill List mechanism → Results (99% fidelity metric) → Open questions
  - Include a code snippet or two — even pseudocode signals technical literacy
  - Link to the Voice OS API repo deployed in Week 2
- [ ] Cross-post to:
  - [ ] storytellermitch.com (personal blog)
  - [ ] LinkedIn article (same content, slightly shorter intro)
  - [ ] Hacker News Show HN submission — title: "Show HN: Kill-List RAG — negative-example conditioning for stylistic fidelity in LLM agents"
- [ ] Save the HN post URL and share count as a proof point for applications

---

## WEEKS 4–5 — Days 22–35: Newsroom-Agent-Benchmark Core Build

**Target:** The anchor artifact. README-first, then code.

- [ ] Register `newsroomagentbench.ai` domain (or `.com`/`.io` equivalent — check availability)
- [ ] Create GitHub repo: `newsroom-agent-benchmark` (public, MIT license)
- [ ] Write the README **before writing any code** (README-driven development):
  - What the benchmark measures (factuality, voice fidelity, token latency)
  - Why these three axes (newsroom-specific framing)
  - How to run it (target: clone + `pip install -r requirements.txt` + `python run_benchmark.py`)
  - How to contribute (even a stub CONTRIBUTING.md)
- [ ] Define 3 evaluation axes:
  - Factuality: citation recall (does the generated copy cite verifiable facts from the input wire?)
  - Voice DNA fidelity: cosine similarity to reference corpus (Claude embedding vs. target style)
  - Token latency: ms to first token + full completion time, per model
- [ ] Add 20 sample wire-service headlines as test fixtures (use AP/Reuters style headlines as format reference — write fictional ones to avoid copyright)
- [ ] Implement benchmark harness:
  - [ ] Python + LangChain Expressions Language (LCEL) or plain SDK calls
  - [ ] Weaviate vector store (or Pinecone free tier) for Voice DNA similarity
  - [ ] Claude, GPT-4o, and Gemini SDK integrations (3 model providers)
  - [ ] Output: JSON results file with all three axis scores per model per prompt

---

## WEEKS 6–7 — Days 36–45: Production-Grade Benchmark

**Target:** The benchmark runs in CI, has a leaderboard, and is forkable by others.

- [ ] Add Streamlit leaderboard dashboard — real-time visualization of model scores across all three axes
- [ ] Add GitHub Actions CI:
  - [ ] `pytest-benchmark` runs on push
  - [ ] Results posted as a comment on each PR (GitHub Actions + comment bot)
- [ ] Deploy demo to Modal or Replicate with a public URL
- [ ] Add `CONTRIBUTING.md` (signals multi-contributor intent; makes the repo forkable)
- [ ] Pin dependencies in `requirements.txt` and add a `Makefile` with `make test`, `make run`

---

## WEEK 7 (OF SPRINT) — Days 46–60: Launch

**Target:** Distribution event. The code was the means; the signal is the community response.

- [ ] HN Show HN post — title: "Show HN: Newsroom-Agent-Benchmark — factuality + style fidelity + latency eval for LLM broadcast copy"
- [ ] LinkedIn article: "I built the benchmark I wish existed when I was deploying LLMs in a newsroom" — lead with the newsroom credibility, end with the technical result
- [ ] Cross-post to r/MachineLearning and r/LocalLLaMA (adapted framing for each community)
- [ ] Email the repo link to 3 hiring managers at SEQ companies (not as an application — as a "thought you'd find this useful" signal)
  - [ ] Portkey (Founding SA — this is exactly what they care about)
  - [ ] Weights & Biases (Staff Solutions Engineer — evaluation infrastructure is their product)
  - [ ] Arize AI (Principal Customer Engineer — observability tooling overlap)

---

## WEEKS 9–13 — Days 61–90: On-Camera + Open Source

**Target:** Two final artifacts that close the remaining corpus gaps: video credibility and multi-contributor codebase participation.

- [ ] Record a 5-minute walkthrough video of the benchmark:
  - Use broadcast framing: studio setup, no "um" cuts, clean audio
  - Show: clone → run → results → leaderboard → interpretation
  - Upload to YouTube (unlisted OK initially), embed in the GitHub README
  - This is the artifact that DevRel and Evangelist roles will screen for; no other SA candidate has on-camera production skills
- [ ] Find one issue in LangChain, LlamaIndex, or Weaviate GitHub repos that you can credibly fix:
  - [ ] Search for issues labeled `good first issue` or `help wanted`
  - [ ] Target: a documentation improvement, a bug fix in test coverage, or a small API ergonomics fix
  - [ ] Open a PR with the fix; be patient — maintainer review can take weeks
  - [ ] Even a merged documentation PR counts — the goal is a commit in a shared codebase under external review
- [ ] Update `cv.md` and LinkedIn with all three new artifacts:
  - [ ] Voice OS API (FastAPI, live URL)
  - [ ] "Kill-List RAG" (published post, HN link + star count)
  - [ ] Newsroom-Agent-Benchmark (GitHub repo, star count, live demo URL)

---

## 90-Day Outcome Checklist

By the end of Day 90, the following should exist:

- [ ] Deployed Python web service live (Voice OS API — FastAPI + Vercel/Modal)
- [ ] Public technical thought-leadership published (Kill-List RAG post + HN launch)
- [ ] Multi-model benchmark with leaderboard (Newsroom-Agent-Benchmark, GitHub + live demo)
- [ ] 5-minute video walkthrough (YouTube)
- [ ] Open-source contribution merged (LangChain / LlamaIndex / Weaviate PR)
- [ ] `cv.md` and LinkedIn updated to reflect all three artifacts

**Per OpenAI o3 direct estimate:** This artifact set is the difference between a $320K ceiling and a $500K+ TC target.

---

## Daily Practice Rhythm

```
Morning (30 min):    Read + exercises (Week 1) / Build (Weeks 2+)
Evening (60 min):    Code — ship something, even if small
Weekly Friday (1h):  Write — document what you built and why
```

**Rule:** Code every day. Even 20 minutes of Python practice compounds faster than 3-hour weekend sessions.
