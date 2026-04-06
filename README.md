# Career-Ops

**[:gb: English](#what-is-this)** | **[:es: Español](#es-versión-en-español)**

> AI-powered job search pipeline built for Claude Code first, and adaptable to Codex through the same file-based workflow. Evaluate offers, generate tailored CVs, scan portals, and track everything with AI agents.

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

---

<p align="center">
  <img src="docs/demo.gif" alt="Career-Ops Demo" width="800">
</p>

## What Is This

Career-Ops turns Claude Code into a full job search command center. Instead of manually tracking applications in a spreadsheet, you get an AI-powered pipeline that:

- **Evaluates offers** with a structured A-F scoring system (10 weighted dimensions)
- **Generates tailored PDFs** -- ATS-optimized CVs customized per job description
- **Scans portals** automatically (Greenhouse, Ashby, Lever, company pages)
- **Processes in batch** -- evaluate 10+ offers in parallel with sub-agents
- **Tracks everything** in a single source of truth with integrity checks

> **Important: This is NOT a spray-and-pray tool.** Career-ops is a filter -- it helps you find the few offers worth your time out of hundreds. The system strongly recommends against applying to anything scoring below 4.0/5. Your time is valuable, and so is the recruiter's. Always review before submitting.

Career-ops is agentic: Claude Code navigates career pages with Playwright, evaluates fit by reasoning about your CV vs the job description (not keyword matching), and adapts your resume per listing.

> **Heads up: the first evaluations won't be great.** The system doesn't know you yet. Feed it context -- your CV, your career story, your proof points, your preferences, what you're good at, what you want to avoid. The more you nurture it, the better it gets. Think of it as onboarding a new recruiter: the first week they need to learn about you, then they become invaluable.

Built by someone who used it to evaluate 740+ job offers, generate 100+ tailored CVs, and land a Head of Applied AI role. [Read the full case study](https://santifer.io/career-ops-system).

## Features

| Feature | Description |
|---------|-------------|
| **Auto-Pipeline** | Paste a URL, get a full evaluation + PDF + tracker entry |
| **6-Block Evaluation** | Role summary, CV match, level strategy, comp research, personalization, interview prep (STAR+R) |
| **Interview Story Bank** | Accumulates STAR+Reflection stories across evaluations -- 5-10 master stories that answer any behavioral question |
| **Negotiation Scripts** | Salary negotiation frameworks, geographic discount pushback, competing offer leverage |
| **ATS PDF Generation** | Keyword-injected CVs with Space Grotesk + DM Sans design |
| **Portal Scanner** | 45+ companies pre-configured (Anthropic, OpenAI, ElevenLabs, Retool, n8n...) + custom queries across Ashby, Greenhouse, Lever, Wellfound |
| **Batch Processing** | Parallel evaluation with `claude`, `codex`, or prepared manual work packets |
| **Market Scan Layer** | Import large job datasets from Greenhouse, Lever, Ashby, and browser-scanned career pages; score them lightly, analyze title/remote/salary/source/freshness trends, and hand the top slice into deep evaluation |
| **Dashboard TUI** | Terminal UI to browse, filter, and sort your pipeline |
| **Human-in-the-Loop** | AI evaluates and recommends, you decide and act. The system never submits an application -- you always have the final call |
| **Pipeline Integrity** | Automated merge, dedup, status normalization, health checks |

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install
npx playwright install chromium   # Required for PDF generation

# 2. Configure
cp config/profile.example.yml config/profile.yml  # Edit with your details
cp templates/portals.example.yml portals.yml       # Customize companies

# 3. Add your CV
# Create cv.md in the project root with your CV in markdown

# 4. Open your agent of choice in this directory
claude   # Claude Code
# or use Codex in this repo and follow AGENTS.md

# 5. Start using
# Claude: paste a job URL or run /career-ops
# Codex: ask naturally, e.g. "Evaluate this role" or "Scan these portals"
```

```bash
# Optional: standalone batch processing
bash batch/batch-runner.sh --agent claude
bash batch/batch-runner.sh --agent codex
bash batch/batch-runner.sh --agent manual
```

```bash
# Optional: market-volume workflow
npm run market:refresh
node market-sync-batch.mjs --dry-run --top 10 --min-rating 2.5
```

> **The system is designed to be customized by the agent working in the repo.** Claude Code is the native path, but Codex can use the same files through `AGENTS.md`, `modes/`, and the YAML/Markdown sources of truth.

See [docs/SETUP.md](docs/SETUP.md) for setup and [docs/CODEX-COMPATIBILITY.md](docs/CODEX-COMPATIBILITY.md) for the Claude/Codex split.

## Usage

Career-ops is a single slash command with multiple modes in Claude Code:

```
/career-ops                → Show all available commands
/career-ops {paste a JD}   → Full auto-pipeline (evaluate + PDF + tracker)
/career-ops scan           → Scan portals for new offers
/career-ops pdf            → Generate ATS-optimized CV
/career-ops batch          → Batch evaluate multiple offers
/career-ops tracker        → View application status
/career-ops apply          → Fill application forms with AI
/career-ops pipeline       → Process pending URLs
/career-ops contacto       → LinkedIn outreach message
/career-ops deep           → Deep company research
/career-ops training       → Evaluate a course/cert
/career-ops project        → Evaluate a portfolio project
```

Or just paste a job URL or description directly in Claude Code. In Codex, use the same intent in natural language and follow the matching mode file.

## How It Works

```
You paste a job URL or description
        │
        ▼
┌──────────────────┐
│  Archetype       │  Classifies: Frontend Product / Frontend SWE / Commerce Shopify / Merchant Platform / Senior Web
│  Detection       │
└────────┬─────────┘
         │
┌────────▼─────────┐
│  A-F Evaluation   │  Match, gaps, comp research, STAR stories
│  (reads cv.md)    │
└────────┬─────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
 Report  PDF  Tracker
 .md   .pdf   .tsv
```

## Market Analysis Workflow

Use this when you want market intelligence from volume before spending time on deep evaluations.

```bash
npm run market:refresh
```

This writes:
- `data/market/jobs.jsonl` — normalized imported job dataset
- `data/market/jobs-scored.jsonl` — lightweight fit scores
- `data/market/market-report.md` — market summary
- `data/market/deep-eval-queue.tsv` — top queue candidates in batch-compatible TSV format

Current direct-source adapters:
- Greenhouse public board API
- Lever public postings API
- Ashby public hosted jobs boards
- Browser-driven fallback for custom career pages and unsupported boards

Important constraint:
- This repo does not ingest LinkedIn directly. The way to approach LinkedIn-like breadth and freshness is aggregating direct ATS sources first, then using browser fallback and manual intake for anything custom.

To move the top slice into the existing deep-eval runner:

```bash
node market-sync-batch.mjs --dry-run --top 10 --min-rating 2.5
node market-sync-batch.mjs --top 10 --min-rating 2.5
```

Optional bulk intake file:
- `data/market/incoming.tsv`
- header format: `id	url	company	title	location	content	notes`

## Pre-configured Portals

The scanner comes with **45+ companies** ready to scan and **19 search queries** across major job boards. Copy `templates/portals.example.yml` to `portals.yml` and add your own:

**AI Labs:** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**Voice AI:** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**AI Platforms:** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Contact Center:** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Enterprise:** Salesforce, Twilio, Gong, Dialpad
**LLMOps:** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automation:** n8n, Zapier, Make.com
**European:** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Job boards searched:** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront

## Dashboard TUI

The built-in terminal dashboard lets you browse your pipeline visually:

```bash
cd dashboard
go build -o career-dashboard .
./career-dashboard
```

Features: 6 filter tabs, 4 sort modes, grouped/flat view, lazy-loaded previews, inline status changes.

## Project Structure

```
career-ops/
├── CLAUDE.md                    # Claude Code instructions
├── AGENTS.md                    # Codex and general-agent instructions
├── market-import.mjs            # Bulk market importer
├── market-score.mjs             # Lightweight market-fit scorer
├── market-analyze.mjs           # Market summary/report generator
├── market-sync-batch.mjs        # Push top market jobs into batch-input.tsv
├── market-lib.mjs               # Shared helpers for market scripts
├── cv.md                        # Your CV (create this)
├── article-digest.md            # Your proof points (optional)
├── config/
│   └── profile.example.yml      # Template for your profile
├── modes/                       # 14 skill modes
│   ├── _shared.md               # Shared context (customize this)
│   ├── oferta.md                # Single evaluation
│   ├── pdf.md                   # PDF generation
│   ├── scan.md                  # Portal scanner
│   ├── batch.md                 # Batch processing
│   └── ...
├── templates/
│   ├── cv-template.html         # ATS-optimized CV template
│   ├── portals.example.yml      # Scanner config template
│   └── states.yml               # Canonical statuses
├── batch/
│   ├── batch-prompt.md          # Self-contained worker prompt
│   └── batch-runner.sh          # Orchestrator script
├── dashboard/                   # Go TUI pipeline viewer
├── data/                        # Your tracking data (gitignored)
│   └── market/                  # Generated market dataset and summaries
├── reports/                     # Evaluation reports (gitignored)
├── output/                      # Generated PDFs (gitignored)
├── fonts/                       # Space Grotesk + DM Sans
├── docs/                        # Setup, customization, architecture
└── examples/                    # Sample CV, report, proof points
```

## Tech Stack

![Claude Code](https://img.shields.io/badge/Claude_Code-000?style=flat&logo=anthropic&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat&logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)
![Go](https://img.shields.io/badge/Go-00ADD8?style=flat&logo=go&logoColor=white)
![Bubble Tea](https://img.shields.io/badge/Bubble_Tea-FF75B5?style=flat&logo=go&logoColor=white)

- **Agent**: Claude Code with custom skills and modes
- **PDF**: Playwright/Puppeteer + HTML template
- **Scanner**: Playwright + Greenhouse API + WebSearch
- **Dashboard**: Go + Bubble Tea + Lipgloss (Catppuccin Mocha theme)
- **Data**: Markdown tables + YAML config + TSV batch files

## Also Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- The portfolio website (santifer.io) with AI chatbot, LLMOps dashboard, and case studies. If you need a portfolio to showcase alongside your job search, fork it and make it yours.

## About the Author

I'm Santiago -- Head of Applied AI, former founder (built and sold a business that still runs with my name on it). I built career-ops to manage my own job search. It worked: I used it to land my current role.

My portfolio and other open source projects → [santifer.io](https://santifer.io)

## License

MIT

---

# :es: Version en Español

## Que es esto

Career-Ops convierte Claude Code en un centro de mando de busqueda de empleo. En vez de trackear aplicaciones en un spreadsheet, tienes un pipeline AI que:

- **Evalua ofertas** con scoring estructurado A-F (10 dimensiones ponderadas)
- **Genera PDFs personalizados** -- CVs ATS-optimizados por oferta
- **Escanea portales** automaticamente (Greenhouse, Ashby, Lever, webs de empresas)
- **Procesa en batch** -- evalua 10+ ofertas en paralelo con sub-agentes
- **Trackea todo** en una fuente de verdad unica con checks de integridad

> **Importante: Esto NO es para spamear empresas.** Career-ops es un filtro -- te ayuda a encontrar las pocas ofertas que merecen tu tiempo entre cientos. El sistema recomienda encarecidamente no aplicar a nada por debajo de 4.0/5. Tu tiempo es valioso, y el del recruiter tambien. Siempre revisa antes de enviar.

> **Aviso: las primeras evaluaciones no seran buenas.** El sistema no te conoce todavia. Dale contexto -- tu CV, tu historia profesional, tus proof points, tus preferencias, en que eres bueno, que quieres evitar. Cuanto mas lo nutras, mejor filtra. Piensa en ello como hacer onboarding a un recruiter nuevo: la primera semana necesita conocerte, luego se vuelve invaluable.

Construido por alguien que lo uso para evaluar 740+ ofertas, generar 100+ CVs personalizados, y conseguir un rol de Head of Applied AI. [Lee el case study completo](https://santifer.io/career-ops).

## Inicio rapido

```bash
# 1. Clonar
git clone https://github.com/santifer/career-ops.git
cd career-ops && npm install

# 2. Configurar
cp config/profile.example.yml config/profile.yml  # Editar con tus datos
cp templates/portals.example.yml portals.yml       # Personalizar empresas

# 3. Añadir tu CV
# Crear cv.md en la raiz del proyecto con tu CV en markdown

# 4. Personalizar con Claude
claude   # Abrir Claude Code en este directorio

# Pidele a Claude que adapte el sistema a ti:
# "Cambia los arquetipos a roles de backend"
# "Traduce los modes a ingles"
# "Añade estas empresas a portals.yml"
# "Actualiza mi perfil con este CV que te pego"

# 5. Usar
# Pega una URL de oferta o ejecuta /career-ops
```

> **El sistema esta diseñado para que Claude lo personalice.** Modes, arquetipos, scoring, scripts de negociacion -- solo pidelo. Claude lee los mismos archivos que usa, asi que sabe exactamente que editar.

Guia completa en [docs/SETUP.md](docs/SETUP.md).

## Portales incluidos

El scanner viene con **45+ empresas** pre-configuradas y **19 queries** en los principales portales de empleo. Copia `templates/portals.example.yml` a `portals.yml` y añade las tuyas:

**AI Labs:** Anthropic, OpenAI, Mistral, Cohere, LangChain, Pinecone
**Voice AI:** ElevenLabs, PolyAI, Parloa, Hume AI, Deepgram, Vapi, Bland AI
**Plataformas AI:** Retool, Airtable, Vercel, Temporal, Glean, Arize AI
**Contact Center:** Ada, LivePerson, Sierra, Decagon, Talkdesk, Genesys
**Enterprise:** Salesforce, Twilio, Gong, Dialpad
**LLMOps:** Langfuse, Weights & Biases, Lindy, Cognigy, Speechmatics
**Automatizacion:** n8n, Zapier, Make.com
**Europa:** Factorial, Attio, Tinybird, Clarity AI, Travelperk

**Portales de empleo:** Ashby, Greenhouse, Lever, Wellfound, Workable, RemoteFront

## Uso

Career-ops es un unico slash command con multiples modos:

```
/career-ops                → Mostrar todos los comandos
/career-ops {pega un JD}   → Pipeline completo (evaluar + PDF + tracker)
/career-ops scan           → Escanear portales
/career-ops pdf            → Generar CV ATS-optimizado
/career-ops batch          → Evaluar ofertas en batch
/career-ops tracker        → Ver estado de aplicaciones
/career-ops apply          → Rellenar formularios con IA
/career-ops pipeline       → Procesar URLs pendientes
/career-ops contacto       → Mensaje LinkedIn outreach
/career-ops deep           → Research profundo de empresa
```

O simplemente pega una URL o descripcion de oferta -- career-ops la detecta y ejecuta el pipeline completo.

## Tambien Open Source

- **[cv-santiago](https://github.com/santifer/cv-santiago)** -- El portfolio (santifer.io) con chatbot IA, dashboard LLMOps y case studies. Si necesitas un portfolio para acompañar tu busqueda de empleo, echale un vistazo.

## Documentacion

- [SETUP.md](docs/SETUP.md) -- Guia de instalacion
- [CUSTOMIZATION.md](docs/CUSTOMIZATION.md) -- Como personalizar
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) -- Como funciona el sistema

## Let's Connect

[![Website](https://img.shields.io/badge/santifer.io-000?style=for-the-badge&logo=safari&logoColor=white)](https://santifer.io)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://linkedin.com/in/santifer)
[![Email](https://img.shields.io/badge/Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:hola@santifer.io)
